import { z } from 'zod';
import { uuidSchema } from '../http/schemas.js';

export const addressSchema = z.strictObject({
  recipient: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+?[0-9][0-9 ]{6,18}[0-9]$/).min(8).max(20),
  zoneId: uuidSchema,
  line1: z.string().trim().min(5).max(300),
  line2: z.string().trim().max(300).optional(),
  postalCode: z.string().trim().max(30).optional(),
});
export const quoteCreateSchema = z.strictObject({ address: addressSchema, note: z.string().trim().max(500).optional(), ageConfirmed: z.boolean() });
