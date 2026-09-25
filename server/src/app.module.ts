import { Global, Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { PrismaService } from './db/prisma.service.js';
import { CsrfController, CsrfGuard } from './identity/csrf.guard.js';
import { RateLimitService } from './identity/rate-limit.service.js';
import { IdentityModule } from './identity/identity.module.js';

@Global()
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [IdentityModule],
      controllers: [HealthController, CsrfController],
      providers: [{ provide: APP_CONFIG, useValue: config }, PrismaService, CsrfGuard, RateLimitService],
      exports: [APP_CONFIG, PrismaService, CsrfGuard],
    };
  }
}
