import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { startHarness, type Harness } from './harness.js';
import { seedDemoCatalog } from '../prisma/demo-catalog.js';

describe('development catalog seed', () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });

  it('provides idempotent browseable previews without saleable inventory', async () => {
    const rollback = new Error('rollback demo seed');
    await expect(h.db.$transaction(async tx => {
      await tx.storeSettings.deleteMany();
      await seedDemoCatalog(tx);
      await seedDemoCatalog(tx);
      const products = await tx.product.findMany({ where: { slug: { startsWith: 'demo-' } }, include: { category: true, variants: true } });
      expect(products).toHaveLength(10);
      expect(new Set(products.map(product => product.category.slug))).toEqual(new Set(['mulberries', 'coffee', 'tea', 'honey']));
      expect(products.every(product => product.status === 'PUBLISHED' && !product.confirmed)).toBe(true);
      expect(products.flatMap(product => product.variants).every(variant => variant.priceVnd === null && variant.stock === 0 && !variant.saleEnabled)).toBe(true);
      expect((await tx.storeSettings.findFirst())?.salesEnabled).toBe(false);
      throw rollback;
    })).rejects.toBe(rollback);
  });
  it('refuses to seed a database without a development or test suffix', () => {
    const result = spawnSync('npm', ['run', 'db:seed:demo'], { cwd: process.cwd(), encoding: 'utf8',
      env: { ...process.env, ALLOW_DEMO_SEED: 'true', APP_MODE: 'development', DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/anhemfarm' } });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('ending _dev or _test');
  });
});
