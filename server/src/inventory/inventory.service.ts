import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { AuditService } from '../admin/audit.service.js';

export interface Adjustment { delta: number; reason: string; version: number; operationKey: string }
export interface Movement { variantId: string; delta: number; actorId: string; orderId?: string; reason: string; operationKey: string }
export interface StockResult { stock: number; version: number }
const conflict = (code: string): never => { throw new ConflictException({ code }); };
const digest = ({ variantId, delta }: Pick<Movement, 'variantId' | 'delta'>) =>
  createHash('sha256').update(JSON.stringify({ variantId, delta })).digest('hex');

/** Caller must hold the variant row lock. Product/variant catalog edits lock product, then variants. */
export async function applyMovement(tx: Prisma.TransactionClient, input: Movement): Promise<void> {
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) throw new UnprocessableEntityException({ code: 'INVALID_DELTA' });
  const payloadDigest = digest(input);
  const existing = await tx.inventoryMovement.findUnique({ where: { operationKey: input.operationKey } });
  if (existing) {
    if (existing.payloadDigest !== payloadDigest) conflict('OPERATION_CONFLICT');
    return;
  }
  const variant = await tx.variant.findUnique({ where: { id: input.variantId } });
  if (!variant) throw new NotFoundException({ code: 'NOT_FOUND' });
  const stock = variant.stock + input.delta;
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 2_147_483_647) throw new UnprocessableEntityException({ code: 'INVALID_STOCK' });
  const version = variant.version + 1;
  await tx.variant.update({ where: { id: input.variantId }, data: { stock: { increment: input.delta }, version: { increment: 1 } } });
  await tx.inventoryMovement.create({ data: { ...input, payloadDigest,
    resultJson: { stock, version } } });
}

@Injectable()
export class InventoryService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService,
    private readonly audit: AuditService) {}
  async adjust(actor: Actor, variantId: string, input: Adjustment): Promise<StockResult> {
    if (!Number.isSafeInteger(input.delta) || input.delta === 0 || !Number.isSafeInteger(input.version) || input.version < 1 ||
      !input.reason.trim() || !input.operationKey.trim()) throw new UnprocessableEntityException({ code: 'INVALID_ADJUSTMENT' });
    try { return await withTransaction(this.db, async tx => {
      // User lock precedes the variant lock, also for idempotent replays.
      await this.identity.assertActiveActor(tx, actor);
      const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } });
      if (user?.role !== 'ADMIN') throw new ForbiddenException();
      await tx.$queryRaw`SELECT id FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const existing = await tx.inventoryMovement.findUnique({ where: { operationKey: input.operationKey } });
      if (existing) {
        if (existing.payloadDigest !== digest({ variantId, delta: input.delta })) conflict('OPERATION_CONFLICT');
        return existing.resultJson as unknown as StockResult;
      }
      const variant = await tx.variant.findUnique({ where: { id: variantId } });
      if (!variant) throw new NotFoundException({ code: 'NOT_FOUND' });
      if (variant.version !== input.version) conflict('VERSION_CONFLICT');
      await applyMovement(tx, { variantId, delta: input.delta, actorId: actor.id, reason: input.reason.trim(), operationKey: input.operationKey });
      await this.audit.record(tx, { actorId: actor.id, action: 'INVENTORY_ADJUSTED', targetType: 'Variant', targetId: variantId,
        changes: { version: variant.version + 1 } });
      return { stock: variant.stock + input.delta, version: variant.version + 1 };
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') conflict('OPERATION_CONFLICT');
      throw error;
    }
  }
}
