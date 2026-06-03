import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { tenantContextStorage } from '../../modules/auth/context/tenant-context-storage.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * Extracts the authenticated AuthContext from the request object (set by
 * AuthGuard/TenantGuard/DevAuthMiddleware) with a fallback to the ALS store.
 *
 * Reading from the request object is necessary because NestJS evaluates param
 * decorators independently of guard execution order, so the ALS store may still
 * hold the pre-TenantGuard context by the time the decorator runs.
 *
 * Lives in common/decorators to avoid a circular module dependency:
 *   audit.controller → auth/index → auth.guard → audit/context → [cycle]
 * By placing CurrentUser here it imports only from auth/context (no cycle) and
 * can be consumed by any controller without traversing the full auth/index
 * re-export chain.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    const fromRequest = request['authContext'] as AuthContext | undefined;
    if (fromRequest) return fromRequest;
    const fromAls = tenantContextStorage.getStore();
    if (fromAls) return fromAls;
    throw new Error('AuthContext not available — AuthGuard must run first.');
  },
);
