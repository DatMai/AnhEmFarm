import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';
import { parseBody } from '../http/schemas.js';
import { IdentityService, publicUser } from './identity.service.js';
import { SESSION_COOKIE, SessionService } from './session.service.js';

const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const credentials = z.strictObject({ email, password: z.string().min(1) });
const registration = z.strictObject({
  email, password: z.string().min(12).max(128), name: z.string().trim().min(1).max(200),
});

@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService, private readonly sessions: SessionService,
    private readonly db: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Post('register')
  @HttpCode(202)
  async register(@Body() body: unknown): Promise<{ status: string }> {
    await this.identity.register(parseBody(registration, body));
    return { status: 'accepted' };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response): Promise<{ user: ReturnType<typeof publicUser> }> {
    const result = await this.identity.login(parseBody(credentials, body));
    response.append('Set-Cookie', stringifySetCookie({
      name: SESSION_COOKIE, value: result.rawSession, httpOnly: true, sameSite: 'lax',
      secure: this.config.mode === 'production', path: '/', maxAge: result.user.role === 'ADMIN' ? 12 * 3600 : 7 * 86400,
    }));
    response.setHeader('Cache-Control', 'no-store');
    return { user: result.user };
  }

  @Get('me')
  async me(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<{ user: ReturnType<typeof publicUser> | null }> {
    response.setHeader('Cache-Control', 'no-store');
    const raw = parseCookie(request.header('cookie') ?? '')[SESSION_COOKIE];
    if (!raw) return { user: null };
    try {
      const actor = await this.sessions.authenticate(raw);
      const user = await this.db.user.findUnique({ where: { id: actor.id } });
      return { user: user ? publicUser(user) : null };
    } catch (error) {
      if (error instanceof UnauthorizedException) return { user: null };
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const raw = parseCookie(request.header('cookie') ?? '')[SESSION_COOKIE];
    if (raw) await this.sessions.revoke(raw);
    response.append('Set-Cookie', stringifySetCookie({ name: SESSION_COOKIE, value: '', path: '/', httpOnly: true,
      sameSite: 'lax', secure: this.config.mode === 'production', maxAge: 0 }));
    response.setHeader('Cache-Control', 'no-store');
  }
}
