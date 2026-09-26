import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';
import type { EmailTemplate } from './email.templates.js';

export interface EnqueueEmail { dedupeKey: string; recipient: string; template: EmailTemplate; payload: { token: string } }

@Injectable()
export class OutboxService {
  private readonly key: Buffer;
  constructor(private readonly db: PrismaService, @Inject(APP_CONFIG) config: AppConfig) {
    if (config.emailPayloadKey.length < 32) throw new Error('EMAIL_PAYLOAD_KEY must be at least 32 characters');
    this.key = createHash('sha256').update(config.emailPayloadKey).digest();
  }

  encrypt(payload: { token: string }): string {
    const nonce = randomBytes(12);
    const clear = Buffer.from(JSON.stringify(payload));
    try {
      const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
      const ciphertext = Buffer.concat([cipher.update(clear), cipher.final()]);
      return `v1:${nonce.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
    } finally { clear.fill(0); }
  }

  decrypt(encrypted: string): { token: string } {
    const [version, nonce, tag, ciphertext] = encrypted.split(':');
    if (version !== 'v1' || !nonce || !tag || !ciphertext) throw new Error('Invalid email payload');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(nonce, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const clear = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
    try { return JSON.parse(clear.toString('utf8')) as { token: string }; }
    finally { clear.fill(0); }
  }

  async enqueue(tx: Prisma.TransactionClient, input: EnqueueEmail): Promise<void> {
    await tx.emailOutbox.create({ data: { dedupeKey: input.dedupeKey, recipient: input.recipient,
      template: input.template, payload: this.encrypt(input.payload), availableAt: new Date() } });
  }

  async status(): Promise<{ pending: number; exhaustedCount: number; exhausted: Array<{ id: string; template: string; attempts: number; lastErrorCode: string | null }> }> {
    const [pending, exhaustedCount, rows] = await Promise.all([
      this.db.emailOutbox.count({ where: { sentAt: null, exhaustedAt: null } }),
      this.db.emailOutbox.count({ where: { exhaustedAt: { not: null } } }),
      this.db.emailOutbox.findMany({ where: { exhaustedAt: { not: null } }, select: { id: true, template: true, attempts: true, lastErrorCode: true }, orderBy: { exhaustedAt: 'desc' }, take: 100 }),
    ]);
    return { pending, exhaustedCount, exhausted: rows };
  }
}
