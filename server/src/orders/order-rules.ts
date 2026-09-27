import { z } from 'zod';
import { pagination } from '../catalog/catalog.schemas.js';
export const statusSchema = z.enum(['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERED', 'CANCELLED', 'RETURNED']);
export const adminTransitions: Record<z.infer<typeof statusSchema>, readonly z.infer<typeof statusSchema>[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'RETURNED'], DELIVERED: [], CANCELLED: [], RETURNED: [],
};
const reason = z.string().trim().min(1).max(500);
const mutation = { version: z.number().int().positive().max(2_147_483_647), operationKey: z.uuid().transform(s => s.toLowerCase()), reason: reason.optional() };
export const cancellationSchema = z.strictObject(mutation);
export const transitionSchema = z.strictObject({ ...mutation, to: statusSchema,
  delivery: z.discriminatedUnion('mode', [z.strictObject({ mode: z.literal('STORE') }), z.strictObject({ mode: z.literal('CARRIER'), carrier: z.string().trim().min(1).max(200), tracking: z.string().trim().min(1).max(200) })]).optional(),
  received: z.boolean().optional(),
  restock: z.array(z.strictObject({ variantId: z.uuid().transform(s => s.toLowerCase()), quantity: z.number().int().min(0).max(99) })).max(50).optional(),
});
export const collectionSchema = z.strictObject({ ...mutation, state: z.enum(['DUE', 'COLLECTED']) });
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const orderFiltersSchema = pagination.extend({
  status: statusSchema.optional(), collectionState: z.enum(['DUE', 'COLLECTED']).optional(),
  q: z.string().trim().min(1).max(120).optional(), from: calendarDate.optional(), to: calendarDate.optional(),
}).superRefine((filters, context) => {
  if (filters.from && filters.to) {
    const start = Date.parse(`${filters.from}T00:00:00Z`);
    const end = Date.parse(`${filters.to}T00:00:00Z`);
    const span = (end - start) / 86400000;
    if (span < 0 || span > 364) context.addIssue({ code: 'custom', path: ['to'], message: 'Date range must not exceed 365 calendar days' });
  }
});
export type Transition = z.infer<typeof transitionSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type OrderFilters = z.input<typeof orderFiltersSchema>;
