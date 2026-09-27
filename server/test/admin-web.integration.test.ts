import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';

describe('backend-owned admin portal', () => {
  let h: Harness;
  let scenario: Scenario;
  beforeAll(async () => { h = await startHarness(); scenario = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });

  it('requires an active administrator and renders dashboard as a standalone no-script page', async () => {
    const anonymous = await h.request('GET', '/admin');
    expect(anonymous.status).toBe(302);
    expect(anonymous.headers.get('location')).toBe('/login?next=%2Fadmin');
    const customer = h.client();
    await customer.request('POST', '/api/v1/auth/login', { email: scenario.customer.email, password: scenario.customer.password });
    expect((await customer.request('GET', '/admin')).status).toBe(403);
    const admin = h.client();
    await admin.request('POST', '/api/v1/auth/login', { email: scenario.admin.email, password: scenario.admin.password });
    const page = await admin.request('GET', '/admin');
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toContain('private');
    expect(page.headers.get('x-robots-tag')).toContain('noindex');
    expect(page.body).toContain('Seller dashboard');
    expect(page.body).toContain('Orders');
    expect(page.body).toContain('Catalog');
    expect(page.body).toContain('<svg');
    expect(page.body).not.toMatch(/<script\b/i);
  });

  it('serves order lists as native HTML and includes a CSRF token for forms', async () => {
    const admin = h.client();
    const login = await admin.request('POST', '/api/v1/auth/login', { email: scenario.admin.email, password: scenario.admin.password });
    expect(login.status).toBe(200);
    const apiOrders = await admin.request('GET', '/api/v1/admin/orders?pageSize=1');
    expect(apiOrders.status, JSON.stringify(apiOrders.body)).toBe(200);
    const page = await admin.request('GET', `/admin/orders?q=${encodeURIComponent(scenario.customer.email)}`);
    expect(page.status).toBe(200);
    expect(page.body).not.toMatch(/<script\b/i);
    const detail = await admin.request('GET', `/admin/products/${scenario.product.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toContain('name="_csrf"');
    expect(detail.body).toContain('method="post"');
    expect(detail.body).toContain('Save product options');
    for (const path of ['/admin/products', '/admin/categories', '/admin/customers', `/admin/customers/${scenario.customer.id}`,
      '/admin/inventory', '/admin/settings', '/admin/reports', '/admin/content', '/admin/audit', '/admin/email-jobs']) {
      const screen = await admin.request('GET', path);
      expect(screen.status, `${path}: ${screen.body}`).toBe(200);
      expect(screen.body).not.toMatch(/<script\b/i);
      expect(screen.body).toContain('sidebar');
    }
    const productList = await admin.request('GET', '/admin/products');
    const token = String(productList.body).match(/name="_csrf" value="([^"]+)"/);
    expect(token, 'create-product form includes the session CSRF token').not.toBeNull();
    const fixtureProduct = await h.db.product.findUniqueOrThrow({ where: { id: scenario.product.id }, select: { categoryId: true, version: true } });
    const created = await admin.request('POST', '/admin/products', {
      _csrf: token![1], name: 'MPA validation fixture', slug: `mpa-validation-${Date.now()}`,
      description: 'Created through the server-rendered product form.', categoryId: fixtureProduct.categoryId,
      confirmed: false, restricted18: false,
    });
    expect(created.status).toBe(303);
    const success = await admin.request('GET', String(created.headers.get('location')));
    expect(success.status).toBe(200);
    expect(success.body).toContain('Product created.');

    const tooManyChoices = await admin.request('POST', `/admin/products/${scenario.product.id}/choices`, {
      _csrf: token![1], expectedVersion: fixtureProduct.version, groupLabel: 'Sweetness',
      newChoices: Array.from({ length: 13 }, (_, index) => `Choice ${index + 1}`).join('\n'),
    });
    expect(tooManyChoices.status).toBe(422);
    expect(tooManyChoices.body).toContain('Some submitted information is invalid');
    const malformedProduct = await admin.request('POST', '/admin/products', {
      _csrf: token![1], name: 'Invalid', slug: 'invalid product', description: '', categoryId: 'not-a-uuid',
    });
    expect(malformedProduct.status).toBe(422);
    expect(malformedProduct.body).toContain('Some submitted information is invalid');
    const mediaCount = await h.db.media.count();
    const malformedImageProduct = await admin.request('POST', '/admin/products/not-a-uuid/images', { _csrf: token![1] });
    expect(malformedImageProduct.status).toBe(422);
    expect(await h.db.media.count()).toBe(mediaCount);
    const cookies = login.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
    const rejected = await h.request('POST', '/admin/orders/unknown/status', {}, { Cookie: cookies, Origin: h.origin });
    expect(rejected.status).toBe(403);
    expect(rejected.body).toMatchObject({ code: 'CSRF_REJECTED' });
    const rejectedOpaqueOrigin = await h.request('POST', '/admin/orders/unknown/status', {}, { Cookie: cookies });
    expect(rejectedOpaqueOrigin.status).toBe(403);
    expect(rejectedOpaqueOrigin.body).toMatchObject({ code: 'ORIGIN_REJECTED' });
  });
});
