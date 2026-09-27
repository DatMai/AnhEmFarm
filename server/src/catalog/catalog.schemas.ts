import { z } from 'zod';
import { parseBody } from '../http/schemas.js';

export const slug = z.string().regex(/^[a-z0-9-]{1,160}$/);
const name = z.string().trim().min(1).max(160);
const description = z.string().max(20000);
const sku = z.string().trim().min(1).max(80);
const label = z.string().trim().min(1).max(160);
const packDetails = z.string().max(200);
const priceVnd = z.number().int().positive().max(1_000_000_000).nullable();
const version = z.number().int().positive();
const pageNumber = z.coerce.number().int().min(1);
export const pagination = z.strictObject({ page: pageNumber.default(1), pageSize: pageNumber.max(100).default(20) });
export const productQuery = pagination.extend({
  q: z.string().max(200).optional(), category: slug.optional(),
  sort: z.enum(['name', 'price_asc', 'price_desc', 'newest']).default('newest'),
});
export const categoryCreate = z.strictObject({ slug, name });
export const categoryPatch = z.strictObject({ expectedVersion: version, slug: slug.optional(), name: name.optional() });
export const productCreate = z.strictObject({ slug, name, description, categoryId: z.uuid(),
  confirmed: z.boolean().optional(), restricted18: z.boolean().optional(), status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});
export const productPatch = z.strictObject({ expectedVersion: version, slug: slug.optional(), name: name.optional(),
  description: description.optional(), categoryId: z.uuid().optional(), confirmed: z.boolean().optional(),
  restricted18: z.boolean().optional(), status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});
const choiceLabel = z.string().trim().min(1).max(80);
export const choiceGroupUpdate = z.strictObject({
  expectedVersion: version,
  label: choiceLabel.nullable(),
  choices: z.array(z.strictObject({ id: z.uuid().optional(), label: choiceLabel, active: z.boolean() })).max(60),
}).superRefine((value, context) => {
  if (value.label === null && value.choices.length > 0)
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Choices must be empty when the group is disabled.' });
  if (value.label !== null && value.choices.every(choice => !choice.active))
    context.addIssue({ code: 'custom', path: ['choices'], message: 'An active group needs at least one active choice.' });
  if (value.choices.filter(choice => choice.active).length > 12)
    context.addIssue({ code: 'custom', path: ['choices'], message: 'At most 12 choices may be active.' });
  if (new Set(value.choices.flatMap(choice => choice.id ? [choice.id] : [])).size !== value.choices.filter(choice => choice.id).length)
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Choice IDs must be unique.' });
  const labels = value.choices.map(choice => choice.label.toLocaleLowerCase('en-US'));
  if (new Set(labels).size !== labels.length)
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Choice labels must be unique.' });
});
export const variantCreate = z.strictObject({ sku, label, packDetails, priceVnd, saleEnabled: z.boolean() });
export const variantPatch = z.strictObject({ expectedVersion: version, sku: sku.optional(), label: label.optional(),
  packDetails: packDetails.optional(), priceVnd: priceVnd.optional(), saleEnabled: z.boolean().optional(),
});
export const adminListQuery = pagination.extend({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(), q: z.string().trim().max(200).optional() });
export const categoryListQuery = pagination;
export const idSchema = z.uuid();
export const parse = parseBody;
