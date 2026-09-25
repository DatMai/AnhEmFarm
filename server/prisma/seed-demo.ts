import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadDotEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client.js';

loadDotEnv({ path: resolve(import.meta.dirname, '../../.env.dev'), quiet: true });

if (process.env.ALLOW_DEMO_SEED !== 'true' || process.env.APP_MODE === 'production' || process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed requires ALLOW_DEMO_SEED=true and a non-production environment');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const category = await db.category.upsert({ where: { slug: 'demo-coffee' }, update: {}, create: { slug: 'demo-coffee', name: 'Demo coffee' } });
  const product = await db.product.upsert({ where: { slug: 'demo-robusta' }, update: {}, create: { slug: 'demo-robusta', categoryId: category.id, name: 'Demo Robusta', description: 'Development demonstration only' } });
  await db.variant.upsert({ where: { sku: 'DEMO-ROBUSTA-250G' }, update: {}, create: { productId: product.id, sku: 'DEMO-ROBUSTA-250G', label: '250 g', packDetails: '250 g', stock: 0, saleEnabled: false } });
  const settings = await db.storeSettings.findFirst();
  if (settings) await db.storeSettings.update({ where: { id: settings.id }, data: { salesEnabled: false } });
  else await db.storeSettings.create({ data: { salesEnabled: false } });
} finally {
  await db.$disconnect();
}
