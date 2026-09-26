import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { APP_CONFIG, type AppConfig } from '../config.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg(new Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 })) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
