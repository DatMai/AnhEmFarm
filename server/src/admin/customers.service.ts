import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { z } from "zod";
import { PrismaService } from "../db/prisma.service.js";
import { withTransaction } from "../db/transaction.js";
import type { Prisma } from "../generated/prisma/client.js";
import { IdentityService } from "../identity/identity.service.js";
import type { Actor } from "../identity/session.service.js";
import { parseBody, uuidSchema } from "../http/schemas.js";
import {
  customerFiltersSchema,
  paginationSchema,
  safeNumber,
  statusSchema,
} from "./admin.schemas.js";
const listSelect = {
  id: true,
  name: true,
  status: true,
  version: true,
} as const;
@Injectable()
export class CustomersService {
  constructor(
    private readonly db: PrismaService,
    private readonly identity: IdentityService,
  ) {}
  async authorize(tx: Prisma.TransactionClient, actor: Actor) {
    await this.identity.assertActiveActor(tx, actor);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { role: true },
    });
    if (user.role !== "ADMIN") throw new ForbiddenException();
  }
  async list(actor: Actor, raw: unknown = {}) {
    const f = parseBody(customerFiltersSchema, raw);
    return withTransaction(this.db, async (tx) => {
      await this.authorize(tx, actor);
      const where: Prisma.UserWhereInput = {
        role: "CUSTOMER",
        ...(f.q
          ? {
              OR: [
                { name: { contains: f.q, mode: "insensitive" } },
                { email: { contains: f.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      return {
        items: await tx.user.findMany({
          where,
          select: listSelect,
          orderBy: { id: "asc" },
          skip: (f.page - 1) * f.pageSize,
          take: f.pageSize,
        }),
        page: f.page,
        pageSize: f.pageSize,
        total: await tx.user.count({ where }),
      };
    });
  }
  async get(actor: Actor, id: string, raw: unknown = {}) {
    id = parseBody(uuidSchema, id);
    const f = parseBody(paginationSchema, raw);
    return withTransaction(this.db, async (tx) => {
      await this.authorize(tx, actor);
      const customer = await tx.user.findFirst({
        where: { id, role: "CUSTOMER" },
        select: { ...listSelect, email: true, createdAt: true },
      });
      if (!customer) throw new NotFoundException();
      const where = { userId: id };
      const rows = await tx.order.findMany({
        where,
        select: {
          id: true,
          status: true,
          totalVnd: true,
          createdAt: true,
          collectionState: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
      });
      return {
        customer,
        orders: {
          items: rows.map((o) => ({ ...o, totalVnd: safeNumber(o.totalVnd) })),
          ...f,
          total: await tx.order.count({ where }),
        },
      };
    });
  }
  async setStatus(
    actor: Actor,
    id: string,
    raw: z.infer<typeof statusSchema>,
  ): Promise<void> {
    id = parseBody(uuidSchema, id).toLowerCase();
    const input = parseBody(statusSchema, raw);
    await withTransaction(this.db, async (tx) => {
      // This is the only cross-user writer: acquire both rows in global UUID order.
      for (const userId of [...new Set([actor.id.toLowerCase(), id])].sort())
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await this.authorize(tx, actor);
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new NotFoundException();
      if (target.role !== "CUSTOMER") throw new ForbiddenException();
      if (target.version !== input.version)
        throw new ConflictException({ code: "VERSION_CONFLICT" });
      if (target.status === input.status)
        throw new ConflictException({ code: "STATUS_UNCHANGED" });
      await tx.user.update({
        where: { id },
        data: {
          status: input.status,
          version: { increment: 1 },
          ...(input.status === "SUSPENDED"
            ? { authVersion: { increment: 1 } }
            : {}),
        },
      });
      if (input.status === "SUSPENDED")
        await tx.session.deleteMany({ where: { userId: id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "CUSTOMER_STATUS_CHANGED",
          targetType: "User",
          targetId: id,
          changesJson: {
            from: target.status,
            to: input.status,
            reason: input.reason,
            version: target.version + 1,
          },
        },
      });
    });
  }
}
