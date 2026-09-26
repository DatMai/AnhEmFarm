import { AccountController } from './identity/account.controller.js';
import { AccountService } from './identity/account.service.js';
import { CustomersController } from './admin/customers.controller.js';
import { CustomersService } from './admin/customers.service.js';
import { ReportsController } from './admin/reports.controller.js';
import { ReportsService } from './admin/reports.service.js';
import { SettingsController, StoreController } from './admin/settings.controller.js';
import { SettingsService } from './admin/settings.service.js';
import { AdminContentController, PublicContentController } from './content/content.controller.js';
import { ContentService } from './content/content.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { AdminOrdersController } from './orders/admin-orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
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
import { CheckoutController, OrderPlacementController } from './checkout/checkout.controller.js';
import { CheckoutService } from './checkout/checkout.service.js';
import { QuoteService } from './checkout/quote.service.js';

@Global()
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [IdentityModule, CatalogModule, MediaModule],
      controllers: [AccountController, CustomersController, ReportsController, SettingsController, StoreController, AdminContentController, PublicContentController, HealthController, CsrfController, CartController, CheckoutController, OrderPlacementController, OrdersController, AdminOrdersController],
      providers: [AccountService, CustomersService, ReportsService, SettingsService, ContentService, { provide: APP_CONFIG, useValue: config }, PrismaService, CsrfGuard, RateLimitService, CartService, QuoteService, CheckoutService, OrdersService],
      exports: [APP_CONFIG, PrismaService, CsrfGuard],
    };
  }
}
