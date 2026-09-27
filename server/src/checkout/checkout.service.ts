import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { canPurchase } from '../catalog/catalog.service.js';
import { OutboxService } from '../email/outbox.service.js';
import { parseBody, uuidSchema } from '../http/schemas.js';
import type { QuoteView } from './quote.service.js';

export interface OrderView {
  id: string; status: string; collectionState: string;
  items: Array<{ variantId: string; optionGroupLabel: string | null; optionLabel: string | null; name: string; sku: string; label: string; priceVnd: number; quantity: number }>;
  recipient: Prisma.JsonValue; subtotalVnd: number; shippingVnd: number; totalVnd: number; createdAt: string;
  events: Array<{ id: string; fromStatus: string | null; toStatus: string; reason: string | null; createdAt: string }>;
}
export const placementReplayed = Symbol('placementReplayed');
export interface Placement { order: OrderView; cartPreserved: boolean; [placementReplayed]?: boolean }
const conflict = (code: string): never => { throw new ConflictException({ code }); };
const safe = (value: bigint): number => { const n = Number(value); if (!Number.isSafeInteger(n)) conflict('TOTAL_TOO_LARGE'); return n; };
const json = (value: unknown) => value as Prisma.InputJsonValue;

@Injectable()
export class CheckoutService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService, private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private async replay(tx: Prisma.TransactionClient, orderId: string): Promise<Placement> {
    const event = await tx.orderEvent.findUniqueOrThrow({ where: { orderId_operationKey: { orderId, operationKey: 'placement' } } });
    const result = event.resultJson as unknown as Placement;
    Object.defineProperty(result, placementReplayed, { value: true });
    return result;
  }

  async place(actor: Actor, quoteId: string, idempotencyKey: string): Promise<Placement> {
    if (!actor) throw new UnauthorizedException();
    quoteId = parseBody(uuidSchema, quoteId).toLowerCase();
    idempotencyKey = parseBody(uuidSchema, idempotencyKey).toLowerCase();
    const digest = createHash('sha256').update(JSON.stringify({ quoteId })).digest('hex');
    // All customer mutations acquire this same actor lock first. Together with the
    // unique keys this serializes both same-key and same-quote contenders.
    return withTransaction(this.db, async tx => {
      await this.identity.assertActiveActor(tx, actor);
      const keyed = await tx.orderPlacementKey.findUnique({ where: { userId_key: { userId: actor.id, key: idempotencyKey } } });
      if (keyed) {
        if (keyed.requestDigest !== digest) conflict('IDEMPOTENCY_CONFLICT');
        return this.replay(tx, keyed.orderId);
      }
      const quoteRef = await tx.checkoutQuote.findFirst({ where: { id: quoteId, userId: actor.id } });
      if (!quoteRef) throw new NotFoundException({ code: 'NOT_FOUND' });
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
      if (!user.verifiedAt) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED' });
      await tx.$queryRaw`SELECT id FROM store_settings ORDER BY id LIMIT 1 FOR UPDATE`;
      const settings = await tx.storeSettings.findFirst({ orderBy: { id: 'asc' } });
      await tx.$queryRaw`SELECT id FROM shipping_zones WHERE id = ${quoteRef.shippingZoneId}::uuid FOR UPDATE`;
      const zone = await tx.shippingZone.findUniqueOrThrow({ where: { id: quoteRef.shippingZoneId } });
      await tx.$queryRaw`SELECT id FROM carts WHERE "userId" = ${actor.id}::uuid FOR UPDATE`;
      const cart = await tx.cart.findUnique({ where: { userId: actor.id } });
      await tx.$queryRaw`SELECT id FROM checkout_quotes WHERE id = ${quoteId}::uuid FOR UPDATE`;
      const quote = await tx.checkoutQuote.findUniqueOrThrow({ where: { id: quoteId } });
      const existing = await tx.order.findUnique({ where: { quoteId } });
      if (existing) {
        await tx.orderPlacementKey.create({ data: { userId: actor.id, key: idempotencyKey, requestDigest: digest, orderId: existing.id } });
        return this.replay(tx, existing.id);
      }
      if (quote.status !== 'OPEN' || quote.expiresAt <= new Date()) conflict('QUOTE_EXPIRED');
      if (!settings?.salesEnabled || (this.config.mode === 'production' && !this.config.salesEnabled)) conflict('SALES_DISABLED');
      if (!zone.enabled || zone.version !== quote.shippingZoneVersion || zone.feeVnd !== quote.feeVnd) conflict('SHIPPING_CHANGED');
      const lines = quote.linesJson as unknown as QuoteView['items'];
      const ids = [...new Set(lines.map(line => line.variantId))].sort();
      const refs = await tx.variant.findMany({ where: { id: { in: ids } }, select: { productId: true } });
      // Match catalog mutations: product rows before sorted variants, including
      // variant insertion. Re-read all commercial data only after these locks.
      for (const productId of [...new Set(refs.map(ref => ref.productId))].sort())
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      for (const id of ids) await tx.$queryRaw`SELECT id FROM variants WHERE id = ${id}::uuid FOR UPDATE`;
      const variants = await tx.variant.findMany({ where: { id: { in: ids } }, include: { product: { include: { choiceGroup: true } } } });
      if (quote.expiresAt <= new Date()) conflict('QUOTE_EXPIRED');
      const byId = new Map(variants.map(v => [v.id, v]));
      const choices = new Map((await tx.productChoice.findMany({ where: { id: { in: lines.flatMap(line => line.optionId ? [line.optionId] : []) } }, include: { group: true } })).map(choice => [choice.id, choice]));
      const quantities = new Map<string, number>();
      let subtotal = 0n;
      for (const line of lines) {
        const v = byId.get(line.variantId);
        if (!v || v.commercialVersion !== line.commercialVersion || v.product.version !== line.productVersion || v.priceVnd !== BigInt(line.priceVnd)) conflict('QUOTE_CHANGED');
        quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
        if (v!.product.choiceGroup?.active) {
          const choice = line.optionId ? choices.get(line.optionId) : undefined;
          if (!choice || !choice.active || !choice.group.active || choice.groupId !== v!.product.choiceGroup.id || choice.group.productId !== v!.product.id ||
            choice.group.label !== line.optionGroupLabel || choice.label !== line.optionLabel) conflict('QUOTE_CHANGED');
        } else if (line.optionId) conflict('QUOTE_CHANGED');
        if (v!.stock <= 0) conflict('OUT_OF_STOCK');
        if (!canPurchase(v!.product, v!, settings!) || (v!.product.restricted18 && !quote.ageConfirmed)) conflict('QUOTE_CHANGED');
        subtotal += v!.priceVnd! * BigInt(line.quantity);
      }
      for (const [variantId, quantity] of quantities) if (byId.get(variantId)!.stock < quantity) conflict('OUT_OF_STOCK');
      const total = subtotal + zone.feeVnd;
      const totals = { subtotalVnd: safe(subtotal), shippingVnd: safe(zone.feeVnd), totalVnd: safe(total) };
      for (const [variantId, quantity] of quantities) {
        const changed = await tx.variant.updateMany({ where: { id: variantId, stock: { gte: quantity } }, data: { stock: { decrement: quantity }, version: { increment: 1 } } });
        if (changed.count !== 1) conflict('OUT_OF_STOCK');
      }
      const cartPreserved = !cart || cart.version !== quote.cartVersion;
      const items = lines.map(line => ({ variantId: line.variantId, optionGroupLabel: line.optionGroupLabel, optionLabel: line.optionLabel,
        selectionKey: line.optionId?.toLowerCase() ?? 'none', name: line.productName, sku: line.sku, label: line.variantLabel, priceVnd: line.priceVnd, quantity: line.quantity }));
      const order = await tx.order.create({ data: { userId: actor.id, quoteId, idempotencyKey, requestDigest: digest,
        subtotalVnd: subtotal, shippingVnd: zone.feeVnd, totalVnd: total, recipientJson: json(quote.addressJson), cartPreserved,
        items: { create: items.map(item => ({ ...item, priceVnd: BigInt(item.priceVnd) })) } } });
      await tx.orderPlacementKey.create({ data: { userId: actor.id, key: idempotencyKey, requestDigest: digest, orderId: order.id } });
      const event = await tx.orderEvent.create({ data: { orderId: order.id, actorId: actor.id, toStatus: 'PENDING', detailsJson: {}, operationKey: 'placement', payloadDigest: digest, resultJson: {} } });
      const result: Placement = { order: { id: order.id, status: order.status, collectionState: order.collectionState, items, recipient: quote.addressJson,
        ...totals, createdAt: order.createdAt.toISOString(), events: [{ id: event.id, fromStatus: null, toStatus: 'PENDING', reason: null, createdAt: event.createdAt.toISOString() }] }, cartPreserved };
      await tx.orderEvent.update({ where: { id: event.id }, data: { resultJson: json(result) } });
      for (const [variantId, quantity] of quantities) await tx.inventoryMovement.create({ data: { variantId, delta: -quantity, actorId: actor.id,
        orderId: order.id, reason: 'COD order placed', operationKey: `order:${order.id}:${variantId}`, payloadDigest: digest, resultJson: { orderId: order.id } } });
      await tx.checkoutQuote.update({ where: { id: quoteId }, data: { status: 'USED', version: { increment: 1 } } });
      if (!cartPreserved) {
        await tx.cartItem.deleteMany({ where: { cartId: cart!.id, variantId: { in: ids } } });
        await tx.cart.update({ where: { id: cart!.id }, data: { version: { increment: 1 } } });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'ORDER_PLACED', targetType: 'Order', targetId: order.id, changesJson: { status: 'PENDING', totalVnd: totals.totalVnd } } });
      await this.outbox.enqueue(tx, { dedupeKey: `order-created:${order.id}`, recipient: user.email, template: 'ORDER_CREATED', payload: { orderId: order.id, totalVnd: totals.totalVnd } });
      return result;
    });
  }
}
