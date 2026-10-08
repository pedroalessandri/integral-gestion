import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import type { OrgUnitScope } from '../../../common/contracts/index.js';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

interface ResolvedScope {
  /** `null` = toda la org (alcance central o superadmin). */
  rootUnitId: string | null;
  /** Unidad raíz del alcance + descendientes vivas. Vacío cuando `rootUnitId` es `null`. */
  unitIds: ReadonlySet<string>;
}

/**
 * OrgUnitScopeService — alcance de escritura por unidad (RN-P19, RN-P20, RN-P21).
 *
 * Implementa el puerto `ORG_UNIT_SCOPE`. Regla: permiso = RBAC (lo evalúa PermissionsGuard) ∧ alcance (esto).
 *  - Alcance `null` o superadmin: puede escribir en cualquier unidad y en N1/N2/árbol.
 *  - Alcance en una unidad U: solo en U y sus descendientes vivas (CTE recursiva sobre `core.org_unit`).
 *
 * Cache por request: el `AuthContext` es un objeto por request (`request.authContext`), así que se cachea la
 * resolución del alcance (y el set de descendientes) en un WeakMap atado a ese objeto. Cero estado entre requests.
 *
 * El contexto se lee del `AuthContext` que reciben los services (que viene de `request.authContext`); el ALS
 * solo se usa como fallback cuando el llamador no lo pasa.
 */
@Injectable()
export class OrgUnitScopeService implements OrgUnitScope {
  private readonly cache = new WeakMap<object, Promise<ResolvedScope>>();

  constructor(private readonly prisma: PrismaService) {}

  async assertCentralScope(authContext: AuthContext): Promise<void> {
    const scope = await this.resolve(authContext);
    if (scope.rootUnitId !== null) throw this.forbidden('requires organization-wide (central) scope');
  }

  async assertCanWriteInUnit(authContext: AuthContext, orgUnitId: string | null): Promise<void> {
    const scope = await this.resolve(authContext);
    if (scope.rootUnitId === null) return;
    if (orgUnitId === null) throw this.forbidden('the entity has no unit; requires organization-wide (central) scope');
    if (!scope.unitIds.has(orgUnitId)) throw this.forbidden(`unit "${orgUnitId}" is outside the member scope`);
  }

  async assertCanWriteInAllUnits(
    authContext: AuthContext,
    orgUnitIds: ReadonlyArray<string | null>,
  ): Promise<void> {
    if (orgUnitIds.length === 0) return this.assertCentralScope(authContext);
    for (const id of new Set(orgUnitIds)) {
      await this.assertCanWriteInUnit(authContext, id);
    }
  }

  private forbidden(detail: string): ForbiddenException {
    return new ForbiddenException(`OrgUnitScopeForbidden: ${detail}.`);
  }

  private resolve(authContext: AuthContext): Promise<ResolvedScope> {
    const ctx = authContext ?? tenantContextStorage.getStore();
    if (!ctx) return Promise.reject(this.forbidden('no auth context'));
    const cached = this.cache.get(ctx);
    if (cached) return cached;
    const pending = this.load(ctx);
    this.cache.set(ctx, pending);
    // Un fallo no se cachea: se reintenta en la próxima llamada del mismo request.
    pending.catch(() => this.cache.delete(ctx));
    return pending;
  }

  private async load(ctx: AuthContext): Promise<ResolvedScope> {
    if (ctx.isSuperadmin) return { rootUnitId: null, unitIds: new Set() };
    const organizationId = ctx.organizationId;
    if (!organizationId) throw this.forbidden('no organization context');

    let rootUnitId: string | null;
    if (ctx.orgUnitId !== undefined) {
      rootUnitId = ctx.orgUnitId;
    } else {
      const membership = await this.prisma.raw.userOrganizationRole.findUnique({
        where: { userId_organizationId: { userId: ctx.userId, organizationId } },
        select: { orgUnitId: true },
      });
      if (!membership) throw this.forbidden('not a member of the organization');
      rootUnitId = membership.orgUnitId;
    }
    if (rootUnitId === null) return { rootUnitId: null, unitIds: new Set() };

    const rows = await this.prisma.raw.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE sub AS (
        SELECT id FROM core.org_unit
        WHERE id = ${rootUnitId} AND organization_id = ${organizationId}
        UNION
        SELECT u.id FROM core.org_unit u
        JOIN sub s ON u.parent_id = s.id
        WHERE u.organization_id = ${organizationId} AND u.deleted_at IS NULL
      )
      SELECT id FROM sub`;
    return { rootUnitId, unitIds: new Set(rows.map((r) => r.id)) };
  }
}
