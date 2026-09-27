import { randomBytes } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';
import { sha256 } from '../identity/session.service.js';

const COOKIE = 'aef_guest';
const MAX_AGE = 30 * 24 * 60 * 60;

@Injectable()
export class GuestSessionService {
  constructor(private readonly db: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async find(request: Request): Promise<{ id: string } | null> {
    const raw = parseCookie(request.header('cookie') ?? '')[COOKIE];
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
    return this.db.guestSession.findFirst({ where: { digest: sha256(raw), expiresAt: { gt: new Date() } }, select: { id: true } });
  }

  async require(request: Request): Promise<{ id: string }> {
    const session = await this.find(request);
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND' });
    return session;
  }

  async getOrCreate(request: Request, response: Response): Promise<{ id: string }> {
    const existing = await this.find(request);
    if (existing) return existing;
    const raw = randomBytes(32).toString('hex');
    const session = await this.db.guestSession.create({ data: { digest: sha256(raw), expiresAt: new Date(Date.now() + MAX_AGE * 1000) } });
    response.append('Set-Cookie', stringifySetCookie({ name: COOKIE, value: raw, path: '/', httpOnly: true,
      sameSite: 'lax', secure: this.config.mode === 'production', maxAge: MAX_AGE }));
    return { id: session.id };
  }
}
