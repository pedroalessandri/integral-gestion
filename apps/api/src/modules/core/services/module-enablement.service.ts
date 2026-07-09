import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/audit-event-emitter.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

export interface OrganizationModuleInfo {
  organizationId: string;
  moduleKey: string;
  enabledAt: string;
  enabledByUserId: string;
  disabledAt: string | null;
  disabledByUserId: string | null;
}

/**
 * Declarative module dependency map: moduleKey → modules it requires.
 * Enforced in enableModule (409 if a required module is disabled) and in
 * disableModule (409 if an enabled module depends on the one being disabled).
 * Per docs/features/indicadores-modelo-comun.md §4.
 */
export const MODULE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  'indicadores-okr': ['indicadores-gestion'],
};

/**
 * ModuleEnablementService — manages which modules are enabled for an organization.
 *
 * Per ADR 0002 D4-B: module_key is a row in core.module; enabling/disabling
 * is a toggle on organization_module (upsert sets enabled_at, clears disabled_at).
 *
 * Per ADR 0002 D5 plan step 4 (ModuleEnablementService).
 */
@Injectable()
export class ModuleEnablementService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  /**
   * Returns true if the given module is enabled for the organization.
   * "Enabled" = row exists with disabled_at IS NULL.
   */
  async isEnabled(organizationId: string, moduleKey: string): Promise<boolean> {
    const row = await this.prismaService.raw.organizationModule.findFirst({
      where: {
        organizationId,
        moduleKey,
        disabledAt: null,
      },
    });
    return row !== null;
  }

  /**
   * Enables a module for an organization.
   * Upserts: if the row exists (previously disabled), clears disabled_at and updates enabledAt.
   * Throws NotFoundException if the module key is not in core.module.
   */
  async enableModule(
    organizationId: string,
    moduleKey: string,
    authContext: AuthContext,
  ): Promise<OrganizationModuleInfo> {
    // Verify module exists in registry
    const moduleExists = await this.prismaService.raw.module.findUnique({
      where: { key: moduleKey },
    });

    if (!moduleExists) {
      throw new NotFoundException(`Module "${moduleKey}" is not in the module registry.`);
    }

    // Dependency rule: every required module must be enabled first.
    for (const requiredKey of MODULE_DEPENDENCIES[moduleKey] ?? []) {
      if (!(await this.isEnabled(organizationId, requiredKey))) {
        throw new ConflictException(
          `Module "${moduleKey}" requires module "${requiredKey}" to be enabled first.`,
        );
      }
    }

    const enabledAt = new Date();

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const row = await tx.organizationModule.upsert({
          where: { organizationId_moduleKey: { organizationId, moduleKey } },
          create: {
            organizationId,
            moduleKey,
            enabledAt,
            enabledByUserId: authContext.userId,
            disabledAt: null,
            disabledByUserId: null,
          },
          update: {
            enabledAt,
            enabledByUserId: authContext.userId,
            disabledAt: null,
            disabledByUserId: null,
          },
        });

        await this.auditEmitter.emit({
          action: 'organization_module.enabled',
          entityType: 'core.organization_module',
          entityId: `${organizationId}:${moduleKey}`,
          diff: {
            before: null,
            after: {
              enabledAt: row.enabledAt.toISOString(),
              enabledByUserId: authContext.userId,
            },
          },
        });

        return this.toInfo(row);
      }),
    );
  }

  /**
   * Disables a module for an organization.
   * Throws NotFoundException if module not registered or org doesn't have it enabled.
   */
  async disableModule(
    organizationId: string,
    moduleKey: string,
    authContext: AuthContext,
  ): Promise<OrganizationModuleInfo> {
    // Verify module exists in registry
    const moduleExists = await this.prismaService.raw.module.findUnique({
      where: { key: moduleKey },
    });

    if (!moduleExists) {
      throw new NotFoundException(`Module "${moduleKey}" is not in the module registry.`);
    }

    const existing = await this.prismaService.raw.organizationModule.findUnique({
      where: { organizationId_moduleKey: { organizationId, moduleKey } },
    });

    if (!existing || existing.disabledAt !== null) {
      throw new ConflictException(
        `Module "${moduleKey}" is not currently enabled for this organization.`,
      );
    }

    // Dependency rule: cannot disable a module while an enabled module depends on it.
    // No silent cascade — the dependent module must be disabled first.
    for (const [dependentKey, requiredKeys] of Object.entries(MODULE_DEPENDENCIES)) {
      if (
        requiredKeys.includes(moduleKey) &&
        (await this.isEnabled(organizationId, dependentKey))
      ) {
        throw new ConflictException(
          `Module "${moduleKey}" cannot be disabled: module "${dependentKey}" depends on it. Disable "${dependentKey}" first.`,
        );
      }
    }

    const disabledAt = new Date();

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.organizationModule.update({
          where: { organizationId_moduleKey: { organizationId, moduleKey } },
          data: {
            disabledAt,
            disabledByUserId: authContext.userId,
          },
        });

        await this.auditEmitter.emit({
          action: 'organization_module.disabled',
          entityType: 'core.organization_module',
          entityId: `${organizationId}:${moduleKey}`,
          diff: {
            before: { disabledAt: null },
            after: {
              disabledAt: disabledAt.toISOString(),
              disabledByUserId: authContext.userId,
            },
          },
        });

        return this.toInfo(updated);
      }),
    );
  }

  /**
   * Returns all modules (enabled and disabled) for an organization.
   */
  async listForOrganization(organizationId: string): Promise<OrganizationModuleInfo[]> {
    const rows = await this.prismaService.raw.organizationModule.findMany({
      where: { organizationId },
      orderBy: { moduleKey: 'asc' },
    });

    return rows.map((r) => this.toInfo(r));
  }

  private toInfo(row: {
    organizationId: string;
    moduleKey: string;
    enabledAt: Date;
    enabledByUserId: string;
    disabledAt: Date | null;
    disabledByUserId: string | null;
  }): OrganizationModuleInfo {
    return {
      organizationId: row.organizationId,
      moduleKey: row.moduleKey,
      enabledAt: row.enabledAt.toISOString(),
      enabledByUserId: row.enabledByUserId,
      disabledAt: row.disabledAt?.toISOString() ?? null,
      disabledByUserId: row.disabledByUserId,
    };
  }
}
