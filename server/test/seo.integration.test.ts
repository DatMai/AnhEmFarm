import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario, type Scenario } from './fixtures.js';

describe('public HTML without JavaScript', () => {
  let h: Harness;
  let s: Scenario;
  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });
  it('renders published product and canonical metadata without private fields', async () => {
    const response = await h.request('GET', `/products/${s.product.slug}`);
    expect(response.status).toBe(200);
    expect(response.body).toContain('Test Robusta coffee');
    expect(response.body).toContain('rel="canonical"');
    expect(response.body).not.toContain('passwordHash');
  });
  it('returns a real 404 for unknown products', async () => {
    expect((await h.request('GET', '/products/does-not-exist')).status).toBe(404);
  });
});
