import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { withTransaction } from '../src/db/transaction.js';

describe('transaction retry', () => {
  it('reruns the full callback after a retryable conflict', async () => {
    const run = vi.fn().mockRejectedValueOnce({ code: 'P2034' }).mockResolvedValueOnce('committed');
    const db = { $transaction: (work: () => Promise<string>) => work() } as PrismaClient;
    expect(await withTransaction(db, run)).toBe('committed');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not retry ordinary failures', async () => {
    const run = vi.fn().mockRejectedValue(new Error('ordinary failure'));
    const db = { $transaction: (work: () => Promise<string>) => work() } as PrismaClient;
    await expect(withTransaction(db, run)).rejects.toThrow('ordinary failure');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('limits retryable attempts to three', async () => {
    const run = vi.fn().mockRejectedValue({ code: '40001' });
    const db = { $transaction: (work: () => Promise<string>) => work() } as PrismaClient;
    await expect(withTransaction(db, run)).rejects.toMatchObject({ code: '40001' });
    expect(run).toHaveBeenCalledTimes(3);
  });
});
