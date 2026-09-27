import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { CartService } from '../src/cart/cart.service.js';
import { QuoteService } from '../src/checkout/quote.service.js';
import { EmailWorker, RecordingEmailTransport } from '../src/email/email.worker.js';
import { CheckoutService } from '../src/checkout/checkout.service.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { CatalogService } from '../src/catalog/catalog.service.js';

const actor = (id: string) => ({ id, role: 'CUSTOMER' as const, authVersion: 1 });
describe('atomic COD placement', () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });
  async function quote(s: Scenario, userId = s.customer.id) {
    const a = actor(userId); const cart = h.resolve(CartService);
    await cart.set(a, s.variant.id, 1, (await cart.get(a)).version);
    return h.resolve(QuoteService).create(a, { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, ageConfirmed: false });
  }
  it('sells the final unit exactly once in ten independent PostgreSQL races', async () => {
    for (let i = 0; i < 10; i++) {
      const s = await seedScenario(h.db);
      await h.db.variant.update({ where: { id: s.variant.id }, data: { stock: 1 } });
      const qa = await quote(s); const qb = await quote(s, s.otherCustomer.id);
      const results = await Promise.allSettled([h.resolve(CheckoutService).place(actor(s.customer.id), qa.id, randomUUID()), h.resolve(CheckoutService).place(actor(s.otherCustomer.id), qb.id, randomUUID())]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409, response: { code: 'OUT_OF_STOCK' } } });
      expect(await h.db.order.count({ where: { quoteId: { in: [qa.id, qb.id] } } })).toBe(1);
      expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(0);
      expect(await h.db.inventoryMovement.count({ where: { variantId: s.variant.id } })).toBe(1);
      const order = await h.db.order.findFirstOrThrow({ where: { quoteId: { in: [qa.id, qb.id] } } });
      expect(await h.db.emailOutbox.count({ where: { dedupeKey: `order-created:${order.id}` } })).toBe(1);
    }
  });
  it('snapshots two choices of one variant into immutable COD order lines and its receipt', async () => {
    const s = await seedScenario(h.db);
    const group = await h.db.productChoiceGroup.create({ data: { productId: s.product.id, label: 'Sweetness', choices: { create: [
      { label: 'Original & <classic>', sortPosition: 0 }, { label: 'Less sweet', sortPosition: 1 },
    ] } } });
    const choices = await h.db.productChoice.findMany({ where: { groupId: group.id }, orderBy: { sortPosition: 'asc' } });
    const a = actor(s.customer.id); const cart = h.resolve(CartService);
    const empty = await cart.get(a);
    await cart.set(a, s.variant.id, 1, empty.version, choices[0].id);
    await cart.set(a, s.variant.id, 2, (await cart.get(a)).version, choices[1].id);
    const q = await h.resolve(QuoteService).create(a, { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, ageConfirmed: false });
    const placed = await h.resolve(CheckoutService).place(a, q.id, randomUUID());
    expect(placed.order.items.map(item => [item.optionGroupLabel, item.optionLabel]).sort()).toEqual([
      ['Sweetness', 'Less sweet'], ['Sweetness', 'Original & <classic>'],
    ]);
    expect(placed.order.items).toHaveLength(2);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(2);
    const updated = await h.resolve(CatalogService).updateChoiceGroup({ id: s.admin.id, role: 'ADMIN', authVersion: 1 }, s.product.id, {
      expectedVersion: 1, label: 'Flavor', choices: [{ id: choices[0].id, label: 'New label', active: true }, { id: choices[1].id, label: 'Less sweet', active: false }],
    });
    expect(updated.version).toBe(2);
    expect((await h.resolve(OrdersService).get(a, placed.order.id)).items.map(item => item.optionLabel).sort()).toEqual(['Less sweet', 'Original & <classic>']);
    await h.db.emailOutbox.update({ where: { dedupeKey: `order-created:${placed.order.id}` }, data: { availableAt: new Date(0) } });
    await h.resolve(EmailWorker).tick();
    const sent = h.resolve(RecordingEmailTransport).messages.find(message => message.to === s.customer.email && message.text.includes(placed.order.id));
    expect(sent?.text).toContain('Original & <classic>');
    expect(sent?.html).toContain('Original &amp; &lt;classic&gt;');
  });
  it('rejects a quote after an admin changes its selected choice without consuming stock', async () => {
    const s = await seedScenario(h.db);
    const group = await h.db.productChoiceGroup.create({ data: { productId: s.product.id, label: 'Sweetness', choices: { create: [{ label: 'Original', sortPosition: 0 }] } } });
    const [choice] = await h.db.productChoice.findMany({ where: { groupId: group.id } });
    const a = actor(s.customer.id); const cart = h.resolve(CartService);
    await cart.set(a, s.variant.id, 2, (await cart.get(a)).version, choice.id);
    const q = await h.resolve(QuoteService).create(a, { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, ageConfirmed: false });
    await h.resolve(CatalogService).updateChoiceGroup({ id: s.admin.id, role: 'ADMIN', authVersion: 1 }, s.product.id, {
      expectedVersion: 1, label: 'Sweetness level', choices: [{ id: choice.id, label: 'Less sweet', active: true }],
    });
    await expect(h.resolve(CheckoutService).place(a, q.id, randomUUID())).rejects.toMatchObject({ status: 409, response: { code: 'QUOTE_CHANGED' } });
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(5);
    expect(await h.db.order.count({ where: { quoteId: q.id } })).toBe(0);
  });
  it('replays same quote with different keys, rejects key reuse, and survives restart', async () => {
    const s = await seedScenario(h.db); const q = await quote(s); const q2 = await h.resolve(QuoteService).create(actor(s.customer.id), { address: q.address, ageConfirmed: false }); const key = randomUUID(); const alias = randomUUID();
    const results = await Promise.all([h.resolve(CheckoutService).place(actor(s.customer.id), q.id, key), h.resolve(CheckoutService).place(actor(s.customer.id), q.id, alias)]);
    expect(results[0]).toEqual(results[1]);
    await expect(h.resolve(CheckoutService).place(actor(s.customer.id), q2.id, key)).rejects.toMatchObject({ status: 409 });
    await expect(h.resolve(CheckoutService).place(actor(s.customer.id), q2.id, alias)).rejects.toMatchObject({ status: 409 });
    await expect(h.resolve(CheckoutService).place(actor(s.otherCustomer.id), q.id, key)).rejects.toMatchObject({ status: 404 });
    await h.db.order.update({ where: { id: results[0].order.id }, data: { status: 'CONFIRMED' } });
    await h.close(); h = await startHarness();
    expect(await h.resolve(CheckoutService).place(actor(s.customer.id), q.id, key)).toEqual(results[0]);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(4);
  });
  it('preserves a changed cart and stores that decision for replay', async () => {
    const s = await seedScenario(h.db); const q = await quote(s); const a = actor(s.customer.id); const cart = h.resolve(CartService);
    const current = await cart.get(a);
    await cart.set(a, s.variant.id, 2, current.version);
    const result = await h.resolve(CheckoutService).place(a, q.id, randomUUID());
    expect(result.cartPreserved).toBe(true); expect((await cart.get(a)).items[0].quantity).toBe(2);
  });
  it('serializes simultaneous same-key requests and rejects a competing quote', async () => {
    const s = await seedScenario(h.db); const q = await quote(s);
    const q2 = await h.resolve(QuoteService).create(actor(s.customer.id), { address: q.address, ageConfirmed: false });
    const key = randomUUID();
    const results = await Promise.allSettled([h.resolve(CheckoutService).place(actor(s.customer.id), q.id, key), h.resolve(CheckoutService).place(actor(s.customer.id), q2.id, key)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    const winner = results.find(r => r.status === 'fulfilled');
    const stored = await h.db.order.findFirstOrThrow({ where: { userId: s.customer.id } });
    const replays = await Promise.all([h.resolve(CheckoutService).place(actor(s.customer.id), stored.quoteId, key), h.resolve(CheckoutService).place(actor(s.customer.id), stored.quoteId, key)]);
    expect(replays[0]).toEqual(winner!.value); expect(replays[1]).toEqual(winner!.value);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(4);
  });
  it('preserves the entire cart when a concurrent cart transaction commits first', async () => {
    const s = await seedScenario(h.db); const q = await quote(s);
    let locked!: () => void; let release!: () => void;
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const mutation = h.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${s.customer.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${s.cartId}::uuid FOR UPDATE`;
      await tx.cartItem.updateMany({ where: { cartId: s.cartId }, data: { quantity: 3 } });
      await tx.cart.update({ where: { id: s.cartId }, data: { version: { increment: 1 } } });
      locked(); await gate;
    });
    await ready;
    const placement = h.resolve(CheckoutService).place(actor(s.customer.id), q.id, randomUUID());
    release(); await mutation;
    expect((await placement).cartPreserved).toBe(true);
    expect((await h.resolve(CartService).get(actor(s.customer.id))).items[0].quantity).toBe(3);
  });
  it('rolls back stock, quote, order, event and outbox on a transaction failure', async () => {
    const s = await seedScenario(h.db); const q = await quote(s);
    // A PostgreSQL trigger injects failure after stock deductions without a production fault hook.
    await h.db.$executeRawUnsafe(`CREATE FUNCTION fail_test_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."quoteId" = '${q.id}'::uuid THEN RAISE EXCEPTION 'injected transaction failure'; END IF; RETURN NEW; END $$`);
    await h.db.$executeRawUnsafe('CREATE TRIGGER fail_test_order BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION fail_test_order()');
    try { await expect(h.resolve(CheckoutService).place(actor(s.customer.id), q.id, randomUUID())).rejects.toThrow('injected transaction failure'); }
    finally { await h.db.$executeRawUnsafe('DROP TRIGGER fail_test_order ON orders'); await h.db.$executeRawUnsafe('DROP FUNCTION fail_test_order()'); }
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(5);
    expect((await h.db.checkoutQuote.findUniqueOrThrow({ where: { id: q.id } })).status).toBe('OPEN');
    expect(await h.db.order.count({ where: { quoteId: q.id } })).toBe(0);
    expect(await h.db.inventoryMovement.count({ where: { variantId: s.variant.id } })).toBe(0);
    expect(await h.db.orderEvent.count({ where: { actorId: s.customer.id } })).toBe(0);
    expect(await h.db.emailOutbox.count({ where: { recipient: s.customer.email } })).toBe(0);
  });
  it.each(['expiry', 'price', 'fee', 'status', 'wine', 'pack'])('rejects changed %s', async change => {
    const s = await seedScenario(h.db); const q = await quote(s);
    if (change === 'expiry') await h.db.checkoutQuote.update({ where: { id: q.id }, data: { expiresAt: new Date(0) } });
    if (change === 'price') await h.db.variant.update({ where: { id: s.variant.id }, data: { priceVnd: 200000n, commercialVersion: { increment: 1 } } });
    if (change === 'pack') await h.db.variant.update({ where: { id: s.variant.id }, data: { packDetails: '500 g', commercialVersion: { increment: 1 } } });
    if (change === 'fee') await h.db.shippingZone.update({ where: { id: s.zone.id }, data: { feeVnd: 1n, version: { increment: 1 } } });
    if (change === 'status') await h.db.product.update({ where: { id: s.product.id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
    if (change === 'wine') await h.db.product.update({ where: { id: s.product.id }, data: { restricted18: true, version: { increment: 1 } } });
    await expect(h.resolve(CheckoutService).place(actor(s.customer.id), q.id, randomUUID())).rejects.toMatchObject({ status: 409 });
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(5);
  });
  it('rechecks expiry after waiting for a commercial lock', async () => {
    const s = await seedScenario(h.db); const q = await quote(s);
    await h.db.checkoutQuote.update({ where: { id: q.id }, data: { expiresAt: new Date(Date.now() + 150) } });
    let locked!: () => void; let release!: () => void;
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const hold = h.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${s.product.id}::uuid FOR UPDATE`;
      locked(); await gate;
    });
    await ready;
    const placement = h.resolve(CheckoutService).place(actor(s.customer.id), q.id, randomUUID());
    const outcome = expect(placement).rejects.toMatchObject({ status: 409, response: { code: 'QUOTE_EXPIRED' } });
    await new Promise(resolve => setTimeout(resolve, 200));
    release(); await hold; await outcome;
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(5);
  });
  it('delivers an English COD receipt through the existing outbox worker', async () => {
    const s = await seedScenario(h.db); const q = await quote(s);
    const placed = await h.resolve(CheckoutService).place(actor(s.customer.id), q.id, randomUUID());
    // The persistent test database may contain receipts from other suites. Make
    // this fixture eligible first, so delivery does not depend on queue length.
    await h.db.emailOutbox.update({ where: { dedupeKey: `order-created:${placed.order.id}` }, data: { availableAt: new Date(0) } });
    await h.resolve(EmailWorker).tick();
    const sent = h.resolve(RecordingEmailTransport).messages.find(m => m.to === s.customer.email);
    expect(sent?.subject).toBe('Your AnhEmFarm order was placed');
    expect(sent?.text).toContain(placed.order.id);
    expect(sent?.text).toContain('130000 VND');
    expect(sent?.text).toContain('Cash on delivery');
    const job = await h.db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: `order-created:${placed.order.id}` } });
    expect(job.sentAt).not.toBeNull(); expect(job.payload).toBeNull();
  });
  it('HTTP rejects tampered totals and returns 201 then equivalent 200 replay', async () => {
    const s = await seedScenario(h.db); const q = await quote(s); const client = h.client();
    await client.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password });
    const headers = { 'Idempotency-Key': randomUUID() };
    expect((await client.request('POST', '/api/v1/orders', { quoteId: q.id, totalVnd: 1 }, headers)).status).toBe(422);
    expect((await client.request('POST', '/api/v1/orders', { quoteId: q.id })).status).toBe(422);
    const first = await client.request('POST', '/api/v1/orders', { quoteId: q.id }, headers);
    const replay = await client.request('POST', '/api/v1/orders', { quoteId: q.id }, headers);
    expect(first.status).toBe(201); expect(replay.status).toBe(200); expect(first.body).toEqual(replay.body);
    expect((await h.resolve(CartService).get(actor(s.customer.id))).items).toHaveLength(0);
  });
});
