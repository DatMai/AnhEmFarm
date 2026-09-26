import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { SessionService } from './session.service.js';
import { AuthGuard } from './auth.guard.js';
import { AdminGuard } from './admin.guard.js';
import { TokenService } from './token.service.js';
import { OutboxService } from '../email/outbox.service.js';
import { EMAIL_TRANSPORT, EmailWorker, RecordingEmailTransport, SmtpEmailTransport } from '../email/email.worker.js';
import { APP_CONFIG, type AppConfig } from '../config.js';

@Module({ controllers: [IdentityController], providers: [IdentityService, SessionService, AuthGuard, AdminGuard,
  TokenService, OutboxService, EmailWorker, RecordingEmailTransport,
  { provide: EMAIL_TRANSPORT, inject: [APP_CONFIG, RecordingEmailTransport],
    useFactory: (config: AppConfig, recorder: RecordingEmailTransport) => config.mode === 'test' ? recorder : new SmtpEmailTransport(config) },
], exports: [IdentityService, SessionService, AuthGuard, AdminGuard, TokenService, OutboxService, EmailWorker, RecordingEmailTransport] })
export class IdentityModule {}
