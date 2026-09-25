import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

@Controller('health')
export class HealthController {
  constructor(@Inject('PRISMA_CONNECTION') private readonly prisma: { db: PrismaClient }) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    try {
      const rows = await this.prisma.db.$queryRawUnsafe<Array<{ present: boolean }>>(
        "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present",
      );
      if (rows[0]?.present) return { status: 'ok' };
    } catch {
      // Readiness deliberately reveals no database details.
    }
    throw new ServiceUnavailableException('unavailable');
  }
}
