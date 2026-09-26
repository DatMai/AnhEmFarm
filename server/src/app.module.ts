import { Global, Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { PrismaService } from './db/prisma.service.js';
import { CsrfController, CsrfGuard } from './identity/csrf.guard.js';
import { RateLimitService } from './identity/rate-limit.service.js';
import { IdentityModule } from './identity/identity.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { MediaModule } from './media/media.controller.js';
import { CartController } from './cart/cart.controller.js';
import { CartService } from './cart/cart.service.js';
import { CheckoutController } from './checkout/checkout.controller.js';
import { QuoteService } from './checkout/quote.service.js';

@Global()
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [IdentityModule, CatalogModule, MediaModule],
      controllers: [HealthController, CsrfController, CartController, CheckoutController],
      providers: [{ provide: APP_CONFIG, useValue: config }, PrismaService, CsrfGuard, RateLimitService, CartService, QuoteService],
      exports: [APP_CONFIG, PrismaService, CsrfGuard],
    };
  }
}
