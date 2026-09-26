import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MediaService } from '../src/media/media.service.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { InventoryService } from '../src/inventory/inventory.service.js';

describe('inventory adjustments', () => {
  let h: Harness; let s: Scenario;
  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });
  const adminClient = async () => { const c = h.client(); expect((await c.request('POST', '/api/v1/auth/login', { email: s.admin.email, password: s.admin.password })).status).toBe(200); return c; };
  it('applies a relative delta once, rejects stale version, and replays original result', async () => {
    const inventory = h.resolve(InventoryService);
    const actor = { id: s.admin.id, role: 'ADMIN' as const, authVersion: 1 };
    const key = randomUUID();
    const first = await inventory.adjust(actor, s.variant.id, { delta: 2, reason: 'Count correction', version: 1, operationKey: key });
    expect(first).toEqual({ stock: 7, version: 2 });
    await expect(inventory.adjust(actor, s.variant.id, { delta: 2, reason: 'Count correction', version: 1, operationKey: randomUUID() })).rejects.toMatchObject({ status: 409 });
    const second = await inventory.adjust(actor, s.variant.id, { delta: -1, reason: 'Damage', version: 2, operationKey: randomUUID() });
    expect(second).toEqual({ stock: 6, version: 3 });
    expect(await inventory.adjust(actor, s.variant.id, { delta: 2, reason: 'Count correction', version: 1, operationKey: key })).toEqual(first);
    await expect(inventory.adjust(actor, s.variant.id, { delta: 3, reason: 'Count correction', version: 1, operationKey: key })).rejects.toMatchObject({ status: 409 });
    expect(await h.db.inventoryMovement.count({ where: { variantId: s.variant.id } })).toBe(2);
    expect(await h.db.auditLog.count({ where: { targetId: s.variant.id, action: 'INVENTORY_ADJUSTED' } })).toBe(2);
  });
  it('rejects negative stock, invalid delta and customer writes over HTTP', async () => {
    const admin = await adminClient();
    const current = await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } });
    const path = `/api/v1/admin/variants/${s.variant.id}/inventory`;
    expect((await admin.request('POST', path, { delta: -100, reason: 'Bad count', version: current.version, operationKey: randomUUID() })).status).toBe(422);
    expect((await admin.request('POST', path, { delta: 0.5, reason: 'Fraction', version: current.version, operationKey: randomUUID() })).status).toBe(422);
    const customer = h.client();
    await customer.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password });
    expect((await customer.request('POST', path, { delta: 1, reason: 'Attack', version: current.version, operationKey: randomUUID() })).status).toBe(403);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).stock).toBe(current.stock);
  });
  it('links an uploaded image to a draft before publishing', async () => {
    const admin = await adminClient();
    const category = await h.db.product.findUniqueOrThrow({ where: { id: s.product.id } });
    const slug = `admin-flow-${randomUUID().slice(0, 8)}`;
    const created = await admin.request('POST', '/api/v1/admin/products', { slug, name: 'Admin flow', description: 'Fixture', categoryId: category.categoryId });
    expect(created.status).toBe(201);
    const productId = created.body.id;
    const media = await h.resolve(MediaService).upload({ id: s.admin.id, role: 'ADMIN', authVersion: 1 }, await readFile('test/fixtures/media/valid.png'));
    const linked = await admin.request('POST', `/api/v1/admin/products/${productId}/images`, { mediaId: media.id });
    expect(linked.status).toBe(201);
    expect((await admin.request('GET', `/api/v1/admin/products/${productId}`)).body.images).toHaveLength(1);
    const sku = `FLOW-${randomUUID().slice(0, 8)}`;
    const variant = await admin.request('POST', `/api/v1/admin/products/${productId}/variants`, { sku, label: 'Pack', packDetails: '250 g', priceVnd: 100000, saleEnabled: true });
    expect(variant.status).toBe(201);
    const adjusted = await admin.request('POST', `/api/v1/admin/variants/${variant.body.id}/inventory`, { delta: 3, reason: 'Initial count', version: 1, operationKey: randomUUID() });
    expect(adjusted.body).toEqual({ stock: 3, version: 2 });
    const published = await admin.request('PATCH', `/api/v1/admin/products/${productId}`, { expectedVersion: 1, confirmed: true, status: 'PUBLISHED' });
    expect(published.status).toBe(200);
    const detail = await h.request('GET', `/api/v1/products/${slug}`);
    expect(detail.body).toMatchObject({ name: 'Admin flow', confirmed: true });
    expect(detail.body.images).toHaveLength(1);
    expect(detail.body.variants[0]).toMatchObject({ sku, inStock: true });
  });

});
