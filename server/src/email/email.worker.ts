import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';
import { sha256 } from '../identity/session.service.js';
import { renderEmail, type EmailMessage, type EmailTemplate, type EmailPayload } from './email.templates.js';
import { OutboxService } from './outbox.service.js';

export const EMAIL_TRANSPORT = 'EMAIL_TRANSPORT';
export interface EmailTransport { send(message: EmailMessage): Promise<void> }

export class RecordingEmailTransport implements EmailTransport {
  readonly messages: EmailMessage[] = [];
  failNext = false;
  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) { this.failNext = false; throw new Error('Simulated SMTP error'); }
    this.messages.push(message);
  }
}

export class SmtpEmailTransport implements EmailTransport {
  private readonly client: ReturnType<typeof nodemailer.createTransport>;
  private readonly from: string;
  constructor(config: AppConfig) {
    this.client = nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
      requireTLS: config.mode === 'production' && config.smtp.port !== 465,
      ...(config.smtp.user ? { auth: { user: config.smtp.user, pass: config.smtp.password ?? '' } } : {}),
    });
    this.from = config.smtp.from ?? '';
  }
  async send(message: EmailMessage): Promise<void> {
    await this.client.sendMail({ ...message, from: this.from });
  }
}

interface ClaimedJob { id: string; leaseId: string; recipient: string; template: string; payload: string | null }
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

@Injectable()
export class EmailWorker {
  constructor(private readonly db: PrismaService, private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig, @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport) {}

  async claim(now = new Date(), limit = 20): Promise<ClaimedJob[]> {
    const batchSize = Math.max(1, Math.min(20, Math.trunc(limit)));
    return this.db.$transaction(async tx => {
      const ids = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM email_outbox
        WHERE "sentAt" IS NULL AND "exhaustedAt" IS NULL AND "availableAt" <= ${now}
          AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now})
        ORDER BY "availableAt", id FOR UPDATE SKIP LOCKED LIMIT ${batchSize}
      `;
      const leaseUntil = new Date(now.getTime() + 120_000);
      const jobs: ClaimedJob[] = [];
      for (const { id } of ids) {
        const leaseId = randomUUID();
        const job = await tx.emailOutbox.update({ where: { id }, data: { leaseId, leaseUntil } });
        jobs.push({ id, leaseId, recipient: job.recipient, template: job.template, payload: job.payload });
      }
      return jobs;
    });
  }

  async ack(id: string, leaseId: string): Promise<boolean> {
    const result = await this.db.emailOutbox.updateMany({ where: { id, leaseId, sentAt: null, exhaustedAt: null },
      data: { sentAt: new Date(), payload: null, leaseId: null, leaseUntil: null, lastErrorCode: null } });
    return result.count === 1;
  }

  private async discard(job: ClaimedJob, code: string): Promise<void> {
    await this.db.emailOutbox.updateMany({ where: { id: job.id, leaseId: job.leaseId, sentAt: null, exhaustedAt: null },
      data: { exhaustedAt: new Date(), payload: null, leaseId: null, leaseUntil: null, lastErrorCode: code } });
  }

  private async fail(job: ClaimedJob): Promise<void> {
    const row = await this.db.emailOutbox.findUnique({ where: { id: job.id }, select: { attempts: true, leaseId: true } });
    if (!row || row.leaseId !== job.leaseId) return;
    const attempts = row.attempts + 1;
    const exhausted = attempts > BACKOFF_MINUTES.length;
    await this.db.emailOutbox.updateMany({ where: { id: job.id, leaseId: job.leaseId, exhaustedAt: null }, data: {
      attempts, lastErrorCode: 'DELIVERY_FAILED', leaseId: null, leaseUntil: null,
      availableAt: new Date(Date.now() + (BACKOFF_MINUTES[attempts - 1] ?? 0) * 60_000),
      ...(exhausted ? { exhaustedAt: new Date(), payload: null } : {}),
    } });
  }

  private async deliver(job: ClaimedJob): Promise<void> {
    if (!job.payload) { await this.discard(job, 'PAYLOAD_UNAVAILABLE'); return; }
    if (!['VERIFY', 'RESET', 'ORDER_CREATED', 'ORDER_STATUS_CHANGED'].includes(job.template)) { await this.fail(job); return; }
    let payload: EmailPayload;
    try {
      payload = this.outbox.decrypt<EmailPayload>(job.payload);
      if (job.template === 'ORDER_CREATED') {
        if (!('totalVnd' in payload)) throw new Error('Invalid order payload');
        const order = await this.db.order.findUnique({ where: { id: payload.orderId }, include: { items: { orderBy: [{ variantId: 'asc' }, { selectionKey: 'asc' }] } } });
        if (!order || Number(order.totalVnd) !== payload.totalVnd) throw new Error('Invalid order payload');
        payload = { ...payload, items: order.items.map(item => ({ name: item.name, label: item.label, optionGroupLabel: item.optionGroupLabel, optionLabel: item.optionLabel, quantity: item.quantity })) };
      } else if (job.template === 'ORDER_STATUS_CHANGED') {
        if (!('status' in payload)) throw new Error('Invalid order status payload');
        const [order, event] = await Promise.all([
          this.db.order.findUnique({ where: { id: payload.orderId }, select: { user: { select: { email: true } } } }),
          this.db.orderEvent.findUnique({ where: { id: payload.eventId } }),
        ]);
        if (!order || order.user.email !== job.recipient || !event || event.orderId !== payload.orderId || event.toStatus !== payload.status) {
          throw new Error('Invalid order status payload');
        }
      } else {
        if (!('token' in payload) || typeof payload.token !== 'string') throw new Error('Invalid email payload');
        const token = await this.db.accountToken.findUnique({ where: { digest: sha256(payload.token) } });
        if (!token || token.usedAt || token.expiresAt <= new Date()) { await this.discard(job, 'TOKEN_UNUSABLE'); return; }
      }
    } catch { await this.fail(job); return; }
    const timer = setInterval(() => {
      void this.db.emailOutbox.updateMany({ where: { id: job.id, leaseId: job.leaseId, sentAt: null, exhaustedAt: null },
        data: { leaseUntil: new Date(Date.now() + 120_000) } }).catch(() => undefined);
    }, 30_000);
    try {
      await this.transport.send(renderEmail(this.config, job.recipient, job.template as EmailTemplate, payload));
      await this.ack(job.id, job.leaseId);
    } catch { await this.fail(job); }
    finally { clearInterval(timer); if ('token' in payload) payload.token = ''; }
  }

  async tick(now?: Date): Promise<number> {
    const sweepTime = now ?? new Date();
    await this.db.$executeRaw`
      UPDATE email_outbox AS o SET payload = NULL, "exhaustedAt" = ${sweepTime}, "lastErrorCode" = 'TOKEN_UNUSABLE'
      WHERE o.payload IS NOT NULL AND o."dedupeKey" LIKE 'account-token:%'
        AND o."sentAt" IS NULL AND o."exhaustedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM account_tokens AS t
          WHERE o."dedupeKey" = 'account-token:' || t.id::text
            AND (t."expiresAt" <= ${sweepTime} OR t."usedAt" IS NOT NULL)
        )
    `;
    let processed = 0;
    while (processed < 20) {
      const [job] = await this.claim(now ?? new Date(), 1);
      if (!job) break;
      await this.deliver(job);
      processed++;
    }
    return processed;
  }
}
