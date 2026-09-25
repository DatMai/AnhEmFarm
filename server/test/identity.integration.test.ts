import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { Pool } from 'pg';
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
    const stale = await h.request('GET', '/api/v1/auth/csrf', undefined, { Cookie: replayCookie });
    expect(stale.status).toBe(401);
    expect(stale.headers.get('set-cookie')).toMatch(/aef_session=;.*Max-Age=0/);
    const replayMutation = await h.request('POST', '/api/v1/auth/logout', undefined, {
      Cookie: replayCookie, Origin: readConfig().origin, 'X-CSRF-Token': sessionCsrf.body.token,
    });
    expect(replayMutation.status).toBe(403);
    expect(replayMutation.body.code).toBe('CSRF_REJECTED');
    expect(replayMutation.headers.get('set-cookie')).toMatch(/aef_session=;.*Max-Age=0/);
  });

  it('refuses suspended users and stale session cookies', async () => {
    const c = h.client();
    expect((await c.request('POST', '/api/v1/auth/login', { email: s.otherCustomer.email, password: s.otherCustomer.password })).status).toBe(200);
    await h.db.user.update({ where: { id: s.otherCustomer.id }, data: { status: 'SUSPENDED', authVersion: { increment: 1 } } });
    const stale = await c.request('GET', '/api/v1/auth/csrf');
    expect(stale.status).toBe(401);
    expect(stale.headers.get('set-cookie')).toMatch(/aef_session=;.*Max-Age=0/);
    expect((await c.request('GET', '/api/v1/auth/me')).body.user).toBeNull();
    const fresh = await c.request('GET', '/api/v1/auth/csrf');
    expect(fresh.status).toBe(200);
    expect(fresh.body.token).toMatch(/^[a-f0-9]{64}$/);
    await h.db.user.update({ where: { id: s.otherCustomer.id }, data: { status: 'ACTIVE' } });
    expect((await c.request('POST', '/api/v1/auth/login', { email: s.otherCustomer.email, password: s.otherCustomer.password })).status).toBe(200);
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

  it('bootstraps the first admin through CLI with a secret file and audit in a fresh test database', async () => {
    const base = process.env.TEST_DATABASE_URL!;
    const database = `aef_bootstrap_${randomUUID().replaceAll('-', '').slice(0, 16)}_test`;
    const url = new URL(base); url.pathname = `/${database}`;
    const maintenance = new Pool({ connectionString: base });
    const temp = await mkdtemp(join(tmpdir(), 'aef-admin-test-'));
    const secretFile = join(temp, 'password');
    let db: PrismaClient | undefined;
    try {
      await maintenance.query(`CREATE DATABASE "${database}"`);
      execFileSync('npm', ['run', 'db:migrate'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
      const args = ['run', 'admin', '--', 'create', '--email', ' FIRST@EXAMPLE.TEST ', '--name', 'First Admin', '--password-file', secretFile];
      await writeFile(secretFile, 'Example-test-password-2026!\n', { mode: 0o600 });
      expect(() => execFileSync('npm', args, { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' })).toThrow();
      await writeFile(secretFile, 'Unique-test-admin-password-2026!\n', { mode: 0o600 });
      execFileSync('npm', args, { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' });
      db = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url.toString() })) });
      const admin = await db.user.findUniqueOrThrow({ where: { email: 'first@example.test' } });
      expect(admin.role).toBe('ADMIN');
      expect(admin.passwordHash).toMatch(/^\$argon2id\$/);
      expect(await db.auditLog.findFirst({ where: { action: 'ADMIN_BOOTSTRAP', actorId: admin.id, targetId: admin.id } })).not.toBeNull();
      expect(() => execFileSync('npm', args, { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe' })).toThrow();
    } finally {
      await db?.$disconnect();
      await maintenance.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await maintenance.end();
      await rm(temp, { recursive: true, force: true });
    }
  }, 30_000);
});
