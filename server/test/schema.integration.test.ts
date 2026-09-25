import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { seedScenario } from './fixtures.js';

describe('commerce schema constraints', () => {
  let h: Harness;
  let s: Awaited<ReturnType<typeof seedScenario>>;

  beforeAll(async () => { h = await startHarness(); s = await seedScenario(h.db); });
  afterAll(async () => { await h?.close(); });

  it('rejects negative stock', async () => {
    await expect(h.db.$executeRaw`UPDATE variants SET stock = -1 WHERE id = ${s.variant.id}::uuid`).rejects.toThrow();
    expect(await h.db.variant.findUniqueOrThrow({ where: { id: s.variant.id } })).toMatchObject({ stock: 5 });
  });

  it('rejects duplicate normalized email', async () => {
    await expect(h.db.user.create({ data: { email: s.customer.email.toUpperCase(), passwordHash: 'fixture', name: 'Duplicate' } })).rejects.toThrow();
  });

  it('rejects a fractional cart quantity', async () => {
    await expect(h.db.$executeRaw`INSERT INTO cart_items (id, "cartId", "variantId", quantity, "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${s.cartId}::uuid, ${s.variant.id}::uuid, '1.5', now(), now())`).rejects.toThrow();
  });
});
