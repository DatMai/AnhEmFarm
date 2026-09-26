import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { TokenService } from '../src/identity/token.service.js';
import { EmailWorker, RecordingEmailTransport } from '../src/email/email.worker.js';
import { TEST_PASSWORD } from './fixtures.js';
import { rateKey } from '../src/http/request-context.js';
import { readConfig } from '../src/config.js';

describe('account tokens', () => {
  let h: Harness;
  let tokens: TokenService;
  let worker: EmailWorker;
  let transport: RecordingEmailTransport;
  beforeAll(async () => {
    h = await startHarness();
    await h.db.rateBucket.deleteMany({ where: { key: rateKey(readConfig(), 'emailIp', '127.0.0.1') } });
    tokens = h.resolve(TokenService);
    worker = h.resolve(EmailWorker);
    transport = h.resolve(RecordingEmailTransport);
  });
  afterAll(async () => {
    if (h) await h.db.rateBucket.deleteMany({ where: { key: rateKey(readConfig(), 'emailIp', '127.0.0.1') } });
    await h?.close();
  });
  const user = async () => h.db.user.create({ data: {
    email: `token-${randomUUID()}@example.test`, name: 'Token Test', passwordHash: '$argon2id$v=19$m=65536,t=3,p=1$invalid$invalid',
  } });
  const deliveredToken = async (purpose: 'VERIFY' | 'RESET') => {
    await worker.tick();
    const message = transport.messages.at(-1)!;
    const url = new URL(message.text.match(/https?:\/\/\S+/)![0]);
    expect(url.pathname).toBe(purpose === 'VERIFY' ? '/verify-email' : '/reset-password');
    return url.searchParams.get('token')!;
  };

  it('issues encrypted verification mail; new issue invalidates old, consumed token is single-use', async () => {
    const u = await user();
    await tokens.issue(u.id, 'VERIFY');
    const first = await deliveredToken('VERIFY');
    await tokens.issue(u.id, 'VERIFY');
    const second = await deliveredToken('VERIFY');
    expect(first).not.toBe(second);
    await expect(tokens.consume(first, 'VERIFY')).rejects.toThrow();
    await tokens.consume(second, 'VERIFY');
    expect((await h.db.user.findUniqueOrThrow({ where: { id: u.id } })).verifiedAt).not.toBeNull();
    await expect(tokens.consume(second, 'VERIFY')).rejects.toThrow();
    const rows = await h.db.emailOutbox.findMany({ where: { recipient: u.email } });
    expect(rows.every(row => row.payload === null)).toBe(true);
  });

  it('rejects expired tokens and allows one concurrent reset, revoking sessions', async () => {
    const u = await user();
    await tokens.issue(u.id, 'RESET');
    const expired = await deliveredToken('RESET');
    await h.db.accountToken.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(tokens.consume(expired, 'RESET', 'Changed-password-2026!')).rejects.toThrow();
    await tokens.issue(u.id, 'RESET');
    const raw = await deliveredToken('RESET');
    await h.db.session.create({ data: { userId: u.id, digest: randomUUID(), csrfDigest: randomUUID(), expiresAt: new Date(Date.now() + 100000), authVersion: u.authVersion } });
    const results = await Promise.allSettled([
      tokens.consume(raw, 'RESET', 'Changed-password-2026!'),
      tokens.consume(raw, 'RESET', 'Another-password-2026!'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await h.db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await h.db.user.findUniqueOrThrow({ where: { id: u.id } })).authVersion).toBe(u.authVersion + 1);
    await expect(tokens.consume(raw, 'RESET', TEST_PASSWORD)).rejects.toThrow();
  });

  it('serves neutral recovery responses, rate limits requests, and only consumes via POST', async () => {
    const u = await user();
    const client = h.client();
    const absent = `absent-${randomUUID()}@example.test`;
    const forgotten = await client.request('POST', '/api/v1/auth/forgot-password', { email: u.email });
    const missing = await client.request('POST', '/api/v1/auth/forgot-password', { email: absent });
    expect(forgotten).toMatchObject({ status: 202, body: { status: 'accepted' } });
    expect(missing).toMatchObject({ status: 202, body: { status: 'accepted' } });
    const raw = await deliveredToken('RESET');
    expect((await client.request('GET', `/api/v1/auth/reset-password?token=${raw}`)).status).toBe(404);
    for (let n = 0; n < 2; n++) expect((await client.request('POST', '/api/v1/auth/forgot-password', { email: absent })).status).toBe(202);
    expect((await client.request('POST', '/api/v1/auth/forgot-password', { email: absent })).status).toBe(429);
    expect((await client.request('POST', '/api/v1/auth/reset-password', { token: raw, password: 'New-password-2026!' })).status).toBe(204);
  });

  it('keeps both email request paths inside the same response timing floor', async () => {
    const u = await user();
    const client = h.client();
    for (const path of ['/api/v1/auth/forgot-password', '/api/v1/auth/resend-verification']) {
      const elapsed: number[] = [];
      for (const address of [u.email, `missing-${randomUUID()}@example.test`]) {
        const start = performance.now();
        const result = await client.request('POST', path, { email: address });
        elapsed.push(performance.now() - start);
        expect(result).toMatchObject({ status: 202, body: { status: 'accepted' } });
      }
      expect(Math.min(...elapsed)).toBeGreaterThanOrEqual(150);
      expect(Math.abs(elapsed[0] - elapsed[1])).toBeLessThan(120);
    }
    expect(await h.db.emailOutbox.count({ where: { recipient: u.email } })).toBe(2);
  });

  it('requires the current password to change it and removes existing sessions', async () => {
    const email = `change-${randomUUID()}@example.test`;
    const client = h.client();
    expect((await client.request('POST', '/api/v1/auth/register', { email, name: 'Change Test', password: TEST_PASSWORD })).status).toBe(202);
    const u = await h.db.user.findUniqueOrThrow({ where: { email } });
    expect(await h.db.emailOutbox.count({ where: { recipient: email, template: 'VERIFY' } })).toBe(1);
    expect((await client.request('POST', '/api/v1/auth/login', { email, password: TEST_PASSWORD })).status).toBe(200);
    expect((await client.request('POST', '/api/v1/auth/change-password', { currentPassword: 'wrong', newPassword: 'New-password-2026!' })).status).toBe(400);
    expect((await client.request('POST', '/api/v1/auth/change-password', { currentPassword: TEST_PASSWORD, newPassword: 'New-password-2026!' })).status).toBe(204);
    expect(await h.db.session.count({ where: { userId: u.id } })).toBe(0);
    expect((await client.request('POST', '/api/v1/auth/login', { email, password: TEST_PASSWORD })).status).toBe(401);
    expect((await client.request('POST', '/api/v1/auth/login', { email, password: 'New-password-2026!' })).status).toBe(200);
  });
});
