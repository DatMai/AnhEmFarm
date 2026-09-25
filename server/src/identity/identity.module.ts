import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { SessionService } from './session.service.js';
import { AuthGuard } from './auth.guard.js';
import { AdminGuard } from './admin.guard.js';

@Module({ controllers: [IdentityController], providers: [IdentityService, SessionService, AuthGuard, AdminGuard], exports: [IdentityService, SessionService, AuthGuard, AdminGuard] })
export class IdentityModule {}
