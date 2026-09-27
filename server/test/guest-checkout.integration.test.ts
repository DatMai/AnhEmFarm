import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario } from './fixtures.js';
import { OutboxService } from '../src/email/outbox.service.js';
import { EmailWorker, RecordingEmailTransport } from '../src/email/email.worker.js';
import { readConfig } from '../src/config.js';
import { rateKey } from '../src/http/request-context.js';

describe('guest COD checkout and verified account linking', () => {
  let h: Harness;
  const guestRateKeys = ['guestQuoteIp', 'guestOrderIp'].map(scope => rateKey(readConfig(), scope, '127.0.0.1'));
  beforeAll(async () => {
    h = await startHarness({ ratePolicies: {
      guestQuoteIp: { limit: 10000, windowMs: 60 * 60_000 },
      guestOrderIp: { limit: 10000, windowMs: 60 * 60_000 },
      registrationIp: { limit: 10000, windowMs: 60 * 60_000 },
    } });
    await h.db.rateBucket.deleteMany({ where: { key: { in: guestRateKeys } } });
  });
  afterAll(async () => {
    if (h) await h.db.rateBucket.deleteMany({ where: { key: { in: guestRateKeys } } });
    await h?.close();
  });

  it('previews an anonymous cart with current names, prices, and availability', async () => {
    const s = await seedScenario(h.db);
    const buyer = h.client();
    const result = await buyer.request('POST', '/api/v1/guest/cart-preview', { items: [{ variantId: s.variant.id, optionId: null, quantity: 2 }] });
    expect(result.status).toBe(201);
    expect(result.body.items).toMatchObject([{ productName: 'Test Robusta coffee', priceVnd: 100000, quantity: 2, available: true }]);
  });

  it('marks all selections unavailable when their combined quantity exceeds variant stock', async () => {
    const s = await seedScenario(h.db);
    const group = await h.db.productChoiceGroup.create({ data: { productId: s.product.id, label: 'Sweetness', choices: { create: [
      { label: 'Original', sortPosition: 0 }, { label: 'Less sweet', sortPosition: 1 },
    ] } } });
    const choices = await h.db.productChoice.findMany({ where: { groupId: group.id }, orderBy: { sortPosition: 'asc' } });
    await h.db.variant.update({ where: { id: s.variant.id }, data: { stock: 3 } });
    const result = await h.client().request('POST', '/api/v1/guest/cart-preview', { items: choices.map(choice => ({ variantId: s.variant.id, optionId: choice.id, quantity: 2 })) });
    expect(result.status).toBe(201);
    expect(result.body.items.map((item: { available: boolean }) => item.available)).toEqual([false, false]);
  });

  it('places once without login, isolates receipt, appears to seller, and links only after email verification', async () => {
    const s = await seedScenario(h.db);
    const buyer = h.client();
    const stranger = h.client();
    const email = `guest-${randomUUID()}@example.test`;
    const input = { email: ` ${email.toUpperCase()} `, address: {
      recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1,
    }, ageConfirmed: false, items: [{ variantId: s.variant.id, optionId: null, quantity: 2 }] };
    const quoted = await buyer.request('POST', '/api/v1/guest/quotes', input);
    expect(quoted.status).toBe(201);
    expect(quoted.body.totalVnd).toBe(230000);
    const key = randomUUID();
    const first = await buyer.request('POST', '/api/v1/guest/orders', { quoteId: quoted.body.id }, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);
    const replay = await buyer.request('POST', '/api/v1/guest/orders', { quoteId: quoted.body.id }, { 'Idempotency-Key': key });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    const id = first.body.order.id;
    const receipt = await buyer.request('GET', `/api/v1/guest/orders/${id}`);
    expect(receipt.status).toBe(200);
    expect(receipt.headers.get('cache-control')).toContain('no-store');
    expect((await stranger.request('GET', `/api/v1/guest/orders/${id}`)).status).toBe(404);
    expect((await stranger.request('POST', '/api/v1/guest/orders', { quoteId: quoted.body.id }, { 'Idempotency-Key': randomUUID() })).status).toBe(404);
    const stored = await h.db.order.findUniqueOrThrow({ where: { id } });
    expect(stored.userId).toBeNull();
    expect(stored.guestEmail).toBe(email);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(3);
    const seller = h.client();
    await seller.request('POST', '/api/v1/auth/login', { email: s.admin.email, password: s.admin.password });
    const list = await seller.request('GET', `/api/v1/admin/orders?q=${encodeURIComponent(email)}`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((order: { id: string }) => order.id)).toContain(id);
    const confirmed = await seller.request('POST', `/api/v1/admin/orders/${id}/transitions`, { version: 1, operationKey: randomUUID(), to: 'CONFIRMED' });
    expect(confirmed.status).toBe(200);
    const statusJob = await h.db.emailOutbox.findFirstOrThrow({ where: { recipient: email, template: 'ORDER_STATUS_CHANGED' } });
    await h.db.emailOutbox.update({ where: { id: statusJob.id }, data: { availableAt: new Date(0) } });
    await h.resolve(EmailWorker).tick();
    const statusEmail = h.resolve(RecordingEmailTransport).messages.find(message => message.to === email && message.subject === 'Your AnhEmFarm order is confirmed');
    expect(statusEmail?.text).toContain(`/guest/orders/${id}`);
    const account = h.client();
    expect((await account.request('POST', '/api/v1/auth/register', { email: email.toUpperCase(), name: 'Guest Customer', password: s.customer.password })).status).toBe(202);
    const registered = await h.db.user.findUniqueOrThrow({ where: { email } });
    expect((await h.db.order.findUniqueOrThrow({ where: { id } })).userId).toBeNull();
    const tokenRow = await h.db.accountToken.findFirstOrThrow({ where: { userId: registered.id, purpose: 'VERIFY' } });
    // The test uses the actual issued token via the recording outbox, not a private digest reversal.
    const outbox = await h.db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: `account-token:${tokenRow.id}` } });
    const token = h.resolve(OutboxService).decrypt<{ token: string }>(outbox.payload!).token;
    expect((await account.request('POST', '/api/v1/auth/verify-email', { token })).status).toBe(204);
    expect((await h.db.order.findUniqueOrThrow({ where: { id } })).userId).toBe(registered.id);
    await account.request('POST', '/api/v1/auth/login', { email, password: s.customer.password });
    expect((await account.request('GET', `/api/v1/orders/${id}`)).status).toBe(200);
  });

  it('rejects changed prices and stale stock before deducting inventory', async () => {
    const s = await seedScenario(h.db);
    const buyer = h.client();
    const input = { email: `guest-${randomUUID()}@example.test`, address: {
      recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1,
    }, ageConfirmed: false, items: [{ variantId: s.variant.id, optionId: null, quantity: 1 }] };
    const quoted = await buyer.request('POST', '/api/v1/guest/quotes', input);
    expect(quoted.status).toBe(201);
    await h.db.variant.update({ where: { id: s.variant.id }, data: { priceVnd: 200000n, commercialVersion: { increment: 1 } } });
    const placed = await buyer.request('POST', '/api/v1/guest/orders', { quoteId: quoted.body.id }, { 'Idempotency-Key': randomUUID() });
    expect(placed.status).toBe(409);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(5);
  });

  it('claims two guest orders using the same placement key from different sessions', async () => {
    const s = await seedScenario(h.db);
    const email = `shared-${randomUUID()}@example.test`;
    const key = randomUUID();
    const orderIds: string[] = [];
    for (let index = 0; index < 2; index++) {
      const guest = h.client();
      const quoted = await guest.request('POST', '/api/v1/guest/quotes', { email, address: {
        recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1,
      }, ageConfirmed: false, items: [{ variantId: s.variant.id, optionId: null, quantity: 1 }] });
      expect(quoted.status).toBe(201);
      const placed = await guest.request('POST', '/api/v1/guest/orders', { quoteId: quoted.body.id }, { 'Idempotency-Key': key });
      expect(placed.status).toBe(201);
      orderIds.push(placed.body.order.id);
    }
    const account = h.client();
    expect((await account.request('POST', '/api/v1/auth/register', { email, name: 'Shared Guest', password: s.customer.password })).status).toBe(202);
    const user = await h.db.user.findUniqueOrThrow({ where: { email } });
    const tokenRow = await h.db.accountToken.findFirstOrThrow({ where: { userId: user.id, purpose: 'VERIFY' } });
    const outbox = await h.db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey: `account-token:${tokenRow.id}` } });
    const token = h.resolve(OutboxService).decrypt<{ token: string }>(outbox.payload!).token;
    expect((await account.request('POST', '/api/v1/auth/verify-email', { token })).status).toBe(204);
    expect(await h.db.order.count({ where: { id: { in: orderIds }, userId: user.id } })).toBe(2);
  });
});
