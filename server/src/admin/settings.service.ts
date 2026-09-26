import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { Prisma, type Prisma as PrismaTypes } from '../generated/prisma/client.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { parseBody, uuidSchema } from '../http/schemas.js';
import { adminPageSchema, settingsUpdateSchema, zoneCreateSchema, zonePatchSchema } from './settings.schemas.js';

type Tx = PrismaTypes.TransactionClient;
const safe = (amount: bigint) => { const n = Number(amount); if (!Number.isSafeInteger(n)) throw new UnprocessableEntityException({ code: 'TOTAL_TOO_LARGE' }); return n; };
const conflict = (): never => { throw new ConflictException({ code: 'VERSION_CONFLICT' }); };

@Injectable()
export class SettingsService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  private async admin(tx: Tx, actor: Actor) {
    await this.identity.assertActiveActor(tx, actor);
    const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new ForbiddenException();
  }
  private view(row: { id: string; version: number; salesEnabled: boolean; wineEnabled: boolean;
    businessName: string | null; supportEmail: string | null; supportPhone: string | null;
    launchConfirmedAt: Date | null; wineConfirmedAt: Date | null }) {
    return { id: row.id, version: row.version, salesEnabled: row.salesEnabled, wineEnabled: row.wineEnabled,
      businessName: row.businessName, supportEmail: row.supportEmail, supportPhone: row.supportPhone,
      launchConfirmedAt: row.launchConfirmedAt?.toISOString() ?? null,
      wineConfirmedAt: row.wineConfirmedAt?.toISOString() ?? null };
  }
  async get(actor: Actor) {
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      const row = await tx.storeSettings.findFirst();
      return row ? this.view(row) : { id: null, version: 1, salesEnabled: false, wineEnabled: false,
        businessName: null, supportEmail: null, supportPhone: null, launchConfirmedAt: null, wineConfirmedAt: null };
    });
  }
  async publicStore() {
    const row = await this.db.storeSettings.findFirst();
    return { businessName: row?.businessName ?? null, supportEmail: row?.supportEmail ?? null,
      supportPhone: row?.supportPhone ?? null, salesEnabled: (row?.salesEnabled ?? false) && (this.config.mode !== 'production' || this.config.salesEnabled) };
  }
  async update(actor: Actor, raw: z.infer<typeof settingsUpdateSchema>) {
    const input = parseBody(settingsUpdateSchema, raw);
    return withTransaction(this.db, async tx => {
      await this.admin(tx, actor);
      await tx.$queryRaw`SELECT id FROM store_settings ORDER BY id LIMIT 1 FOR UPDATE`;
      const existing = await tx.storeSettings.findFirst();
      if (!existing && input.version !== 1 || existing && existing.version !== input.version) conflict();
      if (input.salesEnabled) {
        await tx.$queryRaw`SELECT id FROM content_pages WHERE slug IN ('shipping', 'privacy', 'terms', 'returns') ORDER BY slug FOR UPDATE`;
        const [zones, products, pages] = await Promise.all([
          tx.shippingZone.count({ where: { enabled: true, feeVnd: { gte: 0n } } }),
          tx.variant.count({ where: { saleEnabled: true, stock: { gt: 0 }, priceVnd: { gt: 0n },
            product: { status: 'PUBLISHED', confirmed: true, restricted18: false } } }),
          tx.contentPage.count({ where: { slug: { in: ['shipping', 'privacy', 'terms', 'returns'] }, status: 'PUBLISHED', approvedAt: { not: null } } }),
        ]);
        if (this.config.mode !== 'production' || !this.config.salesEnabled || (!existing?.salesEnabled && !input.confirmLaunch) || !input.businessName ||
          !input.supportEmail || !input.supportPhone || !zones || !products || pages !== 4)
          throw new UnprocessableEntityException({ code: 'LAUNCH_REQUIREMENTS_MISSING' });
      }
      if (input.wineEnabled && !existing?.wineEnabled && (!input.confirmWine || !input.salesEnabled))
        throw new UnprocessableEntityException({ code: 'WINE_CONFIRMATION_REQUIRED' });
      const data = { salesEnabled: input.salesEnabled, wineEnabled: input.wineEnabled,
        businessName: input.businessName || null, supportEmail: input.supportEmail,
        supportPhone: input.supportPhone || null,
        ...(input.salesEnabled && !existing?.salesEnabled ? { launchConfirmedAt: new Date() } : {}),
        ...(input.wineEnabled && !existing?.wineEnabled ? { wineConfirmedAt: new Date() } : {}) };
      const saved = existing ? await tx.storeSettings.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
        : await tx.storeSettings.create({ data });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'STORE_SETTINGS_UPDATED',
        targetType: 'StoreSettings', targetId: saved.id,
        changesJson: { salesEnabled: saved.salesEnabled, wineEnabled: saved.wineEnabled, version: saved.version } } });
      return this.view(saved);
    });
  }
  private zoneView(row: { id: string; code: string; displayName: string; feeVnd: bigint; enabled: boolean; version: number }) {
    return { ...row, feeVnd: safe(row.feeVnd) };
  }
  async zones(actor: Actor, raw: unknown) {
    const f = parseBody(adminPageSchema, raw);
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      const [rows, total] = await Promise.all([
        tx.shippingZone.findMany({ orderBy: { id: 'asc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
        tx.shippingZone.count(),
      ]);
      return { items: rows.map(row => this.zoneView(row)), ...f, total };
    });
  }
  async addZone(actor: Actor, raw: z.infer<typeof zoneCreateSchema>) {
    const input = parseBody(zoneCreateSchema, raw);
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      try {
        const row = await tx.shippingZone.create({ data: input });
        await tx.auditLog.create({ data: { actorId: actor.id, action: 'SHIPPING_ZONE_CREATED', targetType: 'ShippingZone', targetId: row.id,
          changesJson: { code: row.code, enabled: row.enabled, feeVnd: input.feeVnd } } });
        return this.zoneView(row);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException({ code: 'ZONE_CODE_EXISTS' });
        throw error;
      }
    });
  }
  async patchZone(actor: Actor, id: string, raw: z.infer<typeof zonePatchSchema>) {
    id = parseBody(uuidSchema, id);
    const input = parseBody(zonePatchSchema, raw);
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      await tx.$queryRaw`SELECT id FROM shipping_zones WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.shippingZone.findUnique({ where: { id } });
      if (!row) throw new NotFoundException();
      if (row.version !== input.version) conflict();
      const { version: _version, ...changes } = input;
      const saved = await tx.shippingZone.update({ where: { id }, data: { ...changes, version: { increment: 1 } } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: 'SHIPPING_ZONE_UPDATED', targetType: 'ShippingZone', targetId: id,
        changesJson: { enabled: saved.enabled, feeVnd: safe(saved.feeVnd), version: saved.version } } });
      return this.zoneView(saved);
    });
  }
  async audit(actor: Actor, raw: unknown) {
    const f = parseBody(adminPageSchema, raw);
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      const [items, total] = await Promise.all([tx.auditLog.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (f.page - 1) * f.pageSize, take: f.pageSize,
        select: { id: true, action: true, targetType: true, targetId: true, changesJson: true, createdAt: true } }), tx.auditLog.count()]);
      return { items, ...f, total };
    });
  }
  async emailJobs(actor: Actor) {
    return withTransaction(this.db, async tx => { await this.admin(tx, actor);
      const [pending, exhausted, failed] = await Promise.all([
        tx.emailOutbox.count({ where: { sentAt: null, exhaustedAt: null } }),
        tx.emailOutbox.count({ where: { exhaustedAt: { not: null } } }),
        tx.emailOutbox.findMany({ where: { exhaustedAt: { not: null } },
          orderBy: [{ exhaustedAt: 'desc' }, { id: 'desc' }], take: 100,
          select: { id: true, template: true, attempts: true, lastErrorCode: true, exhaustedAt: true } }),
      ]);
      return { pending, exhaustedCount: exhausted, exhausted: failed };
    });
  }
}
