import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

  it('is not ready without migrations', async () => {
    const r = await h.request('GET', '/health/ready');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ status: 'unavailable' });
  });

  it('rejects an empty database URL before bootstrapping', () => {
    expect(() => validateConfig({ ...readConfig(), databaseUrl: '' })).toThrow('Invalid configuration');
  });
});
