import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { Prisma, type ProductStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { AuditService } from '../admin/audit.service.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import type { z } from 'zod';
import type { productQuery, productCreate, productPatch, variantCreate, variantPatch, categoryCreate, categoryPatch, adminListQuery } from './catalog.schemas.js';

export interface Page<T> { items: T[]; page: number; pageSize: number; total: number }
export interface ProductSummary { id: string; slug: string; name: string; category: { id: string; slug: string; name: string };
  images: Array<{ id: string; objectKey: string; mime: string; width: number; height: number; illustrative: boolean }>;
  startingPriceVnd: number | null; purchasable: boolean; confirmed: boolean }
export interface ProductDetail extends ProductSummary { description: string; restricted18: boolean;
  variants: Array<{ id: string; sku: string; label: string; packDetails: string; priceVnd: number | null; inStock: boolean; saleEnabled: boolean }> }

export function canPurchase(product: { status: ProductStatus; confirmed: boolean; restricted18: boolean },
  variant: { saleEnabled: boolean; priceVnd: bigint | null; packDetails: string; stock: number },
  settings: { salesEnabled: boolean; wineEnabled: boolean }): boolean {
  return settings.salesEnabled && product.status === 'PUBLISHED' && product.confirmed && variant.saleEnabled &&
    variant.priceVnd !== null && variant.priceVnd > 0n && variant.priceVnd <= 1_000_000_000n &&
    variant.packDetails.trim().length > 0 && variant.stock > 0 && (!product.restricted18 || settings.wineEnabled);
}

const productInclude = { category: true, variants: { orderBy: { id: 'asc' as const } },
  media: { orderBy: [{ sortPosition: 'asc' as const }, { id: 'asc' as const }], include: { media: true } } };
type LoadedProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
const safeNumber = (value: bigint | null): number | null => {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Unsafe catalog amount');
  return number;
};
const uniqueConflict = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    throw new ConflictException({ code: 'UNIQUE_CONFLICT' });
  throw error;
};
const versionConflict = (): never => { throw new ConflictException({ code: 'VERSION_CONFLICT' }); };
const missing = (): never => { throw new NotFoundException({ code: 'NOT_FOUND' }); };

@Injectable()
export class CatalogService {
  async shippingZones(page: number, pageSize: number) {
    const where = { enabled: true, feeVnd: { gte: 0n } };
    const [rows, total] = await Promise.all([this.db.shippingZone.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, displayName: true, feeVnd: true } }), this.db.shippingZone.count({ where })]);
    return { items: rows.map(z => ({ ...z, feeVnd: safeNumber(z.feeVnd) })), page, pageSize, total };
  }

  constructor(private readonly db: PrismaService, private readonly audit: AuditService,
    private readonly identity: IdentityService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  private async assertAdmin(tx: Prisma.TransactionClient, actor: Actor): Promise<void> {
    await this.identity.assertActiveActor(tx, actor);
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new ForbiddenException();
  }
  private async lockProductVariants(tx: Prisma.TransactionClient, productId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM variants WHERE "productId" = ${productId}::uuid ORDER BY id FOR UPDATE`;
  }
  private async settings() {
    const row = (await this.db.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
    return { ...row, salesEnabled: row.salesEnabled && (this.config.mode !== 'production' || this.config.salesEnabled) };
  }
  private serialize(product: LoadedProduct, settings: { salesEnabled: boolean; wineEnabled: boolean }): ProductDetail {
    const sale = product.variants.filter(variant => canPurchase(product, variant, settings));
    const prices = product.variants.filter(variant => product.confirmed && variant.saleEnabled &&
      variant.priceVnd !== null && variant.priceVnd > 0n && variant.packDetails.trim().length > 0 && variant.stock > 0)
      .map(variant => variant.priceVnd!);
    return {
      id: product.id, slug: product.slug, name: product.name,
      category: { id: product.category.id, slug: product.category.slug, name: product.category.name },
      images: product.media.map(link => ({ id: link.media.id, objectKey: link.media.objectKey, mime: link.media.mime,
        width: link.media.width, height: link.media.height, illustrative: link.media.illustrative })),
      startingPriceVnd: safeNumber(prices.length ? prices.reduce((a, b) => a < b ? a : b) : null),
      purchasable: sale.length > 0, description: product.description, confirmed: product.confirmed,
      restricted18: product.restricted18,
      variants: product.variants.map(variant => ({ id: variant.id, sku: variant.sku, label: variant.label,
        packDetails: variant.packDetails, priceVnd: safeNumber(variant.priceVnd), inStock: variant.stock > 0,
        saleEnabled: variant.saleEnabled })),
    };
  }
  private summary(detail: ProductDetail): ProductSummary {
    const { id, slug, name, category, images, startingPriceVnd, purchasable, confirmed } = detail;
    return { id, slug, name, category, images, startingPriceVnd, purchasable, confirmed };
  }
  async list(query: z.infer<typeof productQuery>): Promise<Page<ProductSummary>> {
    const search = query.q?.trim();
    const literal = search?.replace(/[\\%_]/g, '\\$&');
    const conditions: Prisma.Sql[] = [Prisma.sql`p.status = 'PUBLISHED'`];
    if (query.category) conditions.push(Prisma.sql`c.slug = ${query.category}`);
    if (literal) conditions.push(Prisma.sql`(p.name ILIKE ${`%${literal}%`} ESCAPE '\\' OR p.description ILIKE ${`%${literal}%`} ESCAPE '\\')`);
    const where = Prisma.join(conditions, ' AND ');
    const order: Record<string, Prisma.Sql> = {
      name: Prisma.sql`p.name ASC, p.id ASC`,
      price_asc: Prisma.sql`MIN(v."priceVnd") FILTER (WHERE p.confirmed AND v."saleEnabled" AND v.stock > 0 AND v."priceVnd" > 0 AND length(trim(v."packDetails")) > 0) ASC NULLS LAST, p.id ASC`,
      price_desc: Prisma.sql`MIN(v."priceVnd") FILTER (WHERE p.confirmed AND v."saleEnabled" AND v.stock > 0 AND v."priceVnd" > 0 AND length(trim(v."packDetails")) > 0) DESC NULLS LAST, p.id ASC`,
      newest: Prisma.sql`p."createdAt" DESC, p.id ASC`,
    };
    const rows = await this.db.$queryRaw<Array<{ id: string; total: bigint }>>(Prisma.sql`
      SELECT p.id, COUNT(*) OVER() AS total FROM products p
      JOIN categories c ON c.id = p."categoryId" LEFT JOIN variants v ON v."productId" = p.id
      WHERE ${where} GROUP BY p.id ORDER BY ${order[query.sort]}
      LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
    const products = await this.db.product.findMany({ where: { id: { in: rows.map(row => row.id) } }, include: productInclude });
    const byId = new Map(products.map(product => [product.id, product]));
    const settings = await this.settings();
    const items = rows.map(row => this.summary(this.serialize(byId.get(row.id)!, settings)));
    let total = rows.length ? Number(rows[0].total) : 0;
    if (!rows.length) {
      const count = await this.db.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS total FROM products p JOIN categories c ON c.id = p."categoryId"
        WHERE ${where}`);
      total = Number(count[0]?.total ?? 0n);
    }
    return { items, page: query.page, pageSize: query.pageSize, total };
  }
  async detail(slug: string): Promise<ProductDetail> {
    const product = await this.db.product.findUnique({ where: { slug }, include: productInclude });
    if (!product || product.status !== 'PUBLISHED') return missing();
    return this.serialize(product, await this.settings());
  }
  async categories(page: number, pageSize: number): Promise<Page<{ id: string; slug: string; name: string }>> {
    const [items, total] = await Promise.all([
      this.db.category.findMany({ where: { products: { some: { status: 'PUBLISHED' } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, slug: true, name: true } }),
      this.db.category.count({ where: { products: { some: { status: 'PUBLISHED' } } } }),
    ]);
    return { items, page, pageSize, total };
  }
  async adminCategories(page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.db.category.findMany({ orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.db.category.count(),
    ]);
    return { items, page, pageSize, total };
  }
  async adminList(query: z.infer<typeof adminListQuery>) {
    const where: Prisma.ProductWhereInput = { ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: query.q, mode: 'insensitive' } } } }] } : {}) };
    const [products, total, settings] = await Promise.all([
      this.db.product.findMany({ where, include: productInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.db.product.count({ where }), this.settings(),
    ]);
    return { items: products.map(product => this.adminSerialize(product, settings)), page: query.page, pageSize: query.pageSize, total };
  }
  private adminSerialize(product: LoadedProduct, settings: { salesEnabled: boolean; wineEnabled: boolean }) {
    return { ...this.serialize(product, settings), status: product.status, version: product.version,
      categoryId: product.categoryId, createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString(),
      variants: product.variants.map(variant => ({ id: variant.id, sku: variant.sku, label: variant.label,
        packDetails: variant.packDetails, priceVnd: safeNumber(variant.priceVnd), stock: variant.stock,
        saleEnabled: variant.saleEnabled, version: variant.version, commercialVersion: variant.commercialVersion })) };
  }
  async adminDetail(id: string) {
    const product = await this.db.product.findUnique({ where: { id }, include: productInclude });
    if (!product) return missing();
    return this.adminSerialize(product, await this.settings());
  }
  async createCategory(actor: Actor, input: z.infer<typeof categoryCreate>) {
    try { return await withTransaction(this.db, async tx => {
      await this.assertAdmin(tx, actor);
      const created = await tx.category.create({ data: input });
      await this.audit.record(tx, { actorId: actor.id, action: 'CATEGORY_CREATED', targetType: 'Category', targetId: created.id, changes: input });
      return created;
    }); } catch (error) { return uniqueConflict(error); }
  }
  async updateCategory(actor: Actor, id: string, input: z.infer<typeof categoryPatch>) {
    try { return await withTransaction(this.db, async tx => {
      await this.assertAdmin(tx, actor);
      await tx.$queryRaw`SELECT id FROM categories WHERE id = ${id}::uuid FOR UPDATE`;
      const previous = await tx.category.findUnique({ where: { id } });
      if (!previous) return missing();
      if (previous.version !== input.expectedVersion) return versionConflict();
      const { expectedVersion, ...changes } = input;
      const updated = await tx.category.update({ where: { id }, data: { ...changes, version: { increment: 1 } } });
      await this.audit.record(tx, { actorId: actor.id, action: 'CATEGORY_UPDATED', targetType: 'Category', targetId: id, changes });
      return updated;
    }); } catch (error) { return uniqueConflict(error); }
  }
  private async validatePublication(tx: Prisma.TransactionClient, product: { id: string; status: ProductStatus; confirmed: boolean }) {
    if (product.status !== 'PUBLISHED' || !product.confirmed) return;
    const variants = await tx.variant.findMany({ where: { productId: product.id } });
    if (!variants.some(variant => variant.priceVnd !== null && variant.priceVnd > 0n && variant.packDetails.trim() && variant.saleEnabled)) {
      throw new UnprocessableEntityException({ code: 'PUBLISH_VALIDATION_FAILED' });
    }
  }
  async createProduct(actor: Actor, input: z.infer<typeof productCreate>) {
    try { return await withTransaction(this.db, async tx => {
      await this.assertAdmin(tx, actor);
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new UnprocessableEntityException({ code: 'INVALID_CATEGORY' });
      const created = await tx.product.create({ data: input });
      await this.validatePublication(tx, created);
      await this.audit.record(tx, { actorId: actor.id, action: 'PRODUCT_CREATED', targetType: 'Product', targetId: created.id, changes: input });
      return created;
    }); } catch (error) { return uniqueConflict(error); }
  }
  async updateProduct(actor: Actor, id: string, input: z.infer<typeof productPatch>) {
    try { return await withTransaction(this.db, async tx => {
      await this.assertAdmin(tx, actor);
      await this.lockProductVariants(tx, id);
      const previous = await tx.product.findUnique({ where: { id } });
      if (!previous) return missing();
      if (previous.version !== input.expectedVersion) return versionConflict();
      const { expectedVersion, ...changes } = input;
      if (changes.categoryId && !(await tx.category.findUnique({ where: { id: changes.categoryId } })))
        throw new UnprocessableEntityException({ code: 'INVALID_CATEGORY' });
      const proposed = { ...previous, ...changes };
      await this.validatePublication(tx, proposed);
      const updated = await tx.product.update({ where: { id }, data: { ...changes, version: { increment: 1 } } });
      await this.audit.record(tx, { actorId: actor.id, action: 'PRODUCT_UPDATED', targetType: 'Product', targetId: id, changes });
      return updated;
    }); } catch (error) { return uniqueConflict(error); }
  }
  async addImage(actor: Actor, productId: string, mediaId: string) {
    try { return await withTransaction(this.db, async tx => {
      await this.assertAdmin(tx, actor);
      await this.lockProductVariants(tx, productId);
      if (!(await tx.product.findUnique({ where: { id: productId } }))) return missing();
      if (!(await tx.media.findUnique({ where: { id: mediaId } }))) return missing();
      const last = await tx.productMedia.aggregate({ where: { productId }, _max: { sortPosition: true } });
      const linked = await tx.productMedia.create({ data: { productId, mediaId, sortPosition: (last._max.sortPosition ?? -1) + 1 } });
      await this.audit.record(tx, { actorId: actor.id, action: 'PRODUCT_IMAGE_ADDED', targetType: 'Product', targetId: productId, changes: { mediaId } });
      return linked;
    }); } catch (error) { return uniqueConflict(error); }
  }
  async createVariant(actor: Actor, productId: string, input: z.infer<typeof variantCreate>) {
    try { return await withTransaction(this.db, async tx => {
      await this.assertAdmin(tx, actor);
      await this.lockProductVariants(tx, productId);
      if (!(await tx.product.findUnique({ where: { id: productId } }))) return missing();
      const variant = await tx.variant.create({ data: { ...input, priceVnd: input.priceVnd === null ? null : BigInt(input.priceVnd), productId } });
      await this.audit.record(tx, { actorId: actor.id, action: 'VARIANT_CREATED', targetType: 'Variant', targetId: variant.id, changes: input });
      return this.variantResponse(variant);
    }); } catch (error) { return uniqueConflict(error); }
  }
  private variantResponse(variant: { id: string; productId: string; sku: string; label: string; packDetails: string;
    priceVnd: bigint | null; stock: number; saleEnabled: boolean; version: number; commercialVersion: number }) {
    return { ...variant, priceVnd: safeNumber(variant.priceVnd) };
  }
  async updateVariant(actor: Actor, id: string, input: z.infer<typeof variantPatch>) {
    try { return await withTransaction(this.db, async tx => {
      await this.assertAdmin(tx, actor);
      const target = await tx.variant.findUnique({ where: { id }, select: { productId: true } });
      if (!target) return missing();
      await this.lockProductVariants(tx, target.productId);
      const previous = await tx.variant.findUnique({ where: { id } });
      if (!previous) return missing();
      if (previous.version !== input.expectedVersion) return versionConflict();
      const { expectedVersion, ...changes } = input;
      const commercial = ['priceVnd', 'packDetails', 'label', 'saleEnabled'].some(key => key in changes);
      const updated = await tx.variant.update({ where: { id }, data: { ...changes,
        priceVnd: changes.priceVnd === undefined ? undefined : changes.priceVnd === null ? null : BigInt(changes.priceVnd),
        version: { increment: 1 }, ...(commercial ? { commercialVersion: { increment: 1 } } : {}) } });
      await this.audit.record(tx, { actorId: actor.id, action: 'VARIANT_UPDATED', targetType: 'Variant', targetId: id, changes });
      return this.variantResponse(updated);
    }); } catch (error) { return uniqueConflict(error); }
  }
}
