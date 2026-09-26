import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import { CsrfGuard, type SessionCsrfRequest, type SessionCsrfResolver } from '../identity/csrf.guard.js';
import { RateLimitService } from '../identity/rate-limit.service.js';
import { rateKey, requestIp } from './request-context.js';

export type RatePolicies = Record<'loginPair' | 'loginIp' | 'registrationIp' | 'emailAccount' | 'emailIp', { limit: number; windowMs: number }>;

export const DEFAULT_RATE_POLICIES: RatePolicies = {
  loginPair: { limit: 10, windowMs: 15 * 60_000 },
  loginIp: { limit: 60, windowMs: 15 * 60_000 },
  registrationIp: { limit: 10, windowMs: 60 * 60_000 },
  emailAccount: { limit: 3, windowMs: 60 * 60_000 },
  emailIp: { limit: 20, windowMs: 60 * 60_000 },
};

export function securityMiddleware(config: AppConfig, csrf: CsrfGuard, limiter: RateLimitService, resolveSessionCsrf?: SessionCsrfResolver) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (resolveSessionCsrf && request.path === '/api/v1/auth/csrf') {
        try { await resolveSessionCsrf(request as SessionCsrfRequest, response); }
        catch (error) { next(error); return; }
      }
      next(); return;
    }
    if (request.header('origin') !== config.origin) {
      response.status(403).json({ code: 'ORIGIN_REJECTED' }); return;
    }
    if (resolveSessionCsrf) {
      try { await resolveSessionCsrf(request as SessionCsrfRequest, response); }
      catch (error) { next(error); return; }
    }
    if (!csrf.valid(request as SessionCsrfRequest)) {
      response.status(403).json({ code: 'CSRF_REJECTED' }); return;
    }
    try {
      const path = request.path.replace(/^\/api\/v1/, '');
      const policies = { ...DEFAULT_RATE_POLICIES, ...config.ratePolicies };
      const ip = requestIp(request, config);
      const rules: Array<[string, string, keyof RatePolicies]> = [];
      if (path === '/auth/login') {
        const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
        rules.push(['loginIp', ip, 'loginIp'], ['loginPair', `${ip}:${email}`, 'loginPair']);
      } else if (path === '/auth/register') {
        rules.push(['registrationIp', ip, 'registrationIp']);
      } else if (['/auth/forgot-password', '/auth/resend-verification'].includes(path)) {
        const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
        rules.push(['emailIp', ip, 'emailIp'], ['emailAccount', email, 'emailAccount']);
      }
      for (const [scope, identifier, policyName] of rules) {
        const policy = policies[policyName];
        const result = await limiter.consume(rateKey(config, scope, identifier), policy.limit, policy.windowMs);
        if (!result.allowed) {
          response.setHeader('Retry-After', String(result.retryAfter));
          response.status(429).json({ code: 'RATE_LIMITED' }); return;
        }
      }
      next();
    } catch (error) { next(error); }
  };
}
