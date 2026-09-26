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
export const orderFiltersSchema = pagination.extend({ status: statusSchema.optional(), collectionState: z.enum(['DUE', 'COLLECTED']).optional() });
export type Transition = z.infer<typeof transitionSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type OrderFilters = z.input<typeof orderFiltersSchema>;
