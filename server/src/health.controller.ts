import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { readdirSync } from 'node:fs';
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
      const rows = await this.prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      );
      const expected = readdirSync(resolve(process.cwd(), 'prisma/migrations'), { withFileTypes: true })
        .filter(entry => entry.isDirectory()).map(entry => entry.name);
      const applied = new Set(rows.map(row => row.migration_name));
      if (expected.length > 0 && expected.every(name => applied.has(name))) return { status: 'ok' };
    } catch {
      // Readiness deliberately reveals no database details.
    }
    throw new ServiceUnavailableException('unavailable');
  }
}
