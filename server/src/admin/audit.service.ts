import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

const allowed: Record<string, ReadonlySet<string>> = {
  Category: new Set(['slug', 'name', 'version']),
  Product: new Set(['slug', 'name', 'description', 'categoryId', 'status', 'confirmed', 'restricted18', 'version']),
  Variant: new Set(['sku', 'label', 'packDetails', 'priceVnd', 'saleEnabled', 'version', 'commercialVersion']),
};

@Injectable()
export class AuditService {
  async record(tx: Prisma.TransactionClient, input: { actorId: string; action: string; targetType: keyof typeof allowed;
    targetId: string; changes: Record<string, unknown> }): Promise<void> {
    const fields = allowed[input.targetType];
    if (!fields || !/^[A-Z_]{3,80}$/.test(input.action) || Object.keys(input.changes).some(key => !fields.has(key))) {
      throw new Error('Disallowed audit fields');
    }
    const sanitized = Object.fromEntries(Object.entries(input.changes).map(([key, value]) => [key,
      typeof value === 'bigint' ? Number(value) : value]));
    await tx.auditLog.create({ data: { actorId: input.actorId, action: input.action, targetType: input.targetType,
      targetId: input.targetId, changesJson: sanitized as Prisma.InputJsonValue } });
  }
}
