import { createHash } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { canPurchase } from '../catalog/catalog.service.js';

export interface CartView { version: number; items: Array<{ variantId: string; quantity: number; productName: string; variantLabel: string; priceVnd: number | null; restricted18: boolean; available: boolean }> }
export interface MergeInput { key: string; items: Array<{ variantId: string; quantity: number }> }
const invalid = (code: string): never => { throw new UnprocessableEntityException({ code }); };
const conflict = (code: string): never => { throw new ConflictException({ code }); };
const quantityValid = (value: number) => Number.isInteger(value) && value >= 1 && value <= 99;
const idValid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

@Injectable()
export class CartService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService) {}
  private async cart(tx: Prisma.TransactionClient, actor: Actor) {
    await this.identity.assertActiveActor(tx, actor);
    return tx.cart.upsert({ where: { userId: actor.id }, create: { userId: actor.id }, update: {} });
  }
  private async view(tx: Prisma.TransactionClient, cartId: string): Promise<CartView> {
    const cart = await tx.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: { include: { variant: { include: { product: true } } }, orderBy: { variantId: 'asc' } } } });
    const settings = (await tx.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
    return { version: cart.version, items: cart.items.map(item => ({ variantId: item.variantId, quantity: item.quantity,
      productName: item.variant.product.name, restricted18: item.variant.product.restricted18, variantLabel: item.variant.label,
      priceVnd: item.variant.priceVnd === null || !Number.isSafeInteger(Number(item.variant.priceVnd)) ? null : Number(item.variant.priceVnd),
      available: canPurchase(item.variant.product, item.variant, settings) && item.variant.stock >= item.quantity })) };
  }
  async get(actor: Actor): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    return withTransaction(this.db, async tx => this.view(tx, (await this.cart(tx, actor)).id));
  }
  async set(actor: Actor, variantId: string, quantity: number, version: number): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    if (!idValid(variantId) || !quantityValid(quantity) || !Number.isInteger(version) || version < 1) invalid('INVALID_CART_ITEM');
    return withTransaction(this.db, async tx => {
      const cart = await this.cart(tx, actor);
      if (cart.version !== version) conflict('VERSION_CONFLICT');
      const existing = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
      if (!existing && await tx.cartItem.count({ where: { cartId: cart.id } }) >= 50) invalid('CART_TOO_LARGE');
      const target = await tx.variant.findUnique({ where: { id: variantId }, select: { productId: true } });
      if (!target) invalid('INVALID_VARIANT');
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${target!.productId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const variant = await tx.variant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
      const settings = (await tx.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
      if (!canPurchase(variant.product, variant, settings)) conflict('NOT_PURCHASABLE');
      await tx.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId } }, create: { cartId: cart.id, variantId, quantity }, update: { quantity } });
      await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      return this.view(tx, cart.id);
    });
  }
  async remove(actor: Actor, variantId: string, version: number): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    if (!idValid(variantId) || !Number.isInteger(version) || version < 1) invalid('INVALID_CART_ITEM');
    return withTransaction(this.db, async tx => {
      const cart = await this.cart(tx, actor);
      if (cart.version !== version) conflict('VERSION_CONFLICT');
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
      await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      return this.view(tx, cart.id);
    });
  }
  async merge(actor: Actor, input: MergeInput): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    if (!idValid(input.key) || !Array.isArray(input.items) || input.items.length > 50 ||
      input.items.some(item => !idValid(item.variantId) || !quantityValid(item.quantity)) ||
      new Set(input.items.map(item => item.variantId)).size !== input.items.length) invalid('INVALID_MERGE');
    const canonical = [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId));
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    return withTransaction(this.db, async tx => {
      const cart = await this.cart(tx, actor);
      const replay = await tx.cartMerge.findUnique({ where: { userId_key: { userId: actor.id, key: input.key } } });
      if (replay) {
        if (replay.payloadDigest !== digest) conflict('MERGE_KEY_CONFLICT');
        return replay.resultJson as unknown as CartView;
      }
      const old = await tx.cartItem.findMany({ where: { cartId: cart.id } });
      const combined = new Map(old.map(item => [item.variantId, item.quantity]));
      for (const item of canonical) combined.set(item.variantId, (combined.get(item.variantId) ?? 0) + item.quantity);
      if (combined.size > 50 || [...combined.values()].some(quantity => !quantityValid(quantity))) invalid('CART_OVERFLOW');
      const variants = await tx.variant.findMany({ where: { id: { in: canonical.map(item => item.variantId) } }, select: { id: true, productId: true } });
      if (variants.length !== canonical.length) invalid('INVALID_VARIANT');
      for (const productId of [...new Set(variants.map(v => v.productId))].sort())
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      for (const item of canonical) await tx.$queryRaw`SELECT id FROM variants WHERE id = ${item.variantId}::uuid FOR UPDATE`;
      const loaded = await tx.variant.findMany({ where: { id: { in: canonical.map(item => item.variantId) } }, include: { product: true } });
      const settings = (await tx.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
      if (loaded.some(variant => !canPurchase(variant.product, variant, settings))) conflict('NOT_PURCHASABLE');
      for (const item of canonical) await tx.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
        create: { cartId: cart.id, variantId: item.variantId, quantity: combined.get(item.variantId)! }, update: { quantity: combined.get(item.variantId)! } });
      if (canonical.length) await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      const result = await this.view(tx, cart.id);
      await tx.cartMerge.create({ data: { userId: actor.id, key: input.key, payloadDigest: digest, resultJson: result as unknown as Prisma.InputJsonValue } });
      return result;
    });
  }
}
