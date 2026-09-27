import { z } from 'zod';
import { emailSchema, uuidSchema } from '../http/schemas.js';

export const addressSchema = z.strictObject({
  recipient: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ]{6,18}[0-9]$/).min(8).max(20),
  zoneId: uuidSchema,
  line1: z.string().trim().min(5).max(300),
  line2: z.string().trim().max(300).optional(),
  postalCode: z.string().trim().max(30).optional(),
});
export const quoteCreateSchema = z.strictObject({ address: addressSchema, note: z.string().trim().max(500).optional(), ageConfirmed: z.boolean() });
const guestCartLinesSchema = z.array(z.strictObject({ variantId: uuidSchema, optionId: uuidSchema.nullable(), quantity: z.number().int().min(1).max(99) })).min(1).max(50);
export const guestCartSchema = z.strictObject({ items: guestCartLinesSchema }).superRefine((input, context) => {
  const keys = new Set<string>();
  for (const item of input.items) {
    const key = `${item.variantId.toLowerCase()}:${item.optionId?.toLowerCase() ?? 'none'}`;
    if (keys.has(key)) context.addIssue({ code: 'custom', message: 'Duplicate cart selection', path: ['items'] });
    keys.add(key);
  }
});
export const guestQuoteCreateSchema = quoteCreateSchema.extend({
  email: z.string().trim().pipe(emailSchema),
  items: guestCartLinesSchema,
}).superRefine((input, context) => {
  const keys = input.items.map(item => `${item.variantId.toLowerCase()}:${item.optionId?.toLowerCase() ?? 'none'}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Duplicate cart selection', path: ['items'] });
});
