import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { CartService } from '../src/cart/cart.service.js';
import { QuoteService } from '../src/checkout/quote.service.js';

describe('cart and quote persistence', () => {
  let h: Harness; let s: Scenario;
  const actor = () => ({ id: s.customer.id, role: 'CUSTOMER' as const, authVersion: 1 });
  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });
  it('validates quantities and optimistic version, then merges idempotently', async () => {
    const cart = h.resolve(CartService);
    const initial = await cart.get(actor());
    for (const quantity of [0, 100, 0.5]) await expect(cart.set(actor(), s.variant.id, quantity, initial.version)).rejects.toMatchObject({ status: 422 });
    const one = await cart.set(actor(), s.variant.id, 1, initial.version);
    expect(one.items[0].quantity).toBe(1);
    await expect(cart.set(actor(), s.variant.id, 99, initial.version)).rejects.toMatchObject({ status: 409 });
    const many = await cart.set(actor(), s.variant.id, 99, one.version);
    expect(many.items[0].quantity).toBe(99);
    const cleared = await cart.remove(actor(), s.variant.id, many.version);
    expect(cleared.items).toHaveLength(0);
    const key = randomUUID();
    const input = { key, items: [{ variantId: s.variant.id, quantity: 2 }] };
    const merged = await cart.merge(actor(), input);
    expect((await cart.merge(actor(), input))).toEqual(merged);
    expect((await cart.get(actor())).items[0].quantity).toBe(2);
    await expect(cart.merge(actor(), { key, items: [{ variantId: s.variant.id, quantity: 3 }] })).rejects.toMatchObject({ status: 409 });
    await expect(cart.merge(actor(), { key: randomUUID(), items: [{ variantId: s.variant.id, quantity: 98 }] })).rejects.toMatchObject({ status: 422 });
  });
  it('rejects excessive line count atomically', async () => {
    const cart = h.resolve(CartService);
    await expect(cart.merge(actor(), { key: randomUUID(), items: Array.from({ length: 51 }, () => ({ variantId: randomUUID(), quantity: 1 })) })).rejects.toMatchObject({ status: 422 });
  });
  it('validates gate, zone and address, then snapshots a 15-minute quote', async () => {
    const quote = h.resolve(QuoteService);
    const input = { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, note: 'Test only', ageConfirmed: false };
    const result = await quote.create(actor(), input);
    expect(result).toMatchObject({ subtotalVnd: 200000, shippingVnd: 30000, totalVnd: 230000 });
    expect(new Date(result.expiresAt).getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    const persisted = await h.db.checkoutQuote.findUniqueOrThrow({ where: { id: result.id } });
    expect(persisted.linesJson).toMatchObject([{ variantId: s.variant.id, quantity: 2, commercialVersion: 1, productVersion: 1 }]);
    await expect(quote.create(actor(), { ...input, address: { ...input.address, zoneId: randomUUID() } })).rejects.toMatchObject({ status: 422 });
    await expect(quote.create(actor(), { ...input, address: { ...input.address, recipient: '' } })).rejects.toMatchObject({ status: 422 });
    await h.db.user.update({ where: { id: s.customer.id }, data: { verifiedAt: null } });
    await expect(quote.create(actor(), input)).rejects.toMatchObject({ status: 403 });
    await h.db.user.update({ where: { id: s.customer.id }, data: { verifiedAt: new Date() } });
  });
  it('requires wine age confirmation and persists quote expiration', async () => {
    const quote = h.resolve(QuoteService);
    const input = { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, ageConfirmed: false };
    const settings = await h.db.storeSettings.findFirstOrThrow();
    await h.db.storeSettings.update({ where: { id: settings.id }, data: { wineEnabled: true } });
    await h.db.product.update({ where: { id: s.product.id }, data: { restricted18: true, version: { increment: 1 } } });
    await expect(quote.create(actor(), input)).rejects.toMatchObject({ status: 422 });
    const created = await quote.create(actor(), { ...input, ageConfirmed: true });
    expect(created.items[0]).toMatchObject({ restricted18: true, productVersion: 2, eligible: true });
    await h.db.checkoutQuote.update({ where: { id: created.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await h.db.checkoutQuote.findUniqueOrThrow({ where: { id: created.id } })).expiresAt.getTime()).toBeLessThan(Date.now());
    await h.db.product.update({ where: { id: s.product.id }, data: { restricted18: false } });
    await h.db.storeSettings.update({ where: { id: settings.id }, data: { wineEnabled: false } });
  });
  it('enforces session and strict HTTP bodies', async () => {
    expect((await h.request('GET', '/api/v1/cart')).status).toBe(401);
    const client = h.client();
    expect((await client.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password })).status).toBe(200);
    expect((await client.request('GET', '/api/v1/cart')).status).toBe(200);
    expect((await client.request('POST', '/api/v1/quotes', { address: s.address, ageConfirmed: false, subtotalVnd: 1 })).status).toBe(422);
    expect((await client.request('PUT', `/api/v1/cart/items/${s.variant.id}`, { quantity: 1, version: 1, priceVnd: 1 })).status).toBe(422);
  });
});
