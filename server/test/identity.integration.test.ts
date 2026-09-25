import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedScenario, type Scenario } from './fixtures.js';
import { startHarness, type Harness } from './harness.js';
import { executeAdmin, parseAdminArgs, validateAdminPassword } from '../src/cli/admin.js';
import { rateKey } from '../src/http/request-context.js';
import { readConfig } from '../src/config.js';

describe('identity', () => {
  let h: Harness;
  let s: Scenario;
  const limitKeys = () => ['registrationIp', 'loginIp'].map(scope => rateKey(readConfig(), scope, '127.0.0.1'));
  beforeAll(async () => { h = await startHarness(); await h.db.rateBucket.deleteMany({ where: { key: { in: limitKeys() } } }); s = await seedScenario(h.db); });
  afterAll(async () => { if (h) await h.db.rateBucket.deleteMany({ where: { key: { in: limitKeys() } } }); await h?.close(); });

  it('rejects submitted role and gives exact validation fields', async () => {
    const r = await h.client().request('POST', '/api/v1/auth/register', { email: `new-${randomUUID()}@example.test`, password: 'A-strong-test-password!', name: 'New User', role: 'ADMIN' });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ code: 'VALIDATION_FAILED', fields: [{ field: '', code: 'unrecognized_keys' }] });
  });

  it('normalizes duplicate email and responds neutrally', async () => {
    const c = h.client();
    const r = await c.request('POST', '/api/v1/auth/register', { email: ` ${s.customer.email.toUpperCase()} `, password: 'A-strong-test-password!', name: 'Duplicate' });
    expect(r.status).toBe(202);
    expect(await h.db.user.count({ where: { email: s.customer.email } })).toBe(1);
  });

  it('uses generic errors for invalid login', async () => {
    const c = h.client();
    for (const email of [s.customer.email, `absent-${randomUUID()}@example.test`]) {
      const r = await c.request('POST', '/api/v1/auth/login', { email, password: 'wrong-password-123' });
      expect(r.status).toBe(401);
      expect(r.body).toEqual({ code: 'INVALID_CREDENTIALS' });
    }
  });

  it('creates an authenticated session and revokes it on logout', async () => {
    const c = h.client();
    const login = await c.request('POST', '/api/v1/auth/login', { email: s.customer.email, password: s.customer.password });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ id: s.customer.id, role: 'CUSTOMER', verified: true });
    expect(JSON.stringify(login.body)).not.toMatch(/passwordHash|rawSession|csrfDigest|digest/);
    expect(login.headers.get('set-cookie')).toMatch(/aef_session=.*HttpOnly.*SameSite=Lax/);
    const replayCookie = login.headers.get('set-cookie')!.split(';')[0];
    const sessionCsrf = await h.request('GET', '/api/v1/auth/csrf', undefined, { Cookie: replayCookie });
    expect(sessionCsrf.status).toBe(200);
    expect(sessionCsrf.headers.get('set-cookie')).toBeNull();
    const anonymousCsrf = await h.request('GET', '/api/v1/auth/csrf');
    const rejected = await h.request('POST', '/api/v1/auth/logout', undefined, {
      Cookie: `${replayCookie}; ${anonymousCsrf.headers.get('set-cookie')!.split(';')[0]}`,
      Origin: readConfig().origin, 'X-CSRF-Token': anonymousCsrf.body.token,
    });
    expect(rejected.status).toBe(403);
    expect(rejected.body.code).toBe('CSRF_REJECTED');
    expect((await c.request('GET', '/api/v1/auth/me')).body.user.id).toBe(s.customer.id);
    const session = await h.db.session.findFirstOrThrow({ where: { userId: s.customer.id }, orderBy: { createdAt: 'desc' } });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86400_000);
    expect((await c.request('POST', '/api/v1/auth/logout')).status).toBe(204);
    expect((await c.request('GET', '/api/v1/auth/me')).body.user).toBeNull();
    expect(await h.db.session.findUnique({ where: { id: session.id } })).toBeNull();
    expect((await h.request('GET', '/api/v1/auth/me', undefined, { Cookie: replayCookie })).body.user).toBeNull();
    expect((await h.request('GET', '/api/v1/auth/csrf', undefined, { Cookie: replayCookie })).status).toBe(401);
  });

  it('refuses suspended users and stale session cookies', async () => {
    const c = h.client();
    expect((await c.request('POST', '/api/v1/auth/login', { email: s.otherCustomer.email, password: s.otherCustomer.password })).status).toBe(200);
    await h.db.user.update({ where: { id: s.otherCustomer.id }, data: { status: 'SUSPENDED', authVersion: { increment: 1 } } });
    expect((await c.request('GET', '/api/v1/auth/me')).body.user).toBeNull();
    expect((await c.request('GET', '/api/v1/auth/csrf')).status).toBe(401);
    expect((await c.request('POST', '/api/v1/auth/logout')).status).toBe(403);
  });

  it('gives admin a 12 hour session', async () => {
    const c = h.client();
    expect((await c.request('POST', '/api/v1/auth/login', { email: s.admin.email, password: s.admin.password })).status).toBe(200);
    const session = await h.db.session.findFirstOrThrow({ where: { userId: s.admin.id }, orderBy: { createdAt: 'desc' } });
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(11.9 * 3600_000);
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThan(12.1 * 3600_000);
  });

  it('provisions additional admins only with audited CLI grant', async () => {
    expect(() => parseAdminArgs(['create', '--email', 'x@example.test', '--name', 'X', '--password', 'secret'])).toThrow();
    expect(() => validateAdminPassword('admin')).toThrow();
    expect(() => validateAdminPassword('Example-test-password-2026!')).toThrow();
    expect(() => validateAdminPassword('short')).toThrow();
    const email = `grant-${randomUUID()}@example.test`;
    const client = h.client();
    expect((await client.request('POST', '/api/v1/auth/register', { email, password: 'A-strong-test-password!', name: 'Grant Target' })).status).toBe(202);
    const target = await h.db.user.findUniqueOrThrow({ where: { email } });
    expect(target.role).toBe('CUSTOMER');
    expect((await client.request('POST', '/api/v1/auth/grant', { email })).status).toBe(404);
    await executeAdmin(h.db, parseAdminArgs(['grant', '--email', email, '--actor-email', s.admin.email]));
    expect((await h.db.user.findUniqueOrThrow({ where: { email } })).role).toBe('ADMIN');
    expect(await h.db.auditLog.findFirst({ where: { targetId: target.id, action: 'ADMIN_GRANTED', actorId: s.admin.id } })).not.toBeNull();
  });
});
