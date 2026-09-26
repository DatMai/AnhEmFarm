import { randomUUID } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import type { PrismaClient } from '../src/generated/prisma/client.js';

export const TEST_PASSWORD = 'Example-test-password-2026!';

export interface Scenario {
  customer: { id: string; email: string; password: string };
  otherCustomer: { id: string; email: string; password: string };
  admin: { id: string; email: string; password: string };
  variant: { id: string; sku: string; priceVnd: number };
  product: { id: string; slug: string };
  zone: { id: string; code: string };
  address: { recipient: string; phone: string; zoneId: string; line1: string; note: string };
  cartId: string;
}

export async function seedScenario(db: PrismaClient): Promise<Scenario> {
  if (process.env.APP_MODE === 'production') throw new Error('Test fixtures are forbidden in production');
  const suffix = randomUUID().slice(0, 8);
  const passwordHash = await hash(TEST_PASSWORD, { type: argon2id });
  const [customer, otherCustomer, admin] = await Promise.all([
    db.user.create({ data: { email: `customer-${suffix}@example.test`, passwordHash, name: 'Test Customer', verifiedAt: new Date() } }),
    db.user.create({ data: { email: `other-${suffix}@example.test`, passwordHash, name: 'Other Customer', verifiedAt: new Date() } }),
    db.user.create({ data: { email: `admin-${suffix}@example.test`, passwordHash, name: 'Test Admin', role: 'ADMIN', verifiedAt: new Date() } }),
  ]);
  const zone = await db.shippingZone.create({ data: { code: `TEST-${suffix}`, displayName: 'Test delivery zone', enabled: true, feeVnd: 30000n } });
  const category = await db.category.create({ data: { slug: `test-coffee-${suffix}`, name: 'Test coffee' } });
  const product = await db.product.create({ data: { slug: `test-robusta-${suffix}`, categoryId: category.id, name: 'Test Robusta coffee', description: 'Test fixture only', status: 'PUBLISHED', confirmed: true } });
  const variant = await db.variant.create({ data: { productId: product.id, sku: `TEST-COFFEE-${suffix}`, label: 'Test 250 g pack', packDetails: '250 g', priceVnd: 100000n, stock: 5, saleEnabled: true } });
  const cart = await db.cart.create({ data: { userId: customer.id } });
  const settings = await db.storeSettings.findFirst();
  if (settings) await db.storeSettings.update({ where: { id: settings.id }, data: { salesEnabled: true } });
  else await db.storeSettings.create({ data: { salesEnabled: true } });
  return {
    customer: { id: customer.id, email: customer.email, password: TEST_PASSWORD },
    otherCustomer: { id: otherCustomer.id, email: otherCustomer.email, password: TEST_PASSWORD },
    admin: { id: admin.id, email: admin.email, password: TEST_PASSWORD },
    variant: { id: variant.id, sku: variant.sku, priceVnd: 100000 },
    product: { id: product.id, slug: product.slug },
    zone: { id: zone.id, code: zone.code },
    address: { recipient: 'Test Recipient', phone: '0000000000', zoneId: zone.id, line1: 'Test address', note: 'Test only' },
    cartId: cart.id,
  };
}
