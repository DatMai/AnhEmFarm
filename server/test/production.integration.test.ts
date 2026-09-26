import { describe, expect, it } from 'vitest';
import { validateConfig, type AppConfig } from '../src/config.js';
import { startHarness } from './harness.js';
import { seedScenario } from './fixtures.js';
import { CartService } from '../src/cart/cart.service.js';
import { QuoteService } from '../src/checkout/quote.service.js';

const valid: AppConfig = {
  mode: 'production', origin: 'https://farm.example.test', databaseUrl: 'postgresql://user:password@db/farm',
  sessionSecret: 's'.repeat(32), emailPayloadKey: 'e'.repeat(32),
  smtp: { host: 'smtp.example.test', port: 587, from: 'farm@example.test' },
  storage: { bucket: 'farm-media', endpoint: 'https://objects.example.test' },
  salesEnabled: false, demoEnabled: false, trustedProxyAddress: '172.30.77.10',
};

describe('production configuration gate', () => {
  it('requires a strong session secret and rejects demo mode', () => {
    expect(validateConfig(valid)).toBe(valid);
    expect(() => validateConfig({ ...valid, sessionSecret: 'short' })).toThrow();
    expect(() => validateConfig({ ...valid, demoEnabled: true })).toThrow();
  });
  it('requires external mail, media and HTTPS before listen', () => {
    expect(() => validateConfig({ ...valid, origin: 'http://farm.example.test' })).toThrow();
    expect(() => validateConfig({ ...valid, smtp: { ...valid.smtp, host: '' } })).toThrow();
    expect(() => validateConfig({ ...valid, storage: { bucket: '', endpoint: '' } })).toThrow();
    expect(() => validateConfig({ ...valid, trustedProxyAddress: undefined })).toThrow();
  });
  it('keeps products and quotes unavailable when the production environment switch is off', async () => {
    const h = await startHarness(valid);
    try {
      const fixture = await seedScenario(h.db);
      const detail = await h.request('GET', `/api/v1/products/${fixture.product.slug}`);
      expect(detail.status).toBe(200);
      expect(detail.body.purchasable).toBe(false);
      const actor = { id: fixture.customer.id, role: 'CUSTOMER' as const, authVersion: 1 };
      const cart = h.resolve(CartService);
      const current = await cart.get(actor);
      await cart.set(actor, fixture.variant.id, 1, current.version);
      const { note: _note, ...address } = fixture.address;
      await expect(h.resolve(QuoteService).create(actor, { address, ageConfirmed: false })).rejects.toMatchObject({
        response: { code: 'SALES_DISABLED' },
      });
    } finally { await h.close(); }
  });
});
