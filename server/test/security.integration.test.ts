import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { RateLimitService } from '../src/identity/rate-limit.service.js';
import { parseBody, uuidSchema } from '../src/http/schemas.js';
import { z } from 'zod';
import { startHarness, type Harness } from './harness.js';

describe('request security', () => {
  let first: Harness;
  let second: Harness;
  const origin = readConfig().origin;

  beforeAll(async () => {
    first = await startHarness();
    second = await startHarness();
  });
  afterAll(async () => { await second?.close(); await first?.close(); });

  it('rejects missing and foreign Origin before accepting a mutation', async () => {
    for (const headers of [{}, { Origin: 'https://attacker.example' }] as Record<string, string>[]) {
      const r = await first.request('POST', '/api/v1/auth/login', { email: 'test@example.test', password: 'x' }, headers);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('ORIGIN_REJECTED');
    }
  });

  it('rejects missing CSRF even with a valid Origin', async () => {
    const r = await first.request('POST', '/api/v1/auth/login', { email: 'test@example.test', password: 'x' }, { Origin: origin });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CSRF_REJECTED');
  });

  it('does not accept an anonymous token when a session cookie is present but unresolved', async () => {
    const csrf = await first.request('GET', '/api/v1/auth/csrf');
    const r = await first.request('POST', '/api/v1/auth/login', {}, {
      Origin: origin,
      Cookie: `${csrf.headers.get('set-cookie')!.split(';')[0]}; aef_session=fake`,
      'X-CSRF-Token': csrf.body.token,
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CSRF_REJECTED');
  });

  it('issues a signed anonymous cookie and rejects a forged token', async () => {
    const r = await first.request('GET', '/api/v1/auth/csrf');
    expect(r.status).toBe(200);
    expect(r.body.token).toMatch(/^[a-f0-9]{64}$/);
    const cookie = r.headers.get('set-cookie')!;
    expect(cookie).toContain('aef_csrf=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const forged = await first.request('POST', '/api/v1/auth/login', {}, { Origin: origin, Cookie: cookie.split(';')[0], 'X-CSRF-Token': '0'.repeat(64) });
    expect(forged.status).toBe(403);
    expect(forged.body.code).toBe('CSRF_REJECTED');
    const valid = await first.request('POST', '/api/v1/auth/login', {}, { Origin: origin, Cookie: cookie.split(';')[0], 'X-CSRF-Token': r.body.token });
    expect(valid.status).toBe(404); // Identity route belongs to Task 4.
  });

  it('shares atomic rate counters across app instances', async () => {
    const key = `test:${randomUUID()}`;
    const a = first.resolve(RateLimitService);
    const b = second.resolve(RateLimitService);
    const results = await Promise.all([a.consume(key, 2, 60_000), b.consume(key, 2, 60_000), a.consume(key, 2, 60_000)]);
    expect(results.filter(result => result.allowed)).toHaveLength(2);
    expect(results.filter(result => !result.allowed)).toHaveLength(1);
    expect(results.find(result => !result.allowed)?.retryAfter).toBeGreaterThan(0);
    await first.db.rateBucket.delete({ where: { key } });
  });

  it('returns Retry-After after the login pair policy is exhausted across instances', async () => {
    const csrf = await first.request('GET', '/api/v1/auth/csrf');
    const headers = { Origin: origin, Cookie: csrf.headers.get('set-cookie')!.split(';')[0], 'X-CSRF-Token': csrf.body.token };
    const body = { email: `limit-${randomUUID()}@example.test`, password: 'x' };
    for (let index = 0; index < 10; index++) {
      const app = index % 2 ? first : second;
      expect((await app.request('POST', '/api/v1/auth/login', body, { ...headers, 'X-Forwarded-For': `203.0.113.${index + 1}` })).status).toBe(404);
    }
    const blocked = await second.request('POST', '/api/v1/auth/login', body, headers);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('rejects unknown fields, invalid UUID and long strings but treats SQL-like text literally', () => {
    const schema = z.strictObject({ id: uuidSchema, note: z.string().max(20) });
    const id = randomUUID();
    expect(() => parseBody(schema, { id, note: 'ok', extra: 1 })).toThrow();
    expect(() => parseBody(schema, { id: 'not-uuid', note: 'ok' })).toThrow();
    expect(() => parseBody(schema, { id, note: 'x'.repeat(21) })).toThrow();
    expect(parseBody(schema, { id, note: "'; DROP TABLE users" })).toEqual({ id, note: "'; DROP TABLE users" });
  });
});
