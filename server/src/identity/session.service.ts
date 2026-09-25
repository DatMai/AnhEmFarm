import { createHash, randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { stringifySetCookie } from 'cookie';
import type { Response } from 'express';
import type { AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';

export interface Actor { id: string; role: 'CUSTOMER' | 'ADMIN'; authVersion: number }
export const SESSION_COOKIE = 'aef_session';
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
export function clearSessionCookie(response: Response, config: AppConfig): void {
  response.append('Set-Cookie', stringifySetCookie({ name: SESSION_COOKIE, value: '', path: '/', httpOnly: true,
    sameSite: 'lax', secure: config.mode === 'production', maxAge: 0 }));
}

@Injectable()
export class SessionService {
  constructor(private readonly db: PrismaService) {}

  async create(user: { id: string; role: 'CUSTOMER' | 'ADMIN'; authVersion: number }): Promise<{ rawSession: string; csrfSecret: string }> {
    const rawSession = randomBytes(32).toString('hex');
    const csrfSecret = sha256(randomBytes(32).toString('hex'));
    const ttl = user.role === 'ADMIN' ? 12 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
    await this.db.session.create({ data: {
      digest: sha256(rawSession), userId: user.id, csrfDigest: csrfSecret,
      expiresAt: new Date(Date.now() + ttl), authVersion: user.authVersion,
    } });
    return { rawSession, csrfSecret };
  }

  async findValid(raw: string): Promise<{ actor: Actor; csrfSecret: string }> {
    if (!/^[a-f0-9]{64}$/.test(raw)) throw new UnauthorizedException('Sign in to continue.');
    const session = await this.db.session.findUnique({ where: { digest: sha256(raw) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || session.authVersion !== session.user.authVersion ||
      session.user.status !== 'ACTIVE') throw new UnauthorizedException('Sign in to continue.');
    return { actor: { id: session.user.id, role: session.user.role, authVersion: session.user.authVersion }, csrfSecret: session.csrfDigest };
  }

  async authenticate(raw: string): Promise<Actor> { return (await this.findValid(raw)).actor; }
  async revoke(raw: string): Promise<void> {
    if (/^[a-f0-9]{64}$/.test(raw)) await this.db.session.deleteMany({ where: { digest: sha256(raw) } });
  }
}
