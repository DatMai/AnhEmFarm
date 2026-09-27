import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { canPurchase, CatalogService } from '../src/catalog/catalog.service.js';
import { readConfig } from '../src/config.js';
import { rateKey } from '../src/http/request-context.js';

describe('catalog', () => {
  let h: Harness;
  let s: Scenario;
  const tag = randomUUID().slice(0, 8);
  const loginRateKeys = () => ['loginIp', 'registrationIp'].map(scope => rateKey(readConfig(), scope, '127.0.0.1'));
  const clearLoginRateBuckets = async () => {
    if (!h || !s) return;
    const pairKeys = [s.admin.email, s.customer.email].map(email => rateKey(readConfig(), 'loginPair', `127.0.0.1:${email}`));
    await h.db.rateBucket.deleteMany({ where: { key: { in: [...loginRateKeys(), ...pairKeys] } } });
  };
  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); await clearLoginRateBuckets(); });
  afterAll(async () => { await clearLoginRateBuckets(); await h?.close(); });
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
  it('lets an admin version and audit one product choice group while preserving stable inactive choices', async () => {
    const product = await h.db.product.findUniqueOrThrow({ where: { id: s.product.id } });
    const customer = h.client();
    expect((await customer.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password })).status).toBe(200);
    expect((await customer.request('PUT', `/api/v1/admin/products/${product.id}/choice-group`, {
      expectedVersion: product.version, label: 'Sweetness', choices: [{ label: 'Original', active: true }],
    })).status).toBe(403);

    const adminClient = await admin();
    const create = await adminClient.request('PUT', `/api/v1/admin/products/${product.id}/choice-group`, {
      expectedVersion: product.version, label: 'Sweetness', choices: [
        { label: 'Original', active: true }, { label: 'Less sweet', active: true }, { label: 'Unsweetened', active: true },
      ],
    });
    expect(create.status).toBe(200);
    expect(create.body).toMatchObject({ version: product.version + 1, choiceGroup: { label: 'Sweetness' } });
    expect(create.body.choiceGroup.choices.map((choice: { label: string; active: boolean }) => [choice.label, choice.active])).toEqual([
      ['Original', true], ['Less sweet', true], ['Unsweetened', true],
    ]);
    expect((await adminClient.request('GET', `/api/v1/admin/products/${product.id}`)).body.choiceGroup)
      .toMatchObject({ label: 'Sweetness', choices: [{ label: 'Original', active: true }, { label: 'Less sweet', active: true }, { label: 'Unsweetened', active: true }] });
    expect((await h.request('GET', `/api/v1/products/${s.product.slug}`)).body.choiceGroup)
      .toMatchObject({ label: 'Sweetness', choices: [{ label: 'Original' }, { label: 'Less sweet' }, { label: 'Unsweetened' }] });

    const groupId = create.body.choiceGroup.id;
    const choices = create.body.choiceGroup.choices as Array<{ id: string; label: string }>;
    const update = await adminClient.request('PUT', `/api/v1/admin/products/${product.id}/choice-group`, {
      expectedVersion: create.body.version, label: 'Sweetness level',
      choices: [{ id: choices[0].id, label: 'Original', active: true }],
    });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ version: create.body.version + 1, choiceGroup: { id: groupId, label: 'Sweetness level' } });
    expect(update.body.choiceGroup.choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: choices[0].id, active: true }),
      expect.objectContaining({ id: choices[1].id, active: false }),
      expect.objectContaining({ id: choices[2].id, active: false }),
    ]));
    expect(await h.db.auditLog.count({ where: { targetType: 'Product', targetId: product.id, action: 'PRODUCT_CHOICES_UPDATED' } })).toBe(2);

    const invalid = await adminClient.request('PUT', `/api/v1/admin/products/${product.id}/choice-group`, {
      expectedVersion: update.body.version, label: 'Sweetness', choices: [
        { label: 'Same', active: true }, { label: ' same ', active: true },
      ],
    });
    expect(invalid.status).toBe(422);
    const noActiveChoice = await adminClient.request('PUT', `/api/v1/admin/products/${product.id}/choice-group`, {
      expectedVersion: update.body.version, label: 'Sweetness', choices: [{ label: 'Archived', active: false }],
    });
    expect(noActiveChoice.status).toBe(422);
    const otherProduct = await h.db.product.create({ data: { categoryId: product.categoryId,
      slug: `foreign-choice-${tag}`, name: 'Foreign choice fixture', description: 'Ownership test' } });
    const foreignGroup = await h.db.productChoiceGroup.create({ data: { productId: otherProduct.id, label: 'Grind' } });
    const foreignChoice = await h.db.productChoice.create({ data: { groupId: foreignGroup.id, label: 'Ground', sortPosition: 0 } });
    const wrongOwner = await adminClient.request('PUT', `/api/v1/admin/products/${product.id}/choice-group`, {
      expectedVersion: update.body.version, label: 'Sweetness', choices: [{ id: foreignChoice.id, label: 'Ground', active: true }],
    });
    expect(wrongOwner.status).toBe(422);
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
  it('rechecks an admin inside the write transaction after suspension', async () => {
    const service = h.resolve(CatalogService);
    const admin = await h.db.user.findUniqueOrThrow({ where: { id: s.admin.id } });
    const stale = await h.db.user.create({ data: { email: `stale-${tag}@example.test`, passwordHash: admin.passwordHash,
      name: 'Stale Admin', role: 'ADMIN', status: 'SUSPENDED', authVersion: 2 } });
    const actor = { id: stale.id, role: 'ADMIN' as const, authVersion: 1 };
    const product = await h.db.product.findUniqueOrThrow({ where: { id: s.product.id } });
    await expect(service.updateProduct(actor, product.id, { expectedVersion: product.version, name: 'Unauthorized edit' }))
      .rejects.toMatchObject({ status: 401 });
    expect((await h.db.product.findUniqueOrThrow({ where: { id: product.id } })).name).toBe(product.name);
    expect(await h.db.auditLog.count({ where: { actorId: stale.id } })).toBe(0);
  });
  it('keeps a publication edit behind a checkout variant lock', async () => {
    const c = await admin();
    const product = await h.db.product.findUniqueOrThrow({ where: { id: s.product.id } });
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const checkout = h.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM variants WHERE id = ${s.variant.id}::uuid FOR UPDATE`;
      const variant = await tx.variant.findUniqueOrThrow({ where: { id: s.variant.id } });
      expect(canPurchase(product, variant, { salesEnabled: true, wineEnabled: false })).toBe(true);
      locked();
      await gate;
    });
    await acquired;
    let editSettled = false;
    const edit = c.request('PATCH', `/api/v1/admin/products/${product.id}`, { expectedVersion: product.version, restricted18: true })
      .then(result => { editSettled = true; return result; });
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(editSettled).toBe(false);
    } finally { release(); }
    await checkout;
    expect((await edit).status).toBe(200);
    const fresh = await h.db.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(canPurchase(fresh, await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } }),
      { salesEnabled: true, wineEnabled: false })).toBe(false);
  });
  it('locks sibling variants before a commercial variant edit commits', async () => {
    const c = await admin();
    const category = await h.db.product.findUniqueOrThrow({ where: { id: s.product.id } });
    const product = await h.db.product.create({ data: { categoryId: category.categoryId, slug: `siblings-${tag}`,
      name: 'Sibling lock fixture', description: 'Test', status: 'PUBLISHED', confirmed: true } });
    const variants = await Promise.all([1, 2].map(n => h.db.variant.create({ data: { productId: product.id,
      sku: `SIBLING-${n}-${tag}`, label: `Pack ${n}`, packDetails: '250 g', priceVnd: 100000n, stock: 2, saleEnabled: true } })));
    variants.sort((a, b) => a.id.localeCompare(b.id));
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const checkout = h.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM variants WHERE id = ${variants[1].id}::uuid FOR UPDATE`;
      locked();
      await gate;
    });
    await acquired;
    let editSettled = false;
    const edit = c.request('PATCH', `/api/v1/admin/variants/${variants[0].id}`, { expectedVersion: 1, priceVnd: 200000 })
      .then(result => { editSettled = true; return result; });
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(editSettled).toBe(false);
    } finally { release(); }
    await checkout;
    expect((await edit).status).toBe(200);
  });
  it('does not display or sort on disabled cheap variants', async () => {
    const product = await h.db.product.update({ where: { id: s.product.id }, data: { name: `Offer-${tag}` } });
    await h.db.variant.create({ data: { productId: product.id, sku: `DISABLED-${tag}`, label: 'Hidden offer',
      packDetails: '250 g', priceVnd: 1n, stock: 10, saleEnabled: false } });
    const detail = await h.request('GET', `/api/v1/products/${product.slug}`);
    expect(detail.body.startingPriceVnd).toBe(s.variant.priceVnd);
    const list = await h.request('GET', `/api/v1/products?q=${encodeURIComponent(product.name)}&sort=price_asc`);
    expect(list.body.items.find((item: any) => item.id === product.id).startingPriceVnd).toBe(s.variant.priceVnd);
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
