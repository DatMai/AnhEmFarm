import { randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OutboxService } from '../email/outbox.service.js';
import { sha256 } from './session.service.js';

export type TokenPurpose = 'VERIFY' | 'RESET';
const invalid = () => new BadRequestException({ code: 'INVALID_TOKEN' });
const passwordOptions = { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

@Injectable()
export class TokenService {
  constructor(private readonly db: PrismaService, private readonly outbox: OutboxService) {}

  async issue(userId: string, purpose: TokenPurpose): Promise<void> {
    await withTransaction(this.db, tx => this.issueInTransaction(tx, userId, purpose));
  }

  async issueInTransaction(tx: Prisma.TransactionClient, userId: string, purpose: TokenPurpose): Promise<void> {
    const users = await tx.$queryRaw<Array<{ id: string; email: string; status: string; verifiedAt: Date | null }>>`
      SELECT id, email, status, "verifiedAt" FROM users WHERE id = ${userId}::uuid FOR UPDATE
    `;
    const user = users[0];
    if (!user || user.status !== 'ACTIVE' || (purpose === 'VERIFY' && user.verifiedAt)) return;
    const now = new Date();
    await tx.accountToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } });
    await tx.emailOutbox.updateMany({ where: { recipient: user.email, template: purpose, sentAt: null, exhaustedAt: null },
      data: { payload: null, exhaustedAt: now, lastErrorCode: 'TOKEN_REPLACED' } });
    const raw = randomBytes(32).toString('hex');
    const token = await tx.accountToken.create({ data: { userId, purpose, digest: sha256(raw),
      expiresAt: new Date(now.getTime() + (purpose === 'VERIFY' ? 24 : 1) * 3600_000) } });
    await this.outbox.enqueue(tx, { dedupeKey: `account-token:${token.id}`, recipient: user.email, template: purpose, payload: { token: raw } });
  }

  async consume(raw: string, purpose: TokenPurpose, newPassword?: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(raw) || (purpose === 'RESET' && (!newPassword || newPassword.length < 12 || newPassword.length > 128))) throw invalid();
    const passwordHash = purpose === 'RESET' ? await hash(newPassword!, passwordOptions) : undefined;
    await withTransaction(this.db, async tx => {
      const candidate = await tx.accountToken.findUnique({ where: { digest: sha256(raw) }, select: { userId: true } });
      if (!candidate) throw invalid();
      const users = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM users WHERE id = ${candidate.userId}::uuid FOR UPDATE
      `;
      if (users[0]?.status !== 'ACTIVE') throw invalid();
      const token = await tx.accountToken.findUnique({ where: { digest: sha256(raw) } });
      if (!token || token.purpose !== purpose || token.usedAt || token.expiresAt <= new Date()) throw invalid();
      await tx.accountToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      if (purpose === 'VERIFY') await tx.user.update({ where: { id: token.userId }, data: { verifiedAt: new Date() } });
      else {
        await tx.user.update({ where: { id: token.userId }, data: { passwordHash: passwordHash!, authVersion: { increment: 1 } } });
        await tx.session.deleteMany({ where: { userId: token.userId } });
      }
      await tx.emailOutbox.updateMany({ where: { dedupeKey: `account-token:${token.id}`, sentAt: null, exhaustedAt: null },
        data: { payload: null, exhaustedAt: new Date(), lastErrorCode: 'TOKEN_USED' } });
    });
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    if (next.length < 12 || next.length > 128) throw new BadRequestException({ code: 'INVALID_PASSWORD' });
    const nextHash = await hash(next, passwordOptions);
    await withTransaction(this.db, async tx => {
      const users = await tx.$queryRaw<Array<{ passwordHash: string; status: string }>>`
        SELECT "passwordHash", status FROM users WHERE id = ${userId}::uuid FOR UPDATE
      `;
      if (!users[0] || users[0].status !== 'ACTIVE' || !await verify(users[0].passwordHash, current)) {
        throw new BadRequestException({ code: 'INVALID_PASSWORD' });
      }
      await tx.user.update({ where: { id: userId }, data: { passwordHash: nextHash, authVersion: { increment: 1 } } });
      await tx.session.deleteMany({ where: { userId } });
    });
  }
}
