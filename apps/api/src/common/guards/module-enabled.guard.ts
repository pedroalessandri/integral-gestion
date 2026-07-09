import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ModuleEnablementService } from '../../modules/core/index.js';
import { tenantContextStorage } from '../../modules/auth/index.js';
import { REQUIRES_MODULE_KEY } from '../decorators/requires-module.decorator.js';

/** Cache TTL for enablement lookups (D-A9). A superadmin toggle may take up
 * to this long to propagate — acceptable for a rare admin operation. */
const CACHE_TTL_MS = 30_000;

/**
 * ModuleEnabledGuard — rejects requests to endpoints of a module that is not
 * enabled for the current organization (default deny: no enablement row means
 * disabled). Reads the module key(s) from @RequiresModule metadata and the
 * organizationId from the AuthContext, so it must run AFTER TenantGuard.
 *
 * No superadmin bypass: a disabled module is disabled for everyone; the
 * superadmin can enable it via the module administration endpoints.
 *
 * Per docs/features/indicadores-modelo-comun.md §4.
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  private readonly cache = new Map<string, { enabled: boolean; expiresAt: number }>();

  constructor(
    private readonly reflector: Reflector,
    private readonly moduleEnablementService: ModuleEnablementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModules = this.reflector.getAllAndOverride<string[]>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredModules || requiredModules.length === 0) return true;

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authCtx =
      (request['authContext'] as AuthContext | undefined) ??
      tenantContextStorage.getStore();
    if (!authCtx?.organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    for (const moduleKey of requiredModules) {
      if (!(await this.isEnabledCached(authCtx.organizationId, moduleKey))) {
        throw new ForbiddenException('ModuleDisabled');
      }
    }
    return true;
  }

  private async isEnabledCached(organizationId: string, moduleKey: string): Promise<boolean> {
    const cacheKey = `${organizationId}:${moduleKey}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.enabled;

    const enabled = await this.moduleEnablementService.isEnabled(organizationId, moduleKey);
    this.cache.set(cacheKey, { enabled, expiresAt: Date.now() + CACHE_TTL_MS });
    return enabled;
  }
}
