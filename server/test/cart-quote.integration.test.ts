import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { CartService } from '../src/cart/cart.service.js';
import { QuoteService } from '../src/checkout/quote.service.js';

describe('cart and quote persistence', () => {
  let h: Harness; let s: Scenario;
  const actor = () => ({ id: s.customer.id, role: 'CUSTOMER' as const, authVersion: 1 });
  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); });
  beforeEach(async () => {
    const group = await h.db.productChoiceGroup.findUnique({ where: { productId: s.product.id } });
    if (group) {
      await h.db.productChoice.updateMany({ where: { groupId: group.id }, data: { active: false } });
      await h.db.productChoiceGroup.update({ where: { id: group.id }, data: { active: false } });
    }
    const cart = await h.db.cart.findUnique({ where: { userId: s.customer.id } });
    if (cart) {
      await h.db.cartItem.deleteMany({ where: { cartId: cart.id } });
      await h.db.cartItem.create({ data: { cartId: cart.id, variantId: s.variant.id, quantity: 2, selectionKey: 'none' } });
      await h.db.cart.update({ where: { id: cart.id }, data: { version: 1 } });
    }
  });
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
  it('keeps choices as distinct cart lines and quotes their database-owned labels', async () => {
    const group = await h.db.productChoiceGroup.create({ data: { productId: s.product.id, label: 'Sweetness', choices: { create: [
      { label: 'Original', sortPosition: 0 }, { label: 'Less sweet', sortPosition: 1 },
    ] } } });
    await h.db.cartItem.deleteMany({ where: { cartId: s.cartId } });
    await h.db.cart.update({ where: { id: s.cartId }, data: { version: 1 } });
    const choices = await h.db.productChoice.findMany({ where: { groupId: group.id }, orderBy: { sortPosition: 'asc' } });
    const cart = h.resolve(CartService);
    const initial = await cart.get(actor());
    await expect(cart.set(actor(), s.variant.id, 1, initial.version)).rejects.toMatchObject({ status: 422 });
    const first = await cart.set(actor(), s.variant.id, 2, initial.version, choices[0].id);
    const third = await cart.set(actor(), s.variant.id, 1, first.version, choices[1].id);
    expect(third.items).toHaveLength(2);
    expect(third.items.map(item => item.optionLabel).sort()).toEqual(['Less sweet', 'Original']);
    const input = { address: { recipient: s.address.recipient, phone: s.address.phone, zoneId: s.zone.id, line1: s.address.line1 }, ageConfirmed: false };
    const quote = await h.resolve(QuoteService).create(actor(), input);
    expect(quote.items.map(item => [item.optionGroupLabel, item.optionLabel]).sort()).toEqual([['Sweetness', 'Less sweet'], ['Sweetness', 'Original']]);
    expect(quote.totalVnd).toBe(330000);
    await expect(cart.set(actor(), s.variant.id, 1, third.version, randomUUID())).rejects.toMatchObject({ status: 409 });
    const client = h.client();
    expect((await client.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password })).status).toBe(200);
    const apiUpdate = await client.request('PUT', `/api/v1/cart/items/${s.variant.id}`, { quantity: 3, optionId: choices[0].id, version: third.version });
    expect(apiUpdate.status).toBe(200);
    expect(apiUpdate.body.items.find((item: { optionId: string }) => item.optionId === choices[0].id).quantity).toBe(3);
    await h.db.productChoice.update({ where: { id: choices[0].id }, data: { active: false } });
    await expect(cart.set(actor(), s.variant.id, 3, third.version, choices[0].id)).rejects.toMatchObject({ status: 409 });
    await expect(h.resolve(QuoteService).create(actor(), input)).rejects.toMatchObject({ status: 409 });
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
    expect((await h.resolve(CartService).get(actor())).items[0]).toMatchObject({ restricted18: true });
    await expect(quote.create(actor(), input)).rejects.toMatchObject({ status: 422 });
    const created = await quote.create(actor(), { ...input, ageConfirmed: true });
    expect(created.items[0]).toMatchObject({ restricted18: true, productVersion: 2, eligible: true });
    await h.db.checkoutQuote.update({ where: { id: created.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await h.db.checkoutQuote.findUniqueOrThrow({ where: { id: created.id } })).expiresAt.getTime()).toBeLessThan(Date.now());
    await h.db.product.update({ where: { id: s.product.id }, data: { restricted18: false } });
    await h.db.storeSettings.update({ where: { id: settings.id }, data: { wineEnabled: false } });
  });
  it('lists enabled delivery zones with server fees', async () => {
    const disabled = await h.db.shippingZone.create({ data: { code: `DISABLED-${randomUUID()}`, displayName: 'Disabled test zone', enabled: false, feeVnd: 1n } });
    const items: Array<{id:string;feeVnd:number}> = [];
    for (let page = 1; ; page++) { const r = await h.request('GET', `/api/v1/shipping-zones?page=${page}&pageSize=100`); expect(r.status).toBe(200); items.push(...r.body.items); if (items.length >= r.body.total) break; }
    expect(items.find(z => z.id === s.zone.id)).toMatchObject({ feeVnd: 30000 });
    expect(items.some(z => z.id === disabled.id)).toBe(false);
    expect((await h.request('GET', '/api/v1/shipping-zones?pageSize=101')).status).toBe(422);
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
