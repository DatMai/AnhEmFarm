import { config as loadDotEnv } from 'dotenv';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

loadDotEnv({ path: resolve(import.meta.dirname, '../.env.dev'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
