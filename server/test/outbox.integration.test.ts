import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './harness.js';
import { OutboxService } from '../src/email/outbox.service.js';
import { EmailWorker, RecordingEmailTransport, type EmailTransport } from '../src/email/email.worker.js';
import type { EmailMessage } from '../src/email/email.templates.js';
import { sha256 } from '../src/identity/session.service.js';
import { seedScenario } from './fixtures.js';
import { PrismaService } from '../src/db/prisma.service.js';
import { readConfig } from '../src/config.js';

describe('email outbox', () => {
  let h: Harness;
  let outbox: OutboxService;
  let worker: EmailWorker;
  let transport: RecordingEmailTransport;
  beforeAll(async () => {
    h = await startHarness(); outbox = h.resolve(OutboxService); worker = h.resolve(EmailWorker); transport = h.resolve(RecordingEmailTransport);
    await h.db.emailOutbox.updateMany({ where: { sentAt: null, exhaustedAt: null }, data: { availableAt: new Date(Date.now() + 86400_000) } });
  });
  afterAll(async () => h?.close());
  const enqueue = async (tokenStyle = false) => {
    const key = randomUUID();
    const user = await h.db.user.create({ data: { email: `mail-${key}@example.test`, name: 'Mail Test', passwordHash: 'test' } });
    const token = await h.db.accountToken.create({ data: { userId: user.id, purpose: 'VERIFY', digest: sha256(key), expiresAt: new Date(Date.now() + 3600_000) } });
    const dedupeKey = tokenStyle ? `account-token:${token.id}` : key;
    await h.db.$transaction(tx => outbox.enqueue(tx, { dedupeKey, recipient: `mail-${key}@example.test`, template: 'VERIFY', payload: { token: key } }));
    return h.db.emailOutbox.findUniqueOrThrow({ where: { dedupeKey } });
  };
  it('encrypts payload and retries transport errors without losing a job', async () => {
    const job = await enqueue();
    expect(job.payload).not.toContain(job.dedupeKey);
    transport.failNext = true;
    expect(await worker.tick()).toBeGreaterThanOrEqual(1);
    const failed = await h.db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.attempts).toBe(1);
    expect(failed.sentAt).toBeNull();
    await h.db.emailOutbox.update({ where: { id: job.id }, data: { availableAt: new Date(Date.now() - 1) } });
    await worker.tick();
    expect((await h.db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } })).payload).toBeNull();
  });
  it('reclaims an expired lease and rejects a stale acknowledgement', async () => {
    const job = await enqueue();
    const oldLease = randomUUID();
    await h.db.emailOutbox.update({ where: { id: job.id }, data: { leaseId: oldLease, leaseUntil: new Date(Date.now() - 1000) } });
    const claimed = await worker.claim(new Date());
    expect(claimed.some(item => item.id === job.id)).toBe(true);
    expect(await worker.ack(job.id, oldLease)).toBe(false);
    expect((await h.db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } })).sentAt).toBeNull();
    await worker.tick();
  });
  it('erases an expired token payload even while the job is delayed', async () => {
    const job = await enqueue(true);
    await h.db.emailOutbox.update({ where: { id: job.id }, data: { availableAt: new Date(Date.now() + 86400_000) } });
    await h.db.accountToken.update({ where: { id: job.dedupeKey.slice('account-token:'.length) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await worker.tick();
    const expired = await h.db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } });
    expect(expired.payload).toBeNull();
    expect(expired.exhaustedAt).not.toBeNull();
  });
  it('retries a damaged encrypted payload without stopping later jobs', async () => {
    const broken = await enqueue();
    await h.db.emailOutbox.update({ where: { id: broken.id }, data: { payload: 'v1:invalid:invalid:invalid' } });
    const healthy = await enqueue();
    expect(await worker.tick()).toBeGreaterThanOrEqual(2);
    expect((await h.db.emailOutbox.findUniqueOrThrow({ where: { id: broken.id } })).attempts).toBe(1);
    expect((await h.db.emailOutbox.findUniqueOrThrow({ where: { id: healthy.id } })).sentAt).not.toBeNull();
  });
  it('uses bounded retry delays and exhausts after the final attempt', async () => {
    const job = await enqueue();
    await h.db.emailOutbox.update({ where: { id: job.id }, data: { payload: 'v1:invalid:invalid:invalid' } });
    const delays = [1, 5, 15, 60, 180];
    for (let attempt = 1; attempt <= 6; attempt++) {
      await h.db.emailOutbox.update({ where: { id: job.id }, data: { availableAt: new Date(Date.now() - 1000) } });
      const before = Date.now();
      await worker.tick();
      const row = await h.db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } });
      expect(row.attempts).toBe(attempt);
      if (attempt <= 5) expect(row.availableAt.getTime() - before).toBeGreaterThanOrEqual(delays[attempt - 1] * 60_000 - 1000);
      else {
        expect(row.exhaustedAt).not.toBeNull();
        expect(row.payload).toBeNull();
      }
    }
  });
  it('keeps live leases exclusive across workers', async () => {
    const job = await enqueue();
    const other = new EmailWorker(h.resolve(PrismaService), outbox, { ...readConfig(), mode: 'test' }, transport);
    const [first, second] = await Promise.all([worker.claim(new Date()), other.claim(new Date())]);
    expect([...first, ...second].filter(item => item.id === job.id)).toHaveLength(1);
    await worker.tick();
  });
  it('does not pre-lease later jobs while an SMTP send is blocked', async () => {
    const first = await enqueue();
    const second = await enqueue();
    await h.db.emailOutbox.update({ where: { id: first.id }, data: { availableAt: new Date(Date.now() - 60_000) } });
    let releaseSend!: () => void;
    let notifyStarted!: () => void;
    const release = new Promise<void>(resolve => { releaseSend = resolve; });
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const firstMessages: EmailMessage[] = [];
    const blocking: EmailTransport = { async send(message) {
      notifyStarted();
      await release;
      firstMessages.push(message);
    } };
    const config = { ...readConfig(), mode: 'test' as const };
    const db = h.resolve(PrismaService);
    const slow = new EmailWorker(db, outbox, config, blocking);
    const fastTransport = new RecordingEmailTransport();
    const fast = new EmailWorker(db, outbox, config, fastTransport);
    const slowTick = slow.tick();
    await started;
    try {
      expect((await h.db.emailOutbox.findUniqueOrThrow({ where: { id: first.id } })).leaseId).not.toBeNull();
      expect((await h.db.emailOutbox.findUniqueOrThrow({ where: { id: second.id } })).leaseId).toBeNull();
      const future = new Date(Date.now() + 3 * 60_000);
      await h.db.emailOutbox.update({ where: { id: first.id }, data: { leaseUntil: new Date(future.getTime() + 10 * 60_000) } });
      await fast.tick(future);
      expect(fastTransport.messages.filter(message => message.to === second.recipient)).toHaveLength(1);
      expect(fastTransport.messages.filter(message => message.to === first.recipient)).toHaveLength(0);
    } finally { releaseSend(); await slowTick; }
    expect(firstMessages.filter(message => message.to === first.recipient)).toHaveLength(1);
    expect(firstMessages.filter(message => message.to === second.recipient)).toHaveLength(0);
  });
  it('shows exhausted counts only to admins without exposing payloads', async () => {
    const scenario = await seedScenario(h.db);
    const job = await enqueue();
    await h.db.emailOutbox.update({ where: { id: job.id }, data: { exhaustedAt: new Date(), payload: null, lastErrorCode: 'DELIVERY_FAILED' } });
    const customer = h.client();
    await customer.request('POST', '/api/v1/auth/login', { email: scenario.customer.email, password: scenario.customer.password });
    expect((await customer.request('GET', '/api/v1/auth/email-outbox-status')).status).toBe(403);
    const admin = h.client();
    await admin.request('POST', '/api/v1/auth/login', { email: scenario.admin.email, password: scenario.admin.password });
    const result = await admin.request('GET', '/api/v1/auth/email-outbox-status');
    expect(result.status).toBe(200);
    expect(result.body.exhausted.some((item: { id: string }) => item.id === job.id)).toBe(true);
    expect(JSON.stringify(result.body)).not.toContain(job.dedupeKey);
    expect(JSON.stringify(result.body)).not.toMatch(/recipient|payload/);
  });
});
