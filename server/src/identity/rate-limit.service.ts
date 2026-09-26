import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';

export interface RateLimitResult { allowed: boolean; retryAfter: number }

@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async pruneExpired(): Promise<number> {
    const result = await this.prisma.rateBucket.deleteMany({ where: { windowEndsAt: { lt: new Date() } } });
    return result.count;
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (!key || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000) {
      throw new Error('Invalid rate limit policy');
    }
    const endsAt = new Date(Date.now() + windowMs);
    const rows = await this.prisma.$queryRaw<Array<{ count: number; windowEndsAt: Date }>>`
      INSERT INTO rate_buckets (key, count, "windowEndsAt") VALUES (${key}, 1, ${endsAt})
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_buckets."windowEndsAt" <= now() THEN 1 ELSE rate_buckets.count + 1 END,
        "windowEndsAt" = CASE WHEN rate_buckets."windowEndsAt" <= now() THEN ${endsAt} ELSE rate_buckets."windowEndsAt" END
      RETURNING count, "windowEndsAt"
    `;
    const row = rows[0];
    if (!row) throw new Error('Rate limit counter unavailable');
    const allowed = row.count <= limit;
    return { allowed, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((row.windowEndsAt.getTime() - Date.now()) / 1000)) };
  }
}
