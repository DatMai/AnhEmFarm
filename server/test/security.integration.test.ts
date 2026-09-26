import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { RateLimitService } from '../src/identity/rate-limit.service.js';
import { parseBody, uuidSchema } from '../src/http/schemas.js';
import { rateKey, requestIp } from '../src/http/request-context.js';
import { SafeExceptionFilter } from '../src/http/error.filter.js';
import { z } from 'zod';
import { startHarness, type Harness } from './harness.js';

@Controller('validate')
class ValidationController {
  @Post()
  validate(@Body() body: unknown): unknown {
    return parseBody(z.strictObject({ id: uuidSchema, note: z.string().max(20) }), body);
  }
}

@Module({ controllers: [ValidationController] })
class ValidationTestModule {}

describe('request security', () => {
  let first: Harness;
  let second: Harness;
  const origin = readConfig().origin;

  beforeAll(async () => {
    first = await startHarness();
    second = await startHarness();
    await first.db.rateBucket.deleteMany({ where: { key: { in: [rateKey(readConfig(), 'loginIp', '127.0.0.1'), rateKey(readConfig(), 'loginPair', '127.0.0.1:')] } } });
  });
  afterAll(async () => {
    if (first) await first.db.rateBucket.deleteMany({ where: { key: { in: [rateKey(readConfig(), 'loginIp', '127.0.0.1'), rateKey(readConfig(), 'loginPair', '127.0.0.1:')] } } });
    await second?.close(); await first?.close();
  });

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
    expect(valid.status).toBe(422);
    expect(valid.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email', code: expect.any(String) })]));
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

  it('limits by IP before creating per-email login buckets', async () => {
    const app = await startHarness({ ratePolicies: { loginIp: { limit: 1, windowMs: 60_000 } } });
    const csrf = await app.request('GET', '/api/v1/auth/csrf');
    const headers = { Origin: origin, Cookie: csrf.headers.get('set-cookie')!.split(';')[0], 'X-CSRF-Token': csrf.body.token };
    const firstEmail = `first-${randomUUID()}@example.test`;
    const secondEmail = `second-${randomUUID()}@example.test`;
    const pairKey = rateKey(readConfig(), 'loginPair', `127.0.0.1:${secondEmail}`);
    try {
      await app.db.rateBucket.deleteMany({ where: { key: rateKey(readConfig(), 'loginIp', '127.0.0.1') } });
      expect((await app.request('POST', '/api/v1/auth/login', { email: firstEmail, password: 'x' }, headers)).status).toBe(401);
      expect((await app.request('POST', '/api/v1/auth/login', { email: secondEmail, password: 'x' }, headers)).status).toBe(429);
      expect(await app.db.rateBucket.findUnique({ where: { key: pairKey } })).toBeNull();
    } finally {
      await app.db.rateBucket.deleteMany({ where: { key: { in: [rateKey(readConfig(), 'loginIp', '127.0.0.1'), rateKey(readConfig(), 'loginPair', `127.0.0.1:${firstEmail}`), pairKey] } } });
      await app.close();
    }
  });

  it('removes expired rate buckets without touching active buckets', async () => {
    const expired = `expired:${randomUUID()}`, active = `active:${randomUUID()}`;
    await first.db.rateBucket.createMany({ data: [
      { key: expired, count: 1, windowEndsAt: new Date(Date.now() - 60_000) },
      { key: active, count: 1, windowEndsAt: new Date(Date.now() + 60_000) },
    ] });
    try {
      expect(await first.resolve(RateLimitService).pruneExpired()).toBeGreaterThanOrEqual(1);
      expect(await first.db.rateBucket.findUnique({ where: { key: expired } })).toBeNull();
      expect(await first.db.rateBucket.findUnique({ where: { key: active } })).not.toBeNull();
    } finally { await first.db.rateBucket.deleteMany({ where: { key: { in: [expired, active] } } }); }
  });

  it('returns Retry-After after the login pair policy is exhausted across instances', async () => {
    const ipKey = rateKey(readConfig(), 'loginIp', '127.0.0.1');
    await first.db.rateBucket.deleteMany({ where: { key: ipKey } });
    const csrf = await first.request('GET', '/api/v1/auth/csrf');
    const headers = { Origin: origin, Cookie: csrf.headers.get('set-cookie')!.split(';')[0], 'X-CSRF-Token': csrf.body.token };
    const body = { email: `limit-${randomUUID()}@example.test`, password: 'x' };
    const pairKey = rateKey(readConfig(), 'loginPair', `127.0.0.1:${body.email}`);
    try {
      for (let index = 0; index < 10; index++) {
        const app = index % 2 ? first : second;
        expect((await app.request('POST', '/api/v1/auth/login', body, { ...headers, 'X-Forwarded-For': `203.0.113.${index + 1}` })).status).toBe(401);
      }
      const blocked = await second.request('POST', '/api/v1/auth/login', body, headers);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    } finally {
      await first.db.rateBucket.deleteMany({ where: { key: { in: [ipKey, pairKey] } } });
    }
  });

  it('uses only the verified last proxy hop and rejects invalid forwarded IPs', () => {
    const config = { ...readConfig(), trustedProxyAddress: '127.0.0.1' };
    const makeRequest = (peer: string, forwarded: string) => ({
      socket: { remoteAddress: peer },
      header: (name: string) => name === 'x-forwarded-for' ? forwarded : undefined,
    }) as unknown as Request;
    expect(requestIp(makeRequest('127.0.0.1', '198.51.100.1, 203.0.113.7'), config)).toBe('203.0.113.7');
    expect(requestIp(makeRequest('127.0.0.1', '198.51.100.1, attacker'), config)).toBe('127.0.0.1');
    expect(requestIp(makeRequest('127.0.0.2', '198.51.100.1, 203.0.113.7'), config)).toBe('127.0.0.2');
  });

  it('returns HTTP 422 with safe field codes and preserves SQL-like text as literal data', async () => {
    const app = await NestFactory.create(ValidationTestModule, { logger: false });
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/validate`;
    const post = async (body: unknown) => {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const id = randomUUID();
    try {
      for (const body of [{ id, note: 'ok', extra: 1 }, { id: 'not-uuid', note: 'ok' }, { id, note: 'x'.repeat(21) }]) {
        const result = await post(body);
        expect(result.status).toBe(422);
        expect(result.body.code).toBe('VALIDATION_FAILED');
        expect(result.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ field: expect.any(String), code: expect.any(String) })]));
        expect(JSON.stringify(result.body)).not.toContain('stack');
      }
      expect(await post({ id, note: "'; DROP TABLE users" })).toEqual({ status: 201, body: { id, note: "'; DROP TABLE users" } });
    } finally { await app.close(); }
  });
});
