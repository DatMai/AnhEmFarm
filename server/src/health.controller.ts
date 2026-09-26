import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from './db/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string; checksum: string; finished: boolean; rolled_back: boolean }>>(
        'SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM _prisma_migrations',
      );
      const migrationsPath = resolve(process.cwd(), 'prisma/migrations');
      const expected = readdirSync(migrationsPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory()).map(entry => ({
          name: entry.name,
          checksum: createHash('sha256').update(readFileSync(resolve(migrationsPath, entry.name, 'migration.sql'))).digest('hex'),
        }));
      const noFailedMigration = rows.every(row => row.finished || row.rolled_back);
      if (expected.length > 0 && noFailedMigration && expected.every(migration =>
        rows.some(row => row.migration_name === migration.name && row.checksum === migration.checksum && row.finished && !row.rolled_back))) {
        return { status: 'ok' };
      }
    } catch {
      // Readiness deliberately reveals no database details.
    }
    throw new ServiceUnavailableException('unavailable');
  }
}
