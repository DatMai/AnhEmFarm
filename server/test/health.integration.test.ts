import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
      const r = await h.request('GET', '/health/ready');
      expect(r.status).toBe(503);
      expect(r.body).toEqual({ status: 'unavailable' });
    } finally {
      rmSync(pending, { recursive: true, force: true });
    }
  });

  it('rejects an empty database URL before bootstrapping', () => {
    expect(() => validateConfig({ ...readConfig(), databaseUrl: '' })).toThrow('Invalid configuration');
  });
});
