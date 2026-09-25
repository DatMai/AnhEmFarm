import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { parseCookie } from 'cookie';
import { AppModule } from './app.module.js';
import { readConfig, validateConfig, type AppConfig } from './config.js';
import { SafeExceptionFilter } from './http/error.filter.js';
import { securityMiddleware } from './http/security.middleware.js';
import { CsrfGuard } from './identity/csrf.guard.js';
import { RateLimitService } from './identity/rate-limit.service.js';
import { SESSION_COOKIE, SessionService } from './identity/session.service.js';

export async function createApp(config: AppConfig): Promise<INestApplication> {
  validateConfig(config);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), { logger: false, abortOnError: false });
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.use(helmet());
  app.useBodyParser('json', { limit: '1mb' });
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    const started = Date.now();
    response.on('finish', () => {
      process.stdout.write(JSON.stringify({
        level: 'info', event: 'http_request', requestId,
        method: request.method, path: request.route?.path ?? '[unmatched]', status: response.statusCode,
        durationMs: Date.now() - started,
      }) + '\n');
    });
    next();
  });
  const sessions = app.get(SessionService);
  app.use(securityMiddleware(config, app.get(CsrfGuard), app.get(RateLimitService), async request => {
    const raw = parseCookie(request.header('cookie') ?? '')[SESSION_COOKIE];
    if (!raw) return;
    try { request.sessionCsrfSecret = (await sessions.findValid(raw)).csrfSecret; }
    catch { /* Cookie remains present, so CSRF validation fails closed. */ }
  }));
  app.useGlobalFilters(new SafeExceptionFilter());
  await app.init();
  return app;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const app = await createApp(readConfig());
  await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
}
