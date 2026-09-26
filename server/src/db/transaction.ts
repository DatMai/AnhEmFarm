import { Prisma, PrismaClient } from '../generated/prisma/client.js';

function retryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; meta?: { code?: unknown }; cause?: unknown };
  return record.code === 'P2034' || record.code === '40001' || record.code === '40P01' ||
    record.meta?.code === '40001' || record.meta?.code === '40P01' ||
    (record.cause !== undefined && retryable(record.cause));
}

export async function withTransaction<T>(db: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(work);
    } catch (error) {
      if (attempt >= 3 || !retryable(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 + Math.floor(Math.random() * 81)));
    }
  }
}
