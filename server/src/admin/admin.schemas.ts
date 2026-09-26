import { UnprocessableEntityException } from "@nestjs/common";
import { z } from "zod";
export const paginationSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const customerFiltersSchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
});
export const statusSchema = z.strictObject({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(1).max(500),
  version: z.number().int().positive(),
});
export const safeNumber = (value: bigint | number | string): number => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new UnprocessableEntityException({ code: "TOTAL_TOO_LARGE" });
  return n;
};
