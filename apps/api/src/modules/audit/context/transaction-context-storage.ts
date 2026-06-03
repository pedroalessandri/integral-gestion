import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';

/**
 * The transaction client type: the argument passed to Prisma's $transaction callback.
 * We derive it from the PrismaClient.$transaction signature so it stays in sync
 * with the installed Prisma version without manual typing.
 */
export type PrismaTransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

/**
 * Thrown when code that requires an active Prisma transaction (e.g. audit event
 * writers that must be atomic with the business mutation) is called outside of a
 * runInTransaction() block.
 *
 * This is a programmer error / wiring bug, not a user-facing error.
 * Maps to HTTP 500 in HttpExceptionFilter (error code 'NoActiveTransaction').
 *
 * Per ADR 0003 D1/D10.
 */
export class NoActiveTransactionError extends Error {
  constructor(context?: string) {
    super(
      `No active Prisma transaction in the current ALS context.` +
        (context ? ` Caller: ${context}.` : '') +
        ` Wrap the operation in PrismaService.runInTransaction().`,
    );
    this.name = 'NoActiveTransactionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Singleton ALS instance for transaction context.
 * Populated by PrismaService.runInTransaction() while inside a $transaction block.
 * Audit event writers read from this ALS to ensure they participate in the same transaction.
 *
 * Per ADR 0003 D8: this ALS is owned by the audit module because audit is the primary consumer.
 */
export const transactionContextStorage =
  new AsyncLocalStorage<PrismaTransactionClient>();
