import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startHarness, type Harness } from './harness.js';
import { readConfig, validateConfig } from '../src/config.js';

describe('health', () => {
  let h: Harness;

  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h?.close(); });

  it('does not disclose infrastructure', async () => {
    const r = await h.request('GET', '/health/live');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok' });
  });

  it('is ready after all migrations are applied', async () => {
    const r = await h.request('GET', '/health/ready');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok' });
  });

  it('is unavailable while an expected migration is pending', async () => {
    const pending = mkdtempSync(resolve(process.cwd(), 'prisma/migrations/test-pending-'));
    try {
      writeFileSync(resolve(pending, 'migration.sql'), '-- pending test migration\n');
      const r = await h.request('GET', '/health/ready');
      expect(r.status).toBe(503);
      expect(r.body).toEqual({ status: 'unavailable' });
    } finally {
      rmSync(pending, { recursive: true, force: true });
    }
  });

  it('is unavailable when an applied migration has a stale checksum', async () => {
    const rows = await h.db.$queryRaw<Array<{ id: string; checksum: string }>>`
      SELECT id, checksum FROM _prisma_migrations WHERE migration_name = '202609250001_initial' AND finished_at IS NOT NULL
    `;
    const row = rows[0];
    expect(row).toBeDefined();
    try {
      await h.db.$executeRaw`UPDATE _prisma_migrations SET checksum = ${'0'.repeat(64)} WHERE id = ${row.id}`;
      const r = await h.request('GET', '/health/ready');
      expect(r.status).toBe(503);
    } finally {
      await h.db.$executeRaw`UPDATE _prisma_migrations SET checksum = ${row.checksum} WHERE id = ${row.id}`;
    }
  });

  it('rejects an empty database URL before bootstrapping', () => {
    expect(() => validateConfig({ ...readConfig(), databaseUrl: '' })).toThrow('Invalid configuration');
  });
});
