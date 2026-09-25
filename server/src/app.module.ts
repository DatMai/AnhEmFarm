import { Module, Inject, Injectable, type DynamicModule, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { HealthController } from './health.controller.js';
import type { AppConfig } from './config.js';

export const APP_CONFIG = 'APP_CONFIG';

@Injectable()
export class PrismaConnection implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }, { provide: 'PRISMA_CONNECTION', useClass: PrismaConnection }],
    };
  }
}
