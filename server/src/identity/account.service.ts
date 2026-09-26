import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../db/prisma.service.js";
import { withTransaction } from "../db/transaction.js";
import {
  IdentityService,
  publicUser,
  type PublicUser,
} from "./identity.service.js";
import type { Actor } from "./session.service.js";
import { parseBody, uuidSchema } from "../http/schemas.js";
import { addressSchema } from "../checkout/checkout.schemas.js";
import { paginationSchema } from "../admin/admin.schemas.js";
export const profileSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
});
export const addressUpdateSchema = addressSchema
  .partial()
  .extend({ version: z.number().int().positive() });
export const addressDeleteSchema = z.strictObject({
  version: z.number().int().positive(),
});
const addressSelect = {
  id: true,
  recipient: true,
  phone: true,
  zoneId: true,
  line1: true,
  line2: true,
  postalCode: true,
  version: true,
} as const;
@Injectable()
export class AccountService {
  constructor(
    private readonly db: PrismaService,
    private readonly identity: IdentityService,
  ) {}
  async update(actor: Actor, raw: { name: string }): Promise<PublicUser> {
    const input = parseBody(profileSchema, raw);
    return withTransaction(this.db, async (tx) => {
      await this.identity.assertActiveActor(tx, actor);
      return publicUser(
        await tx.user.update({
          where: { id: actor.id },
          data: { ...input, version: { increment: 1 } },
        }),
      );
    });
  }
  async list(actor: Actor, raw: unknown = {}) {
    const f = parseBody(paginationSchema, raw);
    return withTransaction(this.db, async (tx) => {
      await this.identity.assertActiveActor(tx, actor);
      const where = { userId: actor.id };
      return {
        items: await tx.address.findMany({
          where,
          select: addressSelect,
          orderBy: { id: "asc" },
          skip: (f.page - 1) * f.pageSize,
          take: f.pageSize,
        }),
        ...f,
        total: await tx.address.count({ where }),
      };
    });
  }
  async get(actor: Actor, id: string) {
    id = parseBody(uuidSchema, id);
    return withTransaction(this.db, async (tx) => {
      await this.identity.assertActiveActor(tx, actor);
      const a = await tx.address.findFirst({
        where: { id, userId: actor.id },
        select: addressSelect,
      });
      if (!a) throw new NotFoundException();
      return a;
    });
  }
  async create(actor: Actor, raw: unknown) {
    const input = parseBody(addressSchema, raw);
    return withTransaction(this.db, async (tx) => {
      await this.identity.assertActiveActor(tx, actor);
      if (!(await tx.shippingZone.findUnique({ where: { id: input.zoneId } })))
        throw new UnprocessableEntityException({
          code: "INVALID_SHIPPING_ZONE",
        });
      return tx.address.create({
        data: { ...input, userId: actor.id },
        select: addressSelect,
      });
    });
  }
  async change(actor: Actor, id: string, raw: unknown, remove = false) {
    id = parseBody(uuidSchema, id);
    const { version, ...data } = parseBody(
      remove ? addressDeleteSchema : addressUpdateSchema,
      raw,
    );
    return withTransaction(this.db, async (tx) => {
      await this.identity.assertActiveActor(tx, actor);
      const a = await tx.address.findFirst({ where: { id, userId: actor.id } });
      if (!a) throw new NotFoundException();
      if (a.version !== version)
        throw new ConflictException({ code: "VERSION_CONFLICT" });
      if (remove) {
        await tx.address.delete({ where: { id } });
        return;
      }
      const patch = data as Partial<z.infer<typeof addressSchema>>;
      if (
        patch.zoneId &&
        !(await tx.shippingZone.findUnique({ where: { id: patch.zoneId } }))
      )
        throw new UnprocessableEntityException({
          code: "INVALID_SHIPPING_ZONE",
        });
      return tx.address.update({
        where: { id },
        data: { ...patch, version: { increment: 1 } },
        select: addressSelect,
      });
    });
  }
}
