import { UnprocessableEntityException } from '@nestjs/common';
import { z, type ZodType } from 'zod';

export const uuidSchema = z.uuid();
export const emailSchema = z.email().max(254).transform(value => value.toLowerCase());
export const shortTextSchema = z.string().trim().min(1).max(200);

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new UnprocessableEntityException({
    code: 'VALIDATION_FAILED',
    fields: result.error.issues.map(issue => ({ field: issue.path.join('.'), code: issue.code })),
  });
}
