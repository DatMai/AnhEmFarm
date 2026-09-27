import { ConflictException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { canPurchase } from '../catalog/catalog.service.js';
import { parseBody } from '../http/schemas.js';
import { guestCartSchema, guestQuoteCreateSchema } from './checkout.schemas.js';
import type { QuoteView } from './quote.service.js';
import type { CartView } from '../cart/cart.service.js';

const conflict = (code: string): never => { throw new ConflictException({ code }); };
const invalid = (code: string): never => { throw new UnprocessableEntityException({ code }); };
const safe = (value: bigint): number => { const number = Number(value); if (!Number.isSafeInteger(number)) invalid('TOTAL_TOO_LARGE'); return number; };

@Injectable()
export class GuestQuoteService {
  constructor(private readonly db: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async preview(raw: z.infer<typeof guestCartSchema>): Promise<CartView> {
    const input = parseBody(guestCartSchema, raw);
    const ids = [...new Set(input.items.map(item => item.variantId))];
    const variants = await this.db.variant.findMany({ where: { id: { in: ids } }, include: { product: { include: { choiceGroup: true } } } });
    const choices = await this.db.productChoice.findMany({ where: { id: { in: input.items.flatMap(item => item.optionId ? [item.optionId] : []) } }, include: { group: true } });
    const byId = new Map(variants.map(variant => [variant.id, variant]));
    const byChoice = new Map(choices.map(choice => [choice.id, choice]));
    const settings = (await this.db.storeSettings.findFirst()) ?? { salesEnabled: false, wineEnabled: false };
    const quantities = new Map<string, number>();
    for (const item of input.items) quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
    return { version: 0, items: input.items.map(item => {
      const variant = byId.get(item.variantId);
      const choice = item.optionId ? byChoice.get(item.optionId) : undefined;
      const group = variant?.product.choiceGroup;
      return { variantId: item.variantId, optionId: item.optionId, optionGroupLabel: choice?.group.label ?? null,
        optionLabel: choice?.label ?? null, quantity: item.quantity,
        productName: variant?.product.name ?? 'Unavailable product', variantLabel: variant?.label ?? 'Unavailable variant',
        priceVnd: variant?.priceVnd === null || variant?.priceVnd === undefined || !Number.isSafeInteger(Number(variant.priceVnd)) ? null : Number(variant.priceVnd),
        restricted18: variant?.product.restricted18 ?? false,
        available: !!variant && canPurchase(variant.product, variant, settings) && variant.stock >= quantities.get(item.variantId)! &&
          (group?.active ? !!choice && choice.active && choice.group.active && choice.groupId === group.id : !item.optionId),
      };
    }) };
  }

  async create(guestSessionId: string, raw: z.infer<typeof guestQuoteCreateSchema>): Promise<QuoteView> {
    const input = parseBody(guestQuoteCreateSchema, raw);
    return withTransaction(this.db, async tx => {
      await tx.$queryRaw`SELECT id FROM guest_sessions WHERE id = ${guestSessionId}::uuid FOR UPDATE`;
      const guest = await tx.guestSession.findUnique({ where: { id: guestSessionId } });
      if (!guest || guest.expiresAt <= new Date()) conflict('GUEST_SESSION_EXPIRED');
      const settingsRows = await tx.$queryRaw<Array<{ id: string; salesEnabled: boolean; wineEnabled: boolean }>>`SELECT id, "salesEnabled", "wineEnabled" FROM store_settings ORDER BY id LIMIT 1 FOR UPDATE`;
      const settings = settingsRows[0];
      if (!settings?.salesEnabled || (this.config.mode === 'production' && !this.config.salesEnabled)) conflict('SALES_DISABLED');
      await tx.$queryRaw`SELECT id FROM shipping_zones WHERE id = ${input.address.zoneId}::uuid FOR UPDATE`;
      const zone = await tx.shippingZone.findUnique({ where: { id: input.address.zoneId } });
      if (!zone?.enabled || zone.feeVnd < 0n) throw new UnprocessableEntityException({ code: 'INVALID_SHIPPING_ZONE' });
      const ids = [...new Set(input.items.map(item => item.variantId))].sort();
      const refs = await tx.variant.findMany({ where: { id: { in: ids } }, select: { id: true, productId: true } });
      if (refs.length !== ids.length) conflict('VARIANT_UNAVAILABLE');
      for (const productId of [...new Set(refs.map(ref => ref.productId))].sort())
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      for (const variantId of ids) await tx.$queryRaw`SELECT id FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const variants = await tx.variant.findMany({ where: { id: { in: ids } }, include: { product: { include: { choiceGroup: true } } } });
      const byId = new Map(variants.map(variant => [variant.id, variant]));
      const choices = new Map((await tx.productChoice.findMany({ where: { id: { in: input.items.flatMap(item => item.optionId ? [item.optionId] : []) } }, include: { group: true } })).map(choice => [choice.id, choice]));
      const lines: QuoteView['items'] = [];
      let subtotal = 0n;
      const quantities = new Map<string, number>();
      for (const item of [...input.items].sort((a, b) => `${a.variantId}:${a.optionId ?? 'none'}`.localeCompare(`${b.variantId}:${b.optionId ?? 'none'}`))) {
        const variant = byId.get(item.variantId);
        const choice = item.optionId ? choices.get(item.optionId) : undefined;
        if (!variant || !canPurchase(variant.product, variant, settings)) throw new ConflictException({ code: 'VARIANT_UNAVAILABLE' });
        if (variant.product.choiceGroup?.active && (!choice || !choice.active || !choice.group.active || choice.groupId !== variant.product.choiceGroup.id)) conflict('PRODUCT_CHOICE_UNAVAILABLE');
        if (!variant.product.choiceGroup?.active && item.optionId) conflict('PRODUCT_CHOICE_UNAVAILABLE');
        if (variant.product.restricted18 && !input.ageConfirmed) invalid('AGE_CONFIRMATION_REQUIRED');
        quantities.set(variant.id, (quantities.get(variant.id) ?? 0) + item.quantity);
        subtotal += variant.priceVnd! * BigInt(item.quantity);
        lines.push({ variantId: variant.id, optionId: item.optionId, optionGroupLabel: choice?.group.label ?? null,
          optionLabel: choice?.label ?? null, productName: variant.product.name, sku: variant.sku,
          variantLabel: variant.label, quantity: item.quantity, priceVnd: safe(variant.priceVnd!),
          commercialVersion: variant.commercialVersion, productVersion: variant.product.version,
          restricted18: variant.product.restricted18, eligible: true });
      }
      for (const [id, quantity] of quantities) if (byId.get(id)!.stock < quantity) conflict('VARIANT_UNAVAILABLE');
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      const quote = await tx.checkoutQuote.create({ data: { guestSessionId, guestEmail: input.email, expiresAt,
        cartVersion: 0, linesJson: lines as unknown as Prisma.InputJsonValue,
        addressJson: { ...input.address, ...(input.note ? { note: input.note } : {}) },
        shippingZoneId: zone.id, shippingZoneVersion: zone.version, feeVnd: zone.feeVnd, ageConfirmed: input.ageConfirmed } });
      return { id: quote.id, expiresAt: expiresAt.toISOString(), cartVersion: 0, items: lines,
        subtotalVnd: safe(subtotal), shippingVnd: safe(zone.feeVnd), totalVnd: safe(subtotal + zone.feeVnd), address: input.address };
    });
  }
}
