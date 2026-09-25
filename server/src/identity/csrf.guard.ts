import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Controller, Get, Inject, Injectable, Req, Res, UnauthorizedException } from '@nestjs/common';
import { parseCookie, stringifySetCookie } from 'cookie';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';

const COOKIE = 'aef_csrf';
const MAX_AGE = 15 * 60;

function mac(secret: string, purpose: string, value: string): string {
  return createHmac('sha256', secret).update(`${purpose}:${value}`).digest('hex');
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface SessionCsrfRequest extends Request { sessionCsrfSecret?: string }

/** Task 4 supplies this before the global CSRF check; it resolves and validates aef_session. */
export type SessionCsrfResolver = (request: SessionCsrfRequest) => Promise<void>;

@Injectable()
export class CsrfGuard {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  issue(response: Response): string {
    const nonce = randomBytes(32).toString('hex');
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = `${nonce}.${issuedAt}`;
    const signed = `${payload}.${mac(this.config.sessionSecret, 'cookie', payload)}`;
    response.append('Set-Cookie', stringifySetCookie({ name: COOKIE, value: signed,
      path: '/', httpOnly: true, sameSite: 'lax', secure: this.config.mode === 'production', maxAge: MAX_AGE,
    }));
    return mac(this.config.sessionSecret, 'csrf', payload);
  }

  valid(request: SessionCsrfRequest): boolean {
    const token = request.header('x-csrf-token') ?? '';
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    // A session always uses its own secret. A pending session lookup must never fall back to anonymous CSRF.
    if (request.sessionCsrfSecret) return equal(token, mac(this.config.sessionSecret, 'session', request.sessionCsrfSecret));
    const cookies = parseCookie(request.header('cookie') ?? '');
    if (cookies.aef_session) return false;
    const [nonce, timestamp, signature, extra] = (cookies[COOKIE] ?? '').split('.');
    if (extra || !nonce || !timestamp || !signature || !/^[a-f0-9]{64}$/.test(nonce) ||
      !/^[0-9]{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false;
    const age = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (age < 0 || age > MAX_AGE) return false;
    const payload = `${nonce}.${timestamp}`;
    return equal(signature, mac(this.config.sessionSecret, 'cookie', payload)) &&
      equal(token, mac(this.config.sessionSecret, 'csrf', payload));
  }

  sessionToken(secret: string): string {
    return mac(this.config.sessionSecret, 'session', secret);
  }
}

@Controller('auth')
export class CsrfController {
  constructor(private readonly csrf: CsrfGuard) {}

  @Get('csrf')
  get(@Req() request: SessionCsrfRequest, @Res({ passthrough: true }) response: Response): { token: string } {
    response.setHeader('Cache-Control', 'no-store');
    if (parseCookie(request.header('cookie') ?? '').aef_session && !request.sessionCsrfSecret) throw new UnauthorizedException();
    return { token: request.sessionCsrfSecret ? this.csrf.sessionToken(request.sessionCsrfSecret) : this.csrf.issue(response) };
  }
}
