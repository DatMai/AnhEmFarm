import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';
import { SettingsService } from '../src/admin/settings.service.js';

describe('seller settings and approved content', () => {
  let h: Harness;
  let s: Scenario;
  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });
  async function login(user: Scenario['admin']) {
    const client = h.client();
    expect((await client.request('POST', '/api/v1/auth/login', { email: user.email, password: user.password })).status).toBe(200);
    return client;
  }

  it('restricts settings and refuses live sales without launch requirements', async () => {
    const admin = await login(s.admin), customer = await login(s.customer);
    const bySku = await admin.request('GET', `/api/v1/admin/products?q=${encodeURIComponent(s.variant.sku)}`);
    expect(bySku.status).toBe(200);
    expect(bySku.body.items.some((product: { id: string }) => product.id === s.product.id)).toBe(true);
    expect((await customer.request('GET', '/api/v1/admin/settings')).status).toBe(403);
    const current = await admin.request('GET', '/api/v1/admin/settings');
    expect(current.status).toBe(200);
    const payload = { version: current.body.version, salesEnabled: true, wineEnabled: false,
      businessName: 'Fixture Farm', supportEmail: 'support@example.test', supportPhone: '0900000000' };
    const blocked = await admin.request('PUT', '/api/v1/admin/settings', payload);
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('LAUNCH_REQUIREMENTS_MISSING');
    const saved = await admin.request('PUT', '/api/v1/admin/settings', { ...payload, salesEnabled: false });
    expect(saved.status).toBe(200);
    expect((await admin.request('PUT', '/api/v1/admin/settings', { ...payload, salesEnabled: false })).status).toBe(409);
    expect((await admin.request('GET', '/api/v1/admin/audit')).status).toBe(200);
    expect((await admin.request('GET', '/api/v1/admin/email-jobs')).status).toBe(200);
    const store = await h.request('GET', '/api/v1/store');
    expect(store.status).toBe(200);
    expect(store.body.businessName).toBe('Fixture Farm');
    expect(JSON.stringify(store.body)).not.toMatch(/smtp|bucket|password/i);
    expect(h.resolve(SettingsService)).toBeDefined();
  });

  it('validates zone fees and keeps draft or unsafe content private', async () => {
    const admin = await login(s.admin);
    const negative = await admin.request('POST', '/api/v1/admin/shipping-zones', {
      code: 'NEGATIVE-TEST', displayName: 'Negative test zone', feeVnd: -1, enabled: true });
    expect(negative.status).toBe(422);
    const listed = await admin.request('GET', '/api/v1/admin/content');
    const previous = listed.body.items.find((page: { slug: string }) => page.slug === 'shipping');
    const created = await admin.request('PUT', '/api/v1/admin/content/shipping', {
      title: 'Shipping', source: 'Shipping details are pending.', status: 'DRAFT', version: previous?.version ?? 1 });
    expect(created.status).toBe(200);
    expect((await h.request('GET', '/api/v1/content/shipping')).status).toBe(404);
    const unsafe = await admin.request('PUT', '/api/v1/admin/content/privacy', {
      title: 'Privacy', source: '[unsafe](javascript:alert(1))', status: 'PUBLISHED', version: 1 });
    expect(unsafe.status).toBe(422);
    const published = await admin.request('PUT', '/api/v1/admin/content/shipping', {
      title: 'Shipping', source: 'Read [the guide](https://example.com/guide). <script>alert(1)</script>',
      status: 'PUBLISHED', version: created.body.version });
    expect(published.status).toBe(200);
    const publicPage = await h.request('GET', '/api/v1/content/shipping');
    expect(publicPage.status).toBe(200);
    expect(JSON.stringify(publicPage.body)).not.toContain('<script>');
    expect(JSON.stringify(publicPage.body)).not.toContain('javascript:');
  });
});
