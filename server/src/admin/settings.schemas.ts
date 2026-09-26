import { z } from 'zod';

const version = z.number().int().positive();
const contact = z.string().trim().max(200).nullable();
export const settingsUpdateSchema = z.strictObject({
  version, salesEnabled: z.boolean(), wineEnabled: z.boolean(),
  businessName: contact, supportEmail: z.email().max(254).nullable(),
  supportPhone: z.string().trim().max(30).nullable(),
  confirmLaunch: z.boolean().optional(), confirmWine: z.boolean().optional(),
});
export const zoneCreateSchema = z.strictObject({
  code: z.string().trim().regex(/^[A-Z0-9_-]{2,40}$/),
  displayName: z.string().trim().min(1).max(120),
  feeVnd: z.number().int().min(0).max(1_000_000_000), enabled: z.boolean(),
});
export const zonePatchSchema = zoneCreateSchema.partial().extend({ version });
export const contentSaveSchema = z.strictObject({
  title: z.string().trim().min(1).max(160), source: z.string().trim().min(1).max(20_000),
  status: z.enum(['DRAFT', 'PUBLISHED']), version,
});
export const adminPageSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
