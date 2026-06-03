import { Prisma } from '@prisma/client';
import { MissingTenantContextError } from './errors.js';
import { TENANT_SCOPED_MODELS } from './tenant-scoped-models.js';
import type { TenantContextProvider } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/**
 * Parameters passed to the `$allOperations` intercept callback.
 * Extracted as a named type for testability — tests can call
 * `interceptAllOperations()` directly without needing a real PrismaClient.
 */
export interface AllOperationsParams {
  model: string | undefined;
  operation: string;
  args: AnyRecord;
  query: (args: AnyRecord) => Promise<unknown>;
}

/**
 * Core intercept function that injects `organizationId` into Prisma query args.
 *
 * **Critical design invariant — lazy provider calls**:
 * `provider.getOrganizationId()` and `provider.isSuperadmin()` are called at
 * **query time** inside this function, NOT at extension construction time.
 * The extension is instantiated once per `PrismaService` lifecycle (once at
 * app startup), but each concurrent HTTP request runs its own ALS context.
 * If the provider captured values eagerly, all requests would see the same
 * (stale) organization ID — a critical security bug.
 *
 * Exported for unit testing. Tests call this function directly with mock
 * `query` functions, without needing a real PrismaClient.
 *
 * Per ADR 0004 D6: this is the authoritative implementation of tenant scoping.
 */
export async function interceptAllOperations(
  provider: TenantContextProvider,
  { model, operation, args, query }: AllOperationsParams,
): Promise<unknown> {
  // Pass-through: undefined model or model not in the scoped set.
  if (!model || !TENANT_SCOPED_MODELS.has(model)) {
    return query(args);
  }

  // LAZY READ — called here, at query time, not at extension construction.
  // Each invocation reads the ALS for the currently executing async context.
  if (provider.isSuperadmin()) {
    return query(args); // superadmin bypass: full cross-tenant access
  }

  // LAZY READ — same requirement as above.
  const orgId = provider.getOrganizationId();
  if (orgId === null) {
    throw new MissingTenantContextError(model, operation);
  }

  const mutatedArgs = injectOrganizationId(args, operation, orgId, model);
  return query(mutatedArgs);
}

/**
 * Creates a Prisma client extension that automatically injects `organizationId`
 * into every query on tenant-scoped models.
 *
 * Per ADR 0004 D6: the `provider` argument is a thin interface wrapping
 * `TenantContextStorage.get()?.organizationId` and `...?.isSuperadmin`. The
 * concrete wiring lives in `apps/api/src/modules/auth/`.
 *
 * @param provider - Lazy context reader; must read ALS on every method call.
 */
export function tenantExtension(provider: TenantContextProvider) {
  return Prisma.defineExtension({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        $allOperations(params: AllOperationsParams) {
          return interceptAllOperations(provider, params);
        },
      },
    },
  });
}

/**
 * Injects `organizationId` into query `args` according to the Prisma operation.
 *
 * Mutation strategies per operation family:
 * - **Read/count/aggregate**: merge into `args.where`
 * - **create**: merge into `args.data`
 * - **update/updateMany/delete/deleteMany**: merge into `args.where`
 * - **upsert**: merge into `args.where` AND `args.create`; throws if `args.update`
 *   contains `organizationId` (changing tenancy is a bug).
 * - **createMany**: inject into every element of `args.data` (array).
 */
function injectOrganizationId(
  args: AnyRecord,
  operation: string,
  orgId: string,
  model: string,
): AnyRecord {
  switch (operation) {
    case 'findUnique':
    case 'findFirst':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
      return {
        ...args,
        where: { ...((args['where'] as Record<string, unknown> | undefined) ?? {}), organizationId: orgId },
      };

    case 'create':
      return {
        ...args,
        data: { ...((args['data'] as Record<string, unknown> | undefined) ?? {}), organizationId: orgId },
      };

    case 'update':
    case 'updateMany':
    case 'delete':
    case 'deleteMany':
      return {
        ...args,
        where: { ...((args['where'] as Record<string, unknown> | undefined) ?? {}), organizationId: orgId },
      };

    case 'upsert': {
      const update = (args['update'] as Record<string, unknown> | undefined) ?? {};
      if ('organizationId' in update) {
        throw new Error(
          `Attempted to change organizationId in upsert.update for model ${model}. ` +
            `Changing tenant ownership is a bug — remove organizationId from the update payload.`,
        );
      }
      return {
        ...args,
        where: { ...((args['where'] as Record<string, unknown> | undefined) ?? {}), organizationId: orgId },
        create: { ...((args['create'] as Record<string, unknown> | undefined) ?? {}), organizationId: orgId },
      };
    }

    case 'createMany': {
      const data = args['data'] as Array<Record<string, unknown>> | Record<string, unknown> | undefined;
      const normalizedData = Array.isArray(data) ? data : data !== undefined ? [data] : [];
      return {
        ...args,
        data: normalizedData.map((record) => ({ ...record, organizationId: orgId })),
      };
    }

    default:
      // Unknown operation: pass through without mutation.
      // Safe default — we'd rather not inject than corrupt an unknown shape.
      return args;
  }
}
