import { Injectable, UnprocessableEntityException } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../db/prisma.service.js";
import { withTransaction } from "../db/transaction.js";
import type { Actor } from "../identity/session.service.js";
import { parseBody } from "../http/schemas.js";
import { CustomersService } from "./customers.service.js";
import { safeNumber } from "./admin.schemas.js";
const dates = z.strictObject({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
@Injectable()
export class ReportsService {
  constructor(
    private readonly db: PrismaService,
    private readonly customers: CustomersService,
  ) {}
  async summary(raw: { from: string; to: string }, actor?: Actor) {
    const input = parseBody(dates, raw);
    const day = 86400000;
    const valid = (s: string) => {
      const d = new Date(`${s}T00:00:00Z`);
      return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
    };
    const start = new Date(`${input.from}T00:00:00+07:00`),
      end = new Date(new Date(`${input.to}T00:00:00+07:00`).getTime() + day);
    if (
      !valid(input.from) ||
      !valid(input.to) ||
      end <= start ||
      end.getTime() - start.getTime() > 366 * day
    )
      throw new UnprocessableEntityException({ code: "INVALID_DATE_RANGE" });
    return withTransaction(this.db, async (tx) => {
      if (actor) await this.customers.authorize(tx, actor);
      const [r] = await tx.$queryRaw<
        Array<{
          delivered: string;
          collected: string;
          due: string;
          count: bigint;
        }>
      >`
    SELECT COALESCE(SUM("totalVnd") FILTER (WHERE status = 'DELIVERED' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end}),0)::text AS delivered,
    COALESCE(SUM("totalVnd") FILTER (WHERE "collectionState" = 'COLLECTED' AND "collectedAt" >= ${start} AND "collectedAt" < ${end}),0)::text AS collected,
    COALESCE(SUM("totalVnd") FILTER (WHERE status = 'DELIVERED' AND "collectionState" = 'DUE' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end}),0)::text AS due,
    COUNT(*) FILTER (WHERE status = 'DELIVERED' AND "deliveredAt" >= ${start} AND "deliveredAt" < ${end}) AS count
    FROM orders WHERE ("deliveredAt" >= ${start} AND "deliveredAt" < ${end}) OR ("collectedAt" >= ${start} AND "collectedAt" < ${end})`;
      return {
        deliveredOrderValueVnd: safeNumber(r.delivered),
        codCollectedVnd: safeNumber(r.collected),
        codDueVnd: safeNumber(r.due),
        orderCount: safeNumber(r.count),
      };
    });
  }
}
