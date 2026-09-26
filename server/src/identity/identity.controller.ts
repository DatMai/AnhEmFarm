import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';
import { parseBody } from '../http/schemas.js';
import { IdentityService, publicUser } from './identity.service.js';
import { SESSION_COOKIE, SessionService, clearSessionCookie } from './session.service.js';
import { TokenService } from './token.service.js';
import { AuthGuard, type ActorRequest } from './auth.guard.js';
import { AdminGuard } from './admin.guard.js';
import { OutboxService } from '../email/outbox.service.js';

const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const credentials = z.strictObject({ email, password: z.string().min(1) });
const registration = z.strictObject({
  email, password: z.string().min(12).max(128), name: z.string().trim().min(1).max(200),
});
const emailOnly = z.strictObject({ email });
const tokenOnly = z.strictObject({ token: z.string().length(64) });
const resetBody = z.strictObject({ token: z.string().length(64), password: z.string().min(12).max(128) });
const changeBody = z.strictObject({ currentPassword: z.string().min(1), newPassword: z.string().min(12).max(128) });

@Controller('auth')
export class IdentityController {
  constructor(private readonly identity: IdentityService, private readonly sessions: SessionService,
    private readonly db: PrismaService, private readonly tokens: TokenService, private readonly outbox: OutboxService,
    @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Post('register')
  @HttpCode(202)
  async register(@Body() body: unknown): Promise<{ status: string }> {
    await this.identity.register(parseBody(registration, body));
    return { status: 'accepted' };
  }

  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown): Promise<void> {
    await this.tokens.consume(parseBody(tokenOnly, body).token, 'VERIFY');
  }

  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body() body: unknown): Promise<{ status: string }> {
    const input = parseBody(emailOnly, body);
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    if (user) await this.tokens.issue(user.id, 'VERIFY');
    return { status: 'accepted' };
  }

  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() body: unknown): Promise<{ status: string }> {
    const input = parseBody(emailOnly, body);
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    if (user) await this.tokens.issue(user.id, 'RESET');
    return { status: 'accepted' };
  }

  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(@Body() body: unknown): Promise<void> {
    const input = parseBody(resetBody, body);
    await this.tokens.consume(input.token, 'RESET', input.password);
  }

  @Post('change-password')
  @UseGuards(AuthGuard)
  @HttpCode(204)
  async changePassword(@Req() request: ActorRequest, @Body() body: unknown,
    @Res({ passthrough: true }) response: Response): Promise<void> {
    const input = parseBody(changeBody, body);
    await this.tokens.changePassword(request.actor!.id, input.currentPassword, input.newPassword);
    clearSessionCookie(response, this.config);
  }

  @Get('email-outbox-status')
  @UseGuards(AdminGuard)
  async emailOutboxStatus(): ReturnType<OutboxService['status']> {
    return this.outbox.status();
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
      if (error instanceof UnauthorizedException) { clearSessionCookie(response, this.config); return { user: null }; }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<void> {
    const raw = parseCookie(request.header('cookie') ?? '')[SESSION_COOKIE];
    if (raw) await this.sessions.revoke(raw);
    clearSessionCookie(response, this.config);
    response.setHeader('Cache-Control', 'no-store');
  }
}
