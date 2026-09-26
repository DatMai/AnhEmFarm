import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { canPurchase } from '../src/catalog/catalog.service.js';

describe('catalog', () => {
  let h: Harness;
  let s: Scenario;
  const tag = randomUUID().slice(0, 8);
  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });
  async function admin() {
    const c = h.client();
    expect((await c.request('POST', '/api/v1/auth/login', { email: s.admin.email, password: s.admin.password })).status).toBe(200);
    return c;
  }
  it('excludes draft and archived products, provides safe literal search and detail', async () => {
    const category = await h.db.category.findFirstOrThrow({ where: { slug: { startsWith: 'test-coffee-' } }, orderBy: { createdAt: 'desc' } });
    const draft = await h.db.product.create({ data: { categoryId: category.id, slug: `draft-${tag}`, name: `Draft ${tag}`, description: '<script>alert(1)</script>' } });
    const page = await h.request('GET', '/api/v1/products');
    expect(page.status).toBe(200);
    expect(page.body.items.some((x: any) => x.id === draft.id)).toBe(false);
    const literal = await h.request('GET', '/api/v1/products?q=%25_%27%3BDROP');
    expect(literal.status).toBe(200);
    expect(literal.body.items).toEqual([]);
    const percent = await h.request('GET', '/api/v1/products?q=%25');
    expect(percent.status).toBe(200);
    expect(percent.body.items).toEqual([]);
    expect((await h.request('GET', `/api/v1/products/${draft.slug}`)).status).toBe(404);
    const detail = await h.request('GET', `/api/v1/products/${s.product.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.variants[0]).toMatchObject({ sku: s.variant.sku, inStock: true, saleEnabled: true });
  });
  it('bounds pagination and rejects arbitrary sort and query fields', async () => {
    const bad = await h.request('GET', '/api/v1/products?pageSize=1000&sort=stock%3BDROP');
    expect(bad.status).toBe(422);
    expect((await h.request('GET', '/api/v1/products?unexpected=x')).status).toBe(422);
    const page = await h.request('GET', '/api/v1/products?page=1&pageSize=1&sort=name');
    expect(page.status).toBe(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body).toMatchObject({ page: 1, pageSize: 1 });
  });
  it('uses deterministic ID tie breaks for price and name pages', async () => {
    const category = await h.db.product.findUniqueOrThrow({ where: { id: s.product.id } });
    const pair = await Promise.all([1, 2].map(async n => {
      const product = await h.db.product.create({ data: { categoryId: category.categoryId, slug: `tie-${n}-${tag}`, name: `Tie ${tag}`, description: 'Page test', status: 'PUBLISHED' } });
      await h.db.variant.create({ data: { productId: product.id, sku: `TIE-${n}-${tag}`, label: 'Pack', packDetails: '250 g', priceVnd: 12345n } });
      return product.id;
    }));
    const namePage = await h.request('GET', `/api/v1/products?q=Tie%20${tag}&sort=name&pageSize=1&page=1`);
    const nameNext = await h.request('GET', `/api/v1/products?q=Tie%20${tag}&sort=name&pageSize=1&page=2`);
    expect([namePage.body.items[0].id, nameNext.body.items[0].id]).toEqual(pair.sort());
    expect(namePage.body.total).toBe(2);
    const pricePage = await h.request('GET', `/api/v1/products?q=Tie%20${tag}&sort=price_asc&pageSize=1&page=1`);
    const priceNext = await h.request('GET', `/api/v1/products?q=Tie%20${tag}&sort=price_asc&pageSize=1&page=2`);
    expect([pricePage.body.items[0].id, priceNext.body.items[0].id]).toEqual(pair);
    const beyond = await h.request('GET', `/api/v1/products?q=Tie%20${tag}&page=3&pageSize=1`);
    expect(beyond.body).toMatchObject({ items: [], total: 2 });
  });
  it('audits category edits and enforces version checks', async () => {
    const c = await admin();
    const category = await c.request('POST', '/api/v1/admin/categories', { slug: `category-${tag}`, name: 'Catalog category' });
    expect(category.status).toBe(201);
    const changed = await c.request('PATCH', `/api/v1/admin/categories/${category.body.id}`, { expectedVersion: 1, name: 'Updated category' });
    expect(changed.body).toMatchObject({ name: 'Updated category', version: 2 });
    expect((await c.request('PATCH', `/api/v1/admin/categories/${category.body.id}`, { expectedVersion: 1, name: 'Stale' })).body.code).toBe('VERSION_CONFLICT');
    expect(await h.db.auditLog.count({ where: { targetType: 'Category', targetId: category.body.id } })).toBe(2);
  });
  it('requires ADMIN for catalog writes', async () => {
    const c = h.client();
    expect((await c.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password })).status).toBe(200);
    expect((await c.request('POST', '/api/v1/admin/products', { name: 'Attempt' })).status).toBe(403);
    expect((await h.client().request('GET', '/api/v1/admin/products')).status).toBe(401);
  });
  it('creates audited products, validates publication, rejects stale versions and archives without deleting', async () => {
    const c = await admin();
    const category = await h.db.product.findUniqueOrThrow({ where: { id: s.product.id } });
    const created = await c.request('POST', '/api/v1/admin/products', { slug: `new-${tag}`, name: 'New product', description: '<script>alert(1)</script>', categoryId: category.categoryId });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'DRAFT', version: 1, description: '<script>alert(1)</script>' });
    const id = created.body.id;
    expect(await h.db.auditLog.count({ where: { targetId: id, action: 'PRODUCT_CREATED' } })).toBe(1);
    const published = await c.request('PATCH', `/api/v1/admin/products/${id}`, { expectedVersion: 1, status: 'PUBLISHED' });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ status: 'PUBLISHED', confirmed: false, version: 2 });
    const publicDetail = await h.request('GET', `/api/v1/products/new-${tag}`);
    expect(publicDetail.body).toMatchObject({ purchasable: false, description: '<script>alert(1)</script>' });
    expect((await c.request('PATCH', `/api/v1/admin/products/${id}`, { expectedVersion: 1, name: 'Stale' })).body.code).toBe('VERSION_CONFLICT');
    expect((await c.request('PATCH', `/api/v1/admin/products/${id}`, { expectedVersion: 2, confirmed: true })).status).toBe(422);
    const archived = await c.request('PATCH', `/api/v1/admin/products/${id}`, { expectedVersion: 2, status: 'ARCHIVED' });
    expect(archived.status).toBe(200);
    expect(await h.db.product.findUnique({ where: { id } })).not.toBeNull();
    expect((await h.request('GET', `/api/v1/products/new-${tag}`)).status).toBe(404);
    expect(await h.db.auditLog.count({ where: { targetId: id } })).toBe(3);
  });
  it('rejects unknown fields and duplicate concurrent SKU creation; protects stock from generic edits', async () => {
    const c = await admin();
    const sku = `SKU-${tag}`;
    const requests = await Promise.all([1, 2].map(() => c.request('POST', `/api/v1/admin/products/${s.product.id}/variants`, { sku, label: 'Pack', packDetails: '250 g', priceVnd: 120000, saleEnabled: false })));
    expect(requests.map(x => x.status).sort()).toEqual([201, 409]);
    const variant = await h.db.variant.findUniqueOrThrow({ where: { sku } });
    expect((await c.request('PATCH', `/api/v1/admin/variants/${variant.id}`, { expectedVersion: 1, stock: 9 })).status).toBe(422);
    expect((await c.request('PATCH', `/api/v1/admin/variants/${variant.id}`, { expectedVersion: 1, priceVnd: null })).status).toBe(200);
    expect((await h.db.variant.findUniqueOrThrow({ where: { id: variant.id } })).commercialVersion).toBe(2);
  });
  it('centralizes eligibility for confirmed, price, pack, stock, sale, settings and wine', async () => {
    const product = { status: 'PUBLISHED' as const, confirmed: true, restricted18: false };
    const variant = { saleEnabled: true, priceVnd: 1n, packDetails: '250 g', stock: 1 };
    const settings = { salesEnabled: true, wineEnabled: false };
    expect(canPurchase(product, variant, settings)).toBe(true);
    expect(canPurchase({ ...product, confirmed: false }, variant, settings)).toBe(false);
    expect(canPurchase(product, { ...variant, priceVnd: null }, settings)).toBe(false);
    expect(canPurchase(product, { ...variant, stock: 0 }, settings)).toBe(false);
    expect(canPurchase({ ...product, restricted18: true }, variant, settings)).toBe(false);
    expect(canPurchase(product, variant, { ...settings, salesEnabled: false })).toBe(false);
  });
});
