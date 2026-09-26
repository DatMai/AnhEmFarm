import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { CartService } from '../src/cart/cart.service.js';
import { QuoteService } from '../src/checkout/quote.service.js';
import { CheckoutService } from '../src/checkout/checkout.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import type { OrderStatus } from '../src/generated/prisma/client.js';
const actor = (id: string, role: 'ADMIN' | 'CUSTOMER' = 'CUSTOMER') => ({ id, role, authVersion: 1 });
const states: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED'];
const allowed = ['PENDING:CONFIRMED', 'PENDING:CANCELLED', 'CONFIRMED:SHIPPING', 'CONFIRMED:CANCELLED', 'SHIPPING:DELIVERED', 'SHIPPING:RETURNED'];
describe('order ownership and fulfillment', () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });
  async function place(s: Scenario, quantity = 1, userId = s.customer.id) {
    const a = actor(userId); const cart = h.resolve(CartService);
    await cart.set(a, s.variant.id, quantity, (await cart.get(a)).version);
    const q = await h.resolve(QuoteService).create(a, { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, ageConfirmed: false });
    return (await h.resolve(CheckoutService).place(a, q.id, randomUUID())).order;
  }
  it.each(states.flatMap(from => states.map(to => [from, to] as const)))('%s -> %s respects explicit admin rules', async (from, to) => {
    const s = await seedScenario(h.db); const o = await place(s);
    await h.db.order.update({ where: { id: o.id }, data: { status: from } });
    const input = { to, reason: 'Test operation', version: 1, operationKey: randomUUID(),
      ...(to === 'SHIPPING' ? { delivery: { mode: 'STORE' as const } } : {}),
      ...(to === 'RETURNED' ? { received: true, restock: [{ variantId: s.variant.id, quantity: 1 }] } : {}) };
    const result = h.resolve(OrdersService).transition(actor(s.admin.id, 'ADMIN'), o.id, input);
    if (allowed.includes(`${from}:${to}`)) expect(await result).toMatchObject({ status: to, version: 2 });
    else await expect(result).rejects.toMatchObject({ status: 409 });
  });
  it('scopes reads and cancellation by owner and permits only pending customer cancellation', async () => {
    const s = await seedScenario(h.db); const o = await place(s); const service = h.resolve(OrdersService);
    await expect(service.get(actor(s.otherCustomer.id), o.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.transition(actor(s.otherCustomer.id), o.id, { to: 'CANCELLED', reason: 'Requested', version: 1, operationKey: randomUUID() })).rejects.toMatchObject({ status: 404 });
    expect((await service.list(actor(s.otherCustomer.id), {})).items).toHaveLength(0);
    const own = await service.list(actor(s.customer.id), {}); expect(own.total).toBe(1); expect(own.items[0].id).toBe(o.id);
    await expect(service.transition(actor(s.customer.id), o.id, { to: 'CONFIRMED', version: 1, operationKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await expect(service.transition(actor(s.customer.id), o.id, { to: 'CANCELLED', version: 1, operationKey: randomUUID() })).rejects.toMatchObject({ status: 422 });
    const cancel = { to: 'CANCELLED' as const, reason: 'Requested', version: 1, operationKey: randomUUID() };
    const results = await Promise.all([service.transition(actor(s.customer.id), o.id, cancel), service.transition(actor(s.admin.id, 'ADMIN'), o.id, cancel)]);
    expect(results[0]).toEqual(results[1]);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(5);
    expect(await h.db.inventoryMovement.count({ where: { operationKey: `${o.id}:cancel:${s.variant.id}` } })).toBe(1);
    await expect(service.transition(actor(s.customer.id), o.id, { ...cancel, reason: 'Changed' })).rejects.toMatchObject({ status: 409 });
    await expect(service.transition(actor(s.customer.id), o.id, { ...cancel, operationKey: randomUUID(), version: 2 })).rejects.toMatchObject({ status: 409 });
    const second = await place(s);
    await service.transition(actor(s.admin.id, 'ADMIN'), second.id, { to: 'CONFIRMED', version: 1, operationKey: randomUUID() });
    await expect(service.transition(actor(s.customer.id), second.id, { ...cancel, version: 2 })).rejects.toMatchObject({ status: 409 });
  });
  it('validates shipping, physical receipt, and complete bounded restock; keeps damaged quantities out', async () => {
    const s = await seedScenario(h.db); const o = await place(s, 3); const service = h.resolve(OrdersService); const a = actor(s.admin.id, 'ADMIN');
    await service.transition(a, o.id, { to: 'CONFIRMED', version: 1, operationKey: randomUUID() });
    for (const delivery of [undefined, { mode: 'CARRIER', carrier: 'Test carrier' }]) {
      await expect(service.transition(a, o.id, { to: 'SHIPPING', version: 2, operationKey: randomUUID(), delivery } as any)).rejects.toMatchObject({ status: 422 });
    }
    await service.transition(a, o.id, { to: 'SHIPPING', version: 2, operationKey: randomUUID(), delivery: { mode: 'CARRIER', carrier: 'Test carrier', tracking: 'TEST-123' } });
    for (const patch of [{}, { received: false }, { received: true, restock: [] }, { received: true, restock: [{ variantId: s.variant.id, quantity: 4 }] }, { received: true, restock: [{ variantId: randomUUID(), quantity: 1 }] }, { received: true, restock: [{ variantId: s.variant.id, quantity: 1 }, { variantId: s.variant.id, quantity: 1 }] }]) {
      await expect(service.transition(a, o.id, { to: 'RETURNED', reason: 'Failed delivery', version: 3, operationKey: randomUUID(), ...patch } as any)).rejects.toMatchObject({ status: 422 });
    }
    const input = { to: 'RETURNED' as const, reason: 'One damaged unit', received: true, restock: [{ variantId: s.variant.id, quantity: 2 }], version: 3, operationKey: randomUUID() };
    const returned = await service.transition(a, o.id, input);
    expect(returned).toMatchObject({ status: 'RETURNED', version: 4 });
    expect(await service.transition(a, o.id, input)).toEqual(returned);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(4);
  });
  it('requires delivered COD, records one collection, and audits correction without replacing first collectedAt', async () => {
    const s = await seedScenario(h.db); const o = await place(s); const service = h.resolve(OrdersService); const a = actor(s.admin.id, 'ADMIN');
    const input = { state: 'COLLECTED' as const, version: 1, operationKey: randomUUID() };
    await expect(service.collect(a, o.id, input)).rejects.toMatchObject({ status: 409 });
    await expect(service.collect(actor(s.customer.id), o.id, input)).rejects.toMatchObject({ status: 403 });
    await service.transition(a, o.id, { to: 'CONFIRMED', version: 1, operationKey: randomUUID() });
    await service.transition(a, o.id, { to: 'SHIPPING', delivery: { mode: 'STORE' }, version: 2, operationKey: randomUUID() });
    const delivered = await service.transition(a, o.id, { to: 'DELIVERED', version: 3, operationKey: randomUUID() }); expect(delivered.deliveredAt).toBeTruthy();
    const collect = { ...input, version: 4 };
    const result = await service.collect(a, o.id, collect);
    expect(await service.collect(a, o.id, collect)).toEqual(result);
    await expect(service.collect(a, o.id, { ...collect, reason: 'Changed' })).rejects.toMatchObject({ status: 409 });
    await expect(service.collect(a, o.id, { state: 'DUE', version: 5, operationKey: randomUUID() })).rejects.toMatchObject({ status: 422 });
    await service.collect(a, o.id, { state: 'DUE', reason: 'Entry mistake', version: 5, operationKey: randomUUID() });
    expect((await service.collect(a, o.id, { state: 'COLLECTED', version: 6, operationKey: randomUUID() })).collectedAt).toBe(result.collectedAt);
    expect(await h.db.auditLog.count({ where: { targetId: o.id, action: 'ORDER_COLLECTION_CHANGED' } })).toBe(3);
    expect(await service.collect(a, o.id, collect)).toEqual(result);
  });
  it('rejects stale versions and revoked or spoofed admins, and derives 24h attention without mutation', async () => {
    const s = await seedScenario(h.db); const o = await place(s); const service = h.resolve(OrdersService);
    await h.db.order.update({ where: { id: o.id }, data: { createdAt: new Date(Date.now() - 25 * 3600000) } });
    expect(await service.get(actor(s.customer.id), o.id)).toMatchObject({ attention: true, status: 'PENDING', version: 1 });
    await expect(service.transition(actor(s.admin.id, 'ADMIN'), o.id, { to: 'CONFIRMED', version: 9, operationKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    await expect(service.collect(actor(s.customer.id, 'ADMIN'), o.id, { state: 'COLLECTED', version: 1, operationKey: randomUUID() })).rejects.toMatchObject({ status: 403 });
    await h.db.user.update({ where: { id: s.admin.id }, data: { status: 'SUSPENDED' } });
    await expect(service.get(actor(s.admin.id, 'ADMIN'), o.id)).rejects.toMatchObject({ status: 401 });
    await expect(service.transition(actor(s.admin.id, 'ADMIN'), o.id, { to: 'CONFIRMED', version: 1, operationKey: randomUUID() })).rejects.toMatchObject({ status: 401 });
  });
  it('HTTP enforces admin role, strict input, owner privacy and bounded pagination', async () => {
    const s = await seedScenario(h.db); const o = await place(s); const c = h.client();
    await c.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password });
    expect((await c.request('GET', '/api/v1/admin/orders')).status).toBe(403);
    expect((await c.request('GET', '/api/v1/orders?pageSize=101')).status).toBe(422);
    expect((await c.request('GET', `/api/v1/orders/${o.id}`)).body.totalVnd).toBe(130000);
    expect((await c.request('POST', `/api/v1/orders/${o.id}/cancel`, { reason: 'Requested', version: 1, operationKey: randomUUID(), recipient: 'Tampered' })).status).toBe(422);
    expect((await c.request('POST', `/api/v1/orders/${o.id}/cancel`, { reason: 'Requested', version: 1, operationKey: randomUUID() })).status).toBe(200);
  });
  it('exposes admin lifecycle routes with versioned responses and filterable pages', async () => {
    const s = await seedScenario(h.db); const o = await place(s); const c = h.client();
    await c.request('POST', '/api/v1/auth/login', { email: s.admin.email, password: s.admin.password });
    const page = await c.request('GET', '/api/v1/admin/orders?status=PENDING&pageSize=2');
    expect(page.status).toBe(200); expect(page.body.items.length).toBeLessThanOrEqual(2);
    expect(page.body.items.every((i: { status: string }) => i.status === 'PENDING')).toBe(true);
    expect((await c.request('GET', `/api/v1/admin/orders/${o.id}`)).body.version).toBe(1);
    expect((await c.request('POST', `/api/v1/admin/orders/${o.id}/transitions`, { to: 'CONFIRMED', version: 1, operationKey: randomUUID() })).body.version).toBe(2);
    expect((await c.request('POST', `/api/v1/admin/orders/${o.id}/transitions`, { to: 'SHIPPING', delivery: { mode: 'STORE' }, version: 2, operationKey: randomUUID() })).status).toBe(200);
    expect((await c.request('POST', `/api/v1/admin/orders/${o.id}/transitions`, { to: 'DELIVERED', version: 3, operationKey: randomUUID() })).status).toBe(200);
    const collected = await c.request('POST', `/api/v1/admin/orders/${o.id}/collection`, { state: 'COLLECTED', version: 4, operationKey: randomUUID() });
    expect(collected.status).toBe(200); expect(collected.body).toMatchObject({ version: 5, collectionState: 'COLLECTED' });
  });
  it('records zero restock for damaged SKUs and replays canonically after restart', async () => {
    const s = await seedScenario(h.db); const o = await place(s); const service = h.resolve(OrdersService); const a = actor(s.admin.id, 'ADMIN');
    const second = await h.db.variant.create({ data: { productId: s.product.id, sku: `ZERO-${randomUUID()}`, label: 'Test damaged SKU', packDetails: 'Test', priceVnd: 100n, stock: 2 } });
    // A second immutable shipped line, independent of the live cart and catalog.
    await h.db.orderItem.create({ data: { orderId: o.id, variantId: second.id, name: 'Test', sku: second.sku, label: second.label, priceVnd: 100n, quantity: 2 } });
    await h.db.order.update({ where: { id: o.id }, data: { status: 'SHIPPING' } });
    const restock = [{ variantId: s.variant.id, quantity: 1 }, { variantId: second.id, quantity: 0 }];
    const input = { to: 'RETURNED' as const, received: true, reason: 'Damaged second SKU', version: 1, operationKey: randomUUID(), restock };
    await expect(service.transition(a, o.id, { ...input, received: false })).rejects.toMatchObject({ status: 422 });
    await expect(service.transition(a, o.id, { ...input, received: undefined })).rejects.toMatchObject({ status: 422 });
    const result = await service.transition(a, o.id, input);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: second.id } })).stock).toBe(2);
    expect(await h.db.inventoryMovement.findUnique({ where: { operationKey: `${o.id}:return:${second.id}` } })).toMatchObject({ delta: 0 });
    await h.close(); h = await startHarness();
    expect(await h.resolve(OrdersService).transition(a, o.id, { ...input, restock: [...restock].reverse() })).toEqual(result);
    expect(await h.db.orderEvent.count({ where: { orderId: o.id, operationKey: input.operationKey } })).toBe(1);
  });
  it('rolls back restock, status, version and history when audit insertion fails', async () => {
    const s = await seedScenario(h.db); const o = await place(s);
    await h.db.$executeRawUnsafe(`CREATE FUNCTION fail_test_order_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."targetId" = '${o.id}' THEN RAISE EXCEPTION 'injected order audit failure'; END IF; RETURN NEW; END $$`);
    await h.db.$executeRawUnsafe('CREATE TRIGGER fail_test_order_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_test_order_audit()');
    try { await expect(h.resolve(OrdersService).transition(actor(s.customer.id), o.id, { to: 'CANCELLED', reason: 'Requested', version: 1, operationKey: randomUUID() })).rejects.toThrow('injected order audit failure'); }
    finally { await h.db.$executeRawUnsafe('DROP TRIGGER fail_test_order_audit ON audit_logs'); await h.db.$executeRawUnsafe('DROP FUNCTION fail_test_order_audit()'); }
    expect(await h.db.order.findUnique({ where: { id: o.id } })).toMatchObject({ status: 'PENDING', version: 1 });
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(4);
    expect(await h.db.orderEvent.count({ where: { orderId: o.id } })).toBe(1);
    expect(await h.db.inventoryMovement.count({ where: { operationKey: `${o.id}:cancel:${s.variant.id}` } })).toBe(0);
  });
  it('serializes distinct administrators collecting COD concurrently and rejects changed state on a fresh key', async () => {
    const s = await seedScenario(h.db); const o = await place(s);
    await h.db.user.update({ where: { id: s.otherCustomer.id }, data: { role: 'ADMIN' } });
    await h.db.order.update({ where: { id: o.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    const service = h.resolve(OrdersService); const input = { state: 'COLLECTED' as const, version: 1, operationKey: randomUUID() };
    const results = await Promise.all([service.collect(actor(s.admin.id, 'ADMIN'), o.id, input), service.collect(actor(s.otherCustomer.id, 'ADMIN'), o.id, input)]);
    expect(results[0]).toEqual(results[1]);
    await expect(service.collect(actor(s.admin.id, 'ADMIN'), o.id, { ...input, version: 2, operationKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(await h.db.auditLog.count({ where: { targetId: o.id, action: 'ORDER_COLLECTION_CHANGED' } })).toBe(1);
  });
  it('serializes concurrent cancellation, checkout and stock adjustment without lost updates', async () => {
    const s = await seedScenario(h.db); const o = await place(s); const service = h.resolve(OrdersService);
    const a = actor(s.otherCustomer.id); const cart = h.resolve(CartService);
    await cart.set(a, s.variant.id, 1, (await cart.get(a)).version);
    const q = await h.resolve(QuoteService).create(a, { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, ageConfirmed: false });
    const results = await Promise.allSettled([
      service.transition(actor(s.customer.id), o.id, { to: 'CANCELLED', reason: 'Requested', version: 1, operationKey: randomUUID() }),
      h.resolve(CheckoutService).place(a, q.id, randomUUID()),
      h.resolve(InventoryService).adjust(actor(s.admin.id, 'ADMIN'), s.variant.id, { delta: 2, reason: 'Count correction', version: 2, operationKey: randomUUID() }),
    ]);
    expect(results[0].status).toBe('fulfilled'); expect(results[1].status).toBe('fulfilled');
    if (results[2].status === 'rejected') expect(results[2].reason).toMatchObject({ status: 409 });
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(results[2].status === 'fulfilled' ? 6 : 4);
  });
});
