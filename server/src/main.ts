import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PayloadTooLargeException, RequestMethod, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
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
import { SESSION_COOKIE, SessionService, clearSessionCookie } from './identity/session.service.js';
import { webRoot } from './web/render-page.js';
import { resolve as resolvePath } from 'node:path';
import { static as serveStatic } from 'express';
import { WebController, webRouter } from './web/web.controller.js';
import { AdminWebController } from './admin-web/admin-web.controller.js';
import Busboy from 'busboy';
import { MAX_IMAGE_BYTES } from './media/media.service.js';

type AdminImageRequest = Request & { adminImage?: Buffer };

function parseAdminImage(request: AdminImageRequest, next: NextFunction): void {
  const maxBodyBytes = MAX_IMAGE_BYTES + 64 * 1024;
  if (Number(request.header('content-length')) > maxBodyBytes) { next(new PayloadTooLargeException({ code: 'IMAGE_TOO_LARGE' })); return; }
  let parser: ReturnType<typeof Busboy>;
  try { parser = Busboy({ headers: request.headers, limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 1, parts: 4, fieldSize: 1024 } }); }
  catch { next(new UnprocessableEntityException({ code: 'MULTIPART_MALFORMED' })); return; }
  const fields: Record<string, string> = {};
  const chunks: Buffer[] = [];
  let files = 0, invalidCode = '', tooLarge = false, received = 0;
  request.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (received > maxBodyBytes && !tooLarge) {
      tooLarge = true; chunks.length = 0; request.unpipe(parser); parser.destroy(); request.resume();
      next(new PayloadTooLargeException({ code: 'IMAGE_TOO_LARGE' }));
    }
  });
  parser.on('field', (name, value) => { if (name !== '_csrf' || fields[name]) invalidCode = 'UNEXPECTED_FORM_FIELD'; else fields[name] = value; });
  parser.on('file', (name, file) => {
    files++;
    if (name !== 'file') invalidCode = 'UNEXPECTED_FILE_FIELD';
    file.on('data', chunk => { if (!tooLarge && !invalidCode) chunks.push(chunk); });
    file.on('limit', () => { tooLarge = true; chunks.length = 0; });
  });
  parser.on('filesLimit', () => { invalidCode = 'TOO_MANY_FILES'; });
  parser.on('fieldsLimit', () => { invalidCode = 'TOO_MANY_FIELDS'; });
  parser.on('partsLimit', () => { invalidCode = 'TOO_MANY_PARTS'; });
  parser.on('error', () => next(new UnprocessableEntityException({ code: 'MULTIPART_MALFORMED' })));
  request.on('aborted', () => next(new UnprocessableEntityException({ code: 'UPLOAD_INCOMPLETE' })));
  parser.on('close', () => {
    if (tooLarge) next(new PayloadTooLargeException({ code: 'IMAGE_TOO_LARGE' }));
    else if (invalidCode) next(new UnprocessableEntityException({ code: invalidCode }));
    else if (files !== 1) next(new UnprocessableEntityException({ code: 'IMAGE_FILE_REQUIRED' }));
    else if (!fields._csrf) next(new UnprocessableEntityException({ code: 'CSRF_TOKEN_REQUIRED' }));
    else { request.body = fields; request.adminImage = Buffer.concat(chunks); next(); }
  });
  request.pipe(parser);
}

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
  app.use('/assets', serveStatic(resolvePath(webRoot(), 'dist/assets'), { immutable: true, maxAge: '1y' }));
  app.use(serveStatic(resolvePath(webRoot(), 'dist'), { index: false, maxAge: '1h' }));
  app.use(webRouter(app.get(WebController)));
  app.useBodyParser('urlencoded', { extended: false, limit: '1mb' });
  app.useBodyParser('json', { limit: '1mb' });
  app.use('/admin/products', (request: Request, _response: Response, next: NextFunction) => {
    if (request.method !== 'POST' || !/^\/[^/]+\/images\/?$/.test(request.path) || !request.is('multipart/form-data')) { next(); return; }
    parseAdminImage(request as AdminImageRequest, next);
  });
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
  app.use(securityMiddleware(config, app.get(CsrfGuard), app.get(RateLimitService), async (request, response) => {
    const raw = parseCookie(request.header('cookie') ?? '')[SESSION_COOKIE];
    if (!raw) return;
    try { request.sessionCsrfSecret = (await sessions.findValid(raw)).csrfSecret; }
    catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      // The current request still carries the stale cookie and cannot use anonymous CSRF.
      clearSessionCookie(response, config);
    }
  }));
  app.use('/admin', app.get(AdminWebController).router());
  app.useGlobalFilters(new SafeExceptionFilter());
  await app.init();
  return app;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const app = await createApp(readConfig());
  await app.listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1');
  const shutdown = async () => { await app.close(); process.exit(0); };
  process.once('SIGTERM', () => { void shutdown(); });
  process.once('SIGINT', () => { void shutdown(); });
}
