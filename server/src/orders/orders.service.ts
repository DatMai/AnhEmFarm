import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import type { OrderView as PlacedOrderView } from '../checkout/checkout.service.js';
import { parseBody, uuidSchema } from '../http/schemas.js';
import { applyMovement } from '../inventory/inventory.service.js';
import { OutboxService } from '../email/outbox.service.js';
import { adminTransitions, transitionSchema, collectionSchema, orderFiltersSchema, type Transition, type Collection, type OrderFilters } from './order-rules.js';

export interface OrderView extends PlacedOrderView {
  version: number; deliveredAt: string | null; collectedAt: string | null; tracking: string | null; attention: boolean;
}
const conflict = (code: string): never => { throw new ConflictException({ code }); };
const invalid = (code: string): never => { throw new UnprocessableEntityException({ code }); };
const json = (value: unknown) => value as Prisma.InputJsonValue;
const safe = (value: bigint): number => { const n = Number(value); if (!Number.isSafeInteger(n)) conflict('TOTAL_TOO_LARGE'); return n; };
const includes = { items: { orderBy: [{ variantId: 'asc' as const }, { selectionKey: 'asc' as const }] }, events: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] } };
type LoadedOrder = Prisma.OrderGetPayload<{ include: typeof includes }>;
function view(o: LoadedOrder): OrderView {
  return { id: o.id, status: o.status, collectionState: o.collectionState, version: o.version,
    recipient: o.recipientJson, subtotalVnd: safe(o.subtotalVnd), shippingVnd: safe(o.shippingVnd), totalVnd: safe(o.totalVnd),
    createdAt: o.createdAt.toISOString(), deliveredAt: o.deliveredAt?.toISOString() ?? null, collectedAt: o.collectedAt?.toISOString() ?? null,
    tracking: o.tracking, attention: o.status === 'PENDING' && o.createdAt.getTime() <= Date.now() - 24 * 3600000,
    items: o.items.map(i => ({ variantId: i.variantId, optionGroupLabel: i.optionGroupLabel, optionLabel: i.optionLabel, name: i.name, sku: i.sku, label: i.label, priceVnd: safe(i.priceVnd), quantity: i.quantity })),
    events: o.events.map(e => ({ id: e.id, fromStatus: e.fromStatus, toStatus: e.toStatus, reason: e.reason, createdAt: e.createdAt.toISOString() })) };
}

@Injectable()
export class OrdersService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService,
    private readonly outbox: OutboxService) {}
  private async authorize(tx: Prisma.TransactionClient, actor: Actor, adminOnly = false) {
    if (!actor) throw new UnauthorizedException();
    await this.identity.assertActiveActor(tx, actor);
    const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { role: true } });
    if (adminOnly && user.role !== 'ADMIN') throw new ForbiddenException();
    return user.role;
  }
  private async owned(tx: Prisma.TransactionClient, actor: Actor, role: string, id: string, lock = false): Promise<LoadedOrder> {
    // Scope before locking to avoid exposing or blocking unrelated customer orders.
    const where = { id, ...(role === 'ADMIN' ? {} : { userId: actor.id }) };
    if (!await tx.order.findFirst({ where, select: { id: true } })) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (lock) await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    const order = await tx.order.findFirst({ where, include: includes });
    if (!order) throw new NotFoundException({ code: 'NOT_FOUND' });
    return order;
  }
  async list(actor: Actor, filters: OrderFilters = {}) {
    const f = parseBody(orderFiltersSchema, filters);
    return withTransaction(this.db, async tx => {
      const role = await this.authorize(tx, actor);
      const createdAt: Prisma.DateTimeFilter | undefined = f.from || f.to ? {
        ...(f.from ? { gte: new Date(`${f.from}T00:00:00+07:00`) } : {}),
        ...(f.to ? { lt: new Date(new Date(`${f.to}T00:00:00+07:00`).getTime() + 86400000) } : {}),
      } : undefined;
      const searchConditions: Prisma.Sql[] = [];
      if (role !== 'ADMIN') searchConditions.push(Prisma.sql`orders."userId" = ${actor.id}`);
      if (f.status) searchConditions.push(Prisma.sql`orders.status = ${f.status}`);
      if (f.attentionOnly) searchConditions.push(Prisma.sql`orders.status = 'PENDING' AND orders."createdAt" <= ${new Date(Date.now() - 24 * 3600000)}`);
      if (f.collectionState) searchConditions.push(Prisma.sql`orders."collectionState" = ${f.collectionState}`);
      if (createdAt?.gte) searchConditions.push(Prisma.sql`orders."createdAt" >= ${createdAt.gte}`);
      if (createdAt?.lt) searchConditions.push(Prisma.sql`orders."createdAt" < ${createdAt.lt}`);
      if (f.q) searchConditions.push(Prisma.sql`(
            (${/^[0-9a-f-]{1,36}$/i.test(f.q)} AND left(orders.id::text, char_length(${f.q})) = lower(${f.q}))
            OR position(lower(${f.q}) in lower(users.name)) > 0
            OR position(lower(${f.q}) in lower(users.email)) > 0
            OR position(lower(${f.q}) in lower(coalesce(orders.tracking, ''))) > 0
          )`);
      const searchWhere = f.q ? Prisma.join(searchConditions, ' AND ') : Prisma.empty;
      const matchingOrders = f.q ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT orders.id
        FROM orders
        JOIN users ON users.id = orders."userId"
        WHERE ${searchWhere}
        ORDER BY orders."createdAt" ${f.attentionOnly ? Prisma.raw('ASC') : Prisma.raw('DESC')}, orders.id ${f.attentionOnly ? Prisma.raw('ASC') : Prisma.raw('DESC')}
        LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}
      ` : [];
      const searchTotal = f.q ? await tx.$queryRaw<Array<{ total: bigint }>>`
        SELECT count(*) AS total
        FROM orders
        JOIN users ON users.id = orders."userId"
        WHERE ${searchWhere}
      ` : null;
      const where: Prisma.OrderWhereInput = {
        ...(role === 'ADMIN' ? {} : { userId: actor.id }),
        ...(f.attentionOnly ? { status: 'PENDING', createdAt: { lte: new Date(Date.now() - 24 * 3600000) } } : f.status ? { status: f.status } : {}),
        ...(f.collectionState ? { collectionState: f.collectionState } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(f.q ? { id: { in: matchingOrders.map(order => order.id) } } : {}),
      };
      const direction = f.attentionOnly ? 'asc' : 'desc';
      const items = await tx.order.findMany({ where, include: includes, orderBy: [{ createdAt: direction }, { id: direction }], skip: f.q ? 0 : (f.page - 1) * f.pageSize, take: f.pageSize });
      return { items: items.map(view), page: f.page, pageSize: f.pageSize, total: searchTotal ? Number(searchTotal[0].total) : await tx.order.count({ where }) };
    });
  }
  async get(actor: Actor, id: string): Promise<OrderView> {
    id = parseBody(uuidSchema, id).toLowerCase();
    return withTransaction(this.db, async tx => view(await this.owned(tx, actor, await this.authorize(tx, actor), id)));
  }
  async transition(actor: Actor, id: string, input: Transition): Promise<OrderView> {
    return this.mutate(actor, id, 'transition', parseBody(transitionSchema, input));
  }
  async collect(actor: Actor, id: string, input: Collection): Promise<OrderView> {
    return this.mutate(actor, id, 'collection', parseBody(collectionSchema, input));
  }
  private async mutate(actor: Actor, id: string, kind: 'transition' | 'collection', input: Transition | Collection): Promise<OrderView> {
    id = parseBody(uuidSchema, id).toLowerCase();
    // Schema parsing establishes field order; restock entries are a set keyed by SKU.
    if ('restock' in input && input.restock) input.restock.sort((a, b) => a.variantId.localeCompare(b.variantId));
    const { operationKey, ...payload } = input;
    const digest = createHash('sha256').update(JSON.stringify({ kind, ...payload })).digest('hex');
    return withTransaction(this.db, async tx => {
      const role = await this.authorize(tx, actor, kind === 'collection');
      const order = await this.owned(tx, actor, role, id, true);
      if (kind === 'transition' && role !== 'ADMIN' && (input as Transition).to !== 'CANCELLED') throw new ForbiddenException();
      const existing = await tx.orderEvent.findUnique({ where: { orderId_operationKey: { orderId: id, operationKey } } });
      if (existing) {
        if (existing.payloadDigest !== digest) conflict('OPERATION_CONFLICT');
        return existing.resultJson as unknown as OrderView;
      }
      if (input.version !== order.version) conflict('VERSION_CONFLICT');
      let changes: Prisma.OrderUpdateInput;
      if (kind === 'transition') {
        const t = input as Transition;
        if (!adminTransitions[order.status].includes(t.to) || (role !== 'ADMIN' && order.status !== 'PENDING')) conflict('INVALID_TRANSITION');
        if ((t.to === 'CANCELLED' || t.to === 'RETURNED') && !t.reason) invalid('REASON_REQUIRED');
        if ((t.to === 'SHIPPING') !== (t.delivery !== undefined)) invalid('INVALID_DELIVERY');
        if (t.to !== 'RETURNED' && (t.received !== undefined || t.restock !== undefined)) invalid('INVALID_RETURN');
        if (t.to === 'RETURNED') {
          const itemTotals = new Map<string, number>();
          for (const item of order.items) itemTotals.set(item.variantId, (itemTotals.get(item.variantId) ?? 0) + item.quantity);
          if (t.received !== true || !t.restock || t.restock.length !== itemTotals.size) invalid('INVALID_RETURN');
          const restock = t.restock!;
          if (new Set(restock.map(r => r.variantId)).size !== restock.length || restock.some(r => !itemTotals.has(r.variantId) || r.quantity > itemTotals.get(r.variantId)!)) invalid('INVALID_RESTOCK');
        }
        if (t.to === 'CANCELLED' || t.to === 'RETURNED') {
          // No product data changes here; stock-only writers lock sorted variants after order.
          const itemTotals = new Map<string, number>();
          for (const item of order.items) itemTotals.set(item.variantId, (itemTotals.get(item.variantId) ?? 0) + item.quantity);
          const variantIds = [...itemTotals.keys()].sort();
          for (const variantId of variantIds) await tx.$queryRaw`SELECT id FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
          for (const variantId of variantIds) {
            const quantity = t.to === 'CANCELLED' ? itemTotals.get(variantId)! : t.restock!.find(r => r.variantId === variantId)!.quantity;
            const key = `${id}:${t.to === 'CANCELLED' ? 'cancel' : 'return'}:${variantId}`;
            if (quantity > 0) await applyMovement(tx, { variantId, delta: quantity, actorId: actor.id, orderId: id, reason: t.reason!, operationKey: key });
            else await tx.inventoryMovement.create({ data: { variantId, delta: 0, actorId: actor.id, orderId: id, reason: t.reason!, operationKey: key, payloadDigest: digest, resultJson: { quantity: 0 } } });
          }
        }
        changes = { status: t.to, ...(t.to === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
          ...(t.delivery ? { tracking: t.delivery.mode === 'CARRIER' ? t.delivery.tracking : null } : {}) };
      } else {
        const c = input as Collection;
        if (order.status !== 'DELIVERED') conflict('DELIVERY_REQUIRED');
        if (c.state === order.collectionState) conflict('COLLECTION_UNCHANGED');
        if (c.state === 'DUE' && !c.reason) invalid('REASON_REQUIRED');
        changes = { collectionState: c.state, ...(c.state === 'COLLECTED' && !order.collectedAt ? { collectedAt: new Date() } : {}) };
      }
      await tx.order.update({ where: { id }, data: { ...changes, version: { increment: 1 } } });
      const event = await tx.orderEvent.create({ data: { orderId: id, actorId: actor.id, fromStatus: order.status,
        toStatus: kind === 'transition' ? (input as Transition).to : order.status, reason: input.reason, detailsJson: json({ kind, ...payload }), operationKey, payloadDigest: digest, resultJson: {} } });
      if (kind === 'transition') {
        const owner = await tx.user.findUniqueOrThrow({ where: { id: order.userId }, select: { email: true } });
        const transition = input as Transition;
        if (transition.to === 'PENDING') throw new Error('Unexpected pending order transition');
        await this.outbox.enqueue(tx, {
          dedupeKey: `order-status:${event.id}`, recipient: owner.email, template: 'ORDER_STATUS_CHANGED',
          payload: { orderId: id, eventId: event.id, status: transition.to,
            tracking: transition.to === 'SHIPPING' && transition.delivery?.mode === 'CARRIER' ? transition.delivery.tracking : null },
        });
      }
      await tx.auditLog.create({ data: { actorId: actor.id, action: kind === 'transition' ? 'ORDER_TRANSITIONED' : 'ORDER_COLLECTION_CHANGED', targetType: 'Order', targetId: id,
        changesJson: kind === 'transition' ? { from: order.status, to: (input as Transition).to, version: order.version + 1 } : { from: order.collectionState, to: (input as Collection).state, version: order.version + 1 } } });
      const result = view(await tx.order.findUniqueOrThrow({ where: { id }, include: includes }));
      await tx.orderEvent.update({ where: { id: event.id }, data: { resultJson: json(result) } });
      return result;
    });
  }
}
