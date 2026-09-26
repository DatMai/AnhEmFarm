import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../db/prisma.service.js';
import { withTransaction } from '../db/transaction.js';
import { IdentityService } from '../identity/identity.service.js';
import type { Actor } from '../identity/session.service.js';
import { canPurchase } from '../catalog/catalog.service.js';
import { parseBody } from '../http/schemas.js';
import { quoteCreateSchema } from './checkout.schemas.js';
import type { z } from 'zod';

export interface QuoteView { id: string; expiresAt: string; cartVersion: number; items: Array<{ variantId: string; productName: string; sku: string; variantLabel: string; quantity: number; priceVnd: number; commercialVersion: number; productVersion: number; restricted18: boolean; eligible: boolean }>;
  subtotalVnd: number; shippingVnd: number; totalVnd: number; address: z.infer<typeof quoteCreateSchema>['address'] }
const invalid = (code: string): never => { throw new UnprocessableEntityException({ code }); };
const conflict = (code: string): never => { throw new ConflictException({ code }); };
const safe = (value: bigint) => { const number = Number(value); if (!Number.isSafeInteger(number)) invalid('TOTAL_TOO_LARGE'); return number; };

@Injectable()
export class QuoteService {
  constructor(private readonly db: PrismaService, private readonly identity: IdentityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig) {}
  async create(actor: Actor, raw: z.infer<typeof quoteCreateSchema>): Promise<QuoteView> {
    if (!actor) throw new UnauthorizedException();
    const input = parseBody(quoteCreateSchema, raw);
    return withTransaction(this.db, async tx => {
      await this.identity.assertActiveActor(tx, actor);
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
      if (!user.verifiedAt) throw new ForbiddenException({ code: 'EMAIL_NOT_VERIFIED' });
      const settingsRows = await tx.$queryRaw<Array<{ id: string; salesEnabled: boolean; wineEnabled: boolean }>>`SELECT id, "salesEnabled", "wineEnabled" FROM store_settings ORDER BY id LIMIT 1 FOR UPDATE`;
      const settings = settingsRows[0];
      if (!settings?.salesEnabled || (this.config.mode === 'production' && !this.config.salesEnabled)) conflict('SALES_DISABLED');
      await tx.$queryRaw`SELECT id FROM shipping_zones WHERE id = ${input.address.zoneId}::uuid FOR UPDATE`;
      const zone = await tx.shippingZone.findUnique({ where: { id: input.address.zoneId } });
      if (!zone || !zone.enabled || zone.feeVnd < 0n) throw new UnprocessableEntityException({ code: 'INVALID_SHIPPING_ZONE' });
      await tx.$queryRaw`SELECT id FROM carts WHERE "userId" = ${actor.id}::uuid FOR UPDATE`;
      const cart = await tx.cart.findUnique({ where: { userId: actor.id }, include: { items: true } });
      if (!cart?.items.length) throw new UnprocessableEntityException({ code: 'EMPTY_CART' });
      if (cart.items.length > 50 || cart.items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) invalid('INVALID_CART');
      const ids = cart.items.map(item => item.variantId).sort();
      const refs = await tx.variant.findMany({ where: { id: { in: ids } }, select: { id: true, productId: true } });
      if (refs.length !== ids.length) conflict('VARIANT_UNAVAILABLE');
      for (const productId of [...new Set(refs.map(ref => ref.productId))].sort())
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
      for (const variantId of ids) await tx.$queryRaw`SELECT id FROM variants WHERE id = ${variantId}::uuid FOR UPDATE`;
      const variants = await tx.variant.findMany({ where: { id: { in: ids } }, include: { product: true } });
      const byId = new Map(variants.map(variant => [variant.id, variant]));
      const lines: QuoteView['items'] = [];
      let subtotal = 0n;
      for (const item of [...cart.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
        const variant = byId.get(item.variantId);
        if (!variant || !canPurchase(variant.product, variant, settings) || variant.stock < item.quantity) throw new ConflictException({ code: 'VARIANT_UNAVAILABLE' });
        if (variant.product.restricted18 && !input.ageConfirmed) invalid('AGE_CONFIRMATION_REQUIRED');
        const price = variant.priceVnd!;
        subtotal += price * BigInt(item.quantity);
        lines.push({ variantId: item.variantId, productName: variant.product.name, sku: variant.sku,
          variantLabel: variant.label, quantity: item.quantity, priceVnd: safe(price),
          commercialVersion: variant.commercialVersion, productVersion: variant.product.version,
          restricted18: variant.product.restricted18, eligible: true });
      }
      const total = subtotal + zone.feeVnd;
      const viewTotals = { subtotalVnd: safe(subtotal), shippingVnd: safe(zone.feeVnd), totalVnd: safe(total) };
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      const quote = await tx.checkoutQuote.create({ data: { userId: actor.id, expiresAt, cartVersion: cart.version,
        linesJson: lines as unknown as Prisma.InputJsonValue,
        addressJson: { ...input.address, ...(input.note ? { note: input.note } : {}) },
        shippingZoneId: zone.id, shippingZoneVersion: zone.version, feeVnd: zone.feeVnd, ageConfirmed: input.ageConfirmed } });
      return { id: quote.id, expiresAt: expiresAt.toISOString(), cartVersion: cart.version, items: lines, ...viewTotals, address: input.address };
    });
  }
}
