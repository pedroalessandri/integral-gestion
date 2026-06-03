import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tenantContextStorage } from '../context/tenant-context-storage.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { hasPermission } from '@gestion-publica/shared-types/auth';
import type { AuthContext, PermissionKey } from '@gestion-publica/shared-types/auth';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    // Prefer request.authContext (written by AuthGuard + TenantGuard) over ALS,
    // matching the same fallback pattern used in TenantGuard to survive ALS propagation issues.
    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    const authCtx =
      (request['authContext'] as AuthContext | undefined) ??
      tenantContextStorage.getStore();
    if (!authCtx) throw new ForbiddenException('PermissionDenied');

    // Superadmin bypass — sentinel '*' is already in permissions after TenantGuard,
    // but check isSuperadmin explicitly as defense-in-depth in case this guard runs
    // without TenantGuard (e.g., cross-tenant endpoints).
    if (authCtx.isSuperadmin) return true;

    // Cast each permission string to PermissionKey for the typed helper.
    // The decorator accepts string[] for ergonomics; runtime values must match the catalog.
    const granted = required.every((perm) =>
      hasPermission(authCtx, perm as PermissionKey),
    );
    if (!granted) throw new ForbiddenException('PermissionDenied');
    return true;
  }
}
