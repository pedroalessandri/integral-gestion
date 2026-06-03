import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * Singleton ALS instance for tenant/auth context.
 * Populated by AuthGuard (first pass: userId, auth0Sub, email, displayName, isSuperadmin)
 * and TenantGuard (second pass: organizationId, permissions).
 *
 * Readonly after TenantGuard returns. Services read from this; they must not mutate it.
 *
 * Per ADR 0004 D6: this ALS is owned by the auth module. PrismaService reads from it
 * lazily (at query time) via the TenantContextProvider interface implemented in PrismaService.
 */
export const tenantContextStorage = new AsyncLocalStorage<AuthContext>();
