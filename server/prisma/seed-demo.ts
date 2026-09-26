import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadDotEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDemoCatalog } from './demo-catalog.js';

loadDotEnv({ path: resolve(import.meta.dirname, '../../.env.dev'), quiet: true });

if (process.env.ALLOW_DEMO_SEED !== 'true' || process.env.APP_MODE === 'production' || process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed requires ALLOW_DEMO_SEED=true and a non-production environment');
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/_(dev|test)$/.test(databaseName)) throw new Error('Demo seed requires a database name ending _dev or _test');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  await db.$transaction(seedDemoCatalog);
} finally {
  await db.$disconnect();
}
