import { createHash } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { canPurchase } from '../catalog/catalog.service.js';

export interface CartLineInput { variantId: string; quantity: number; optionId?: string | null }
export interface CartView { version: number; items: Array<{ variantId: string; optionId: string | null; optionGroupLabel: string | null; optionLabel: string | null; quantity: number; productName: string; variantLabel: string; priceVnd: number | null; restricted18: boolean; available: boolean }> }
export interface MergeInput { key: string; items: CartLineInput[] }
const invalid = (code: string): never => { throw new UnprocessableEntityException({ code }); };
const conflict = (code: string): never => { throw new ConflictException({ code }); };
const quantityValid = (value: number) => Number.isInteger(value) && value >= 1 && value <= 99;
const idValid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const selectionKey = (optionId: string | null | undefined) => optionId?.toLowerCase() ?? 'none';
const lineKey = (item: CartLineInput) => `${item.variantId}:${selectionKey(item.optionId)}`;

@Injectable()
export class CartService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService) {}
  private async cart(tx: Prisma.TransactionClient, actor: Actor) {
    await this.identity.assertActiveActor(tx, actor);
    return tx.cart.upsert({ where: { userId: actor.id }, create: { userId: actor.id }, update: {} });
  }
  private async view(tx: Prisma.TransactionClient, cartId: string): Promise<CartView> {
    const cart = await tx.cart.findUniqueOrThrow({ where: { id: cartId }, include: { items: { include: { choice: { include: { group: true } }, variant: { include: { product: { include: { choiceGroup: true } } } } }, orderBy: [{ variantId: 'asc' }, { selectionKey: 'asc' }] } } });
    const settings = (await tx.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
    return { version: cart.version, items: cart.items.map(item => ({ variantId: item.variantId, optionId: item.choiceId,
      optionGroupLabel: item.choice?.group.label ?? null, optionLabel: item.choice?.label ?? null, quantity: item.quantity,
      productName: item.variant.product.name, restricted18: item.variant.product.restricted18, variantLabel: item.variant.label,
      priceVnd: item.variant.priceVnd === null || !Number.isSafeInteger(Number(item.variant.priceVnd)) ? null : Number(item.variant.priceVnd),
      available: canPurchase(item.variant.product, item.variant, settings) && item.variant.stock >= item.quantity &&
        (!item.variant.product.choiceGroup?.active || !!item.choice && item.choice.active && item.choice.group.active) })) };
  }
  async get(actor: Actor): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    return withTransaction(this.db, async tx => this.view(tx, (await this.cart(tx, actor)).id));
  }
  async set(actor: Actor, variantId: string, quantity: number, version: number, optionId: string | null = null): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    if (!idValid(variantId) || (optionId !== null && !idValid(optionId)) || !quantityValid(quantity) || !Number.isInteger(version) || version < 1) invalid('INVALID_CART_ITEM');
    return withTransaction(this.db, async tx => {
      const cart = await this.cart(tx, actor);
      if (cart.version !== version) conflict('VERSION_CONFLICT');
      const key = selectionKey(optionId);
      const where = { cartId_variantId_selectionKey: { cartId: cart.id, variantId, selectionKey: key } };
      const existing = await tx.cartItem.findUnique({ where });
      if (!existing && await tx.cartItem.count({ where: { cartId: cart.id } }) >= 50) invalid('CART_TOO_LARGE');
      const target = await tx.variant.findUnique({ where: { id: variantId }, select: { productId: true } });
      if (!target) invalid('INVALID_VARIANT');
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${target!.productId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const variant = await tx.variant.findUniqueOrThrow({ where: { id: variantId }, include: { product: { include: { choiceGroup: true } } } });
      const settings = (await tx.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
      if (!canPurchase(variant.product, variant, settings)) conflict('NOT_PURCHASABLE');
      let choice = null;
      if (variant.product.choiceGroup?.active) {
        if (!optionId) invalid('PRODUCT_CHOICE_REQUIRED');
        choice = await tx.productChoice.findFirst({ where: { id: optionId!, groupId: variant.product.choiceGroup.id, active: true } });
        if (!choice) conflict('PRODUCT_CHOICE_UNAVAILABLE');
      } else if (optionId) invalid('PRODUCT_CHOICE_UNAVAILABLE');
      await tx.cartItem.upsert({ where, create: { cartId: cart.id, variantId, quantity, choiceId: choice?.id ?? null, selectionKey: key }, update: { quantity, choiceId: choice?.id ?? null } });
      await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      return this.view(tx, cart.id);
    });
  }
  async remove(actor: Actor, variantId: string, version: number, optionId: string | null = null): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    if (!idValid(variantId) || (optionId !== null && !idValid(optionId)) || !Number.isInteger(version) || version < 1) invalid('INVALID_CART_ITEM');
    return withTransaction(this.db, async tx => {
      const cart = await this.cart(tx, actor);
      if (cart.version !== version) conflict('VERSION_CONFLICT');
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, variantId, selectionKey: selectionKey(optionId) } });
      await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      return this.view(tx, cart.id);
    });
  }
  async merge(actor: Actor, input: MergeInput): Promise<CartView> {
    if (!actor) throw new UnauthorizedException();
    if (!idValid(input.key) || !Array.isArray(input.items) || input.items.length > 50 ||
      input.items.some(item => !idValid(item.variantId) || (item.optionId != null && !idValid(item.optionId)) || !quantityValid(item.quantity)) ||
      new Set(input.items.map(lineKey)).size !== input.items.length) invalid('INVALID_MERGE');
    const canonical = [...input.items].sort((a, b) => lineKey(a).localeCompare(lineKey(b)));
    const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
    return withTransaction(this.db, async tx => {
      const cart = await this.cart(tx, actor);
      const replay = await tx.cartMerge.findUnique({ where: { userId_key: { userId: actor.id, key: input.key } } });
      if (replay) {
        if (replay.payloadDigest !== digest) conflict('MERGE_KEY_CONFLICT');
        return replay.resultJson as unknown as CartView;
      }
      const old = await tx.cartItem.findMany({ where: { cartId: cart.id } });
      const combined = new Map(old.map(item => [`${item.variantId}:${item.selectionKey}`, item.quantity]));
      for (const item of canonical) combined.set(lineKey(item), (combined.get(lineKey(item)) ?? 0) + item.quantity);
      if (combined.size > 50 || [...combined.values()].some(quantity => !quantityValid(quantity))) invalid('CART_OVERFLOW');
      const variants = await tx.variant.findMany({ where: { id: { in: [...new Set(canonical.map(item => item.variantId))] } }, select: { id: true, productId: true } });
      if (variants.length !== new Set(canonical.map(item => item.variantId)).size) invalid('INVALID_VARIANT');
      for (const productId of [...new Set(variants.map(v => v.productId))].sort()) await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      for (const item of canonical) await tx.$queryRaw`SELECT id FROM variants WHERE id = ${item.variantId}::uuid FOR UPDATE`;
      const loaded = await tx.variant.findMany({ where: { id: { in: variants.map(v => v.id) } }, include: { product: { include: { choiceGroup: true } } } });
      const byVariant = new Map(loaded.map(item => [item.id, item]));
      const settings = (await tx.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
      if (loaded.some(variant => !canPurchase(variant.product, variant, settings))) conflict('NOT_PURCHASABLE');
      for (const item of canonical) {
        const variant = byVariant.get(item.variantId)!;
        if (variant.product.choiceGroup?.active) {
          if (!item.optionId) invalid('PRODUCT_CHOICE_REQUIRED');
          const choice = await tx.productChoice.findFirst({ where: { id: item.optionId!, groupId: variant.product.choiceGroup.id, active: true } });
          if (!choice) conflict('PRODUCT_CHOICE_UNAVAILABLE');
        } else if (item.optionId) invalid('PRODUCT_CHOICE_UNAVAILABLE');
      }
      for (const item of canonical) {
        const key = selectionKey(item.optionId);
        const where = { cartId_variantId_selectionKey: { cartId: cart.id, variantId: item.variantId, selectionKey: key } };
        await tx.cartItem.upsert({ where, create: { cartId: cart.id, variantId: item.variantId, choiceId: item.optionId, selectionKey: key, quantity: combined.get(lineKey(item))! }, update: { quantity: combined.get(lineKey(item))! } });
      }
      if (canonical.length) await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      const result = await this.view(tx, cart.id);
      await tx.cartMerge.create({ data: { userId: actor.id, key: input.key, payloadDigest: digest, resultJson: result as unknown as Prisma.InputJsonValue } });
      return result;
    });
  }
}
