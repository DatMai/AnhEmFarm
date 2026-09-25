import { Module, type DynamicModule } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { PrismaService } from './db/prisma.service.js';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }, PrismaService],
    };
  }
}
