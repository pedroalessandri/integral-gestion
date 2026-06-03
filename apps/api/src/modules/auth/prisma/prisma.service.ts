import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantExtension } from '@gestion-publica/prisma-tenant-extension';
import type { TenantContextProvider } from '@gestion-publica/prisma-tenant-extension';
import { tenantContextStorage } from '../context/tenant-context-storage.js';
import {
  transactionContextStorage,
  type PrismaTransactionClient,
} from '../../audit/context/transaction-context-storage.js';

/**
 * PrismaService exposes two clients:
 *  - `raw`: the base PrismaClient, for superadmin cross-tenant queries and migrations.
 *  - `scoped`: PrismaClient extended with the tenant extension. All business queries
 *    use this client; it enforces organizationId filtering via ALS context.
 *
 * runInTransaction<T>() wraps a callback in a $transaction and populates
 * transactionContextStorage so that audit event writers can join the same transaction.
 *
 * Per ADR 0004 D6.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly _raw: PrismaClient;

  /**
   * TenantContextProvider implementation: reads from tenantContextStorage ALS lazily
   * at query time (not at construction time). This is critical for concurrent requests.
   */
  private readonly _tenantContextProvider: TenantContextProvider = {
    getOrganizationId: () => {
      const store = tenantContextStorage.getStore();
      return store?.organizationId ?? null;
    },
    isSuperadmin: () => {
      const store = tenantContextStorage.getStore();
      return store?.isSuperadmin ?? false;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _scoped: any;

  constructor() {
    this._raw = new PrismaClient();
    // The scoped client is the raw client extended with the tenant extension.
    // Type widened to `any` here because $extends returns a complex opaque type
    // that is not directly assignable to PrismaClient; callers use it as PrismaClient.
    this._scoped = this._raw.$extends(
      tenantExtension(this._tenantContextProvider),
    );
  }

  /** Base PrismaClient without tenant scoping. Use for superadmin or infrastructure queries. */
  get raw(): PrismaClient {
    return this._raw;
  }

  /**
   * Tenant-scoped client. All business queries must use this.
   * Returns PrismaClient typed loosely — the extension adds runtime behavior
   * but the API surface matches PrismaClient for standard operations.
   */
  get scoped(): PrismaClient {
    return this._scoped as PrismaClient;
  }

  /**
   * Executes `fn` inside a Prisma $transaction and populates transactionContextStorage
   * for the duration of the callback. Audit event writers MUST be called within this.
   *
   * IMPORTANT: Prisma's $transaction callback runs in a new async context branch.
   * When AuthGuard uses enterWith() to set tenantContextStorage, that context is
   * not automatically inherited by the new branch. We capture the current tenant
   * context here (before $transaction) and re-enter it via .run() so that
   * AuditEventEmitterService can read it inside the transaction.
   *
   * @param fn Callback receiving the transaction client.
   * @returns Whatever `fn` returns.
   */
  async runInTransaction<T>(
    fn: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    // Capture tenant context before $transaction spawns a new async resource
    const tenantCtx = tenantContextStorage.getStore();

    return this._raw.$transaction(async (tx) => {
      return transactionContextStorage.run(tx, () => {
        // If a tenant context was active when runInTransaction was called,
        // re-establish it inside this new async branch so downstream readers
        // (e.g. AuditEventEmitterService) can find it via getStore().
        if (tenantCtx !== undefined) {
          return tenantContextStorage.run(tenantCtx, () => fn(tx));
        }
        return fn(tx);
      });
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this._raw.$connect();
    this.logger.log('Database connected.');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this._raw.$disconnect();
  }
}
