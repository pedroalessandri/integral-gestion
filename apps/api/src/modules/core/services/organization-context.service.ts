import { Injectable, NotFoundException } from '@nestjs/common';
import type { OrganizationDetailDto } from '@gestion-publica/shared-types/core';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { PrismaService } from '../../auth/prisma/prisma.service.js';

/**
 * Error thrown when an operation requires an organization context
 * but none is present in the current ALS store.
 */
export class MissingTenantContextError extends Error {
  constructor() {
    super(
      'No organization context in current request. ' +
        'Ensure TenantGuard (or DevAuthMiddleware with X-Dev-Org-Id) has run.',
    );
    this.name = 'MissingTenantContextError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * OrganizationContextService — reads the current tenant organization from ALS.
 *
 * Per ADR 0002: reads tenantContextStorage ALS.
 * For cross-tenant operations, use OrganizationService.findById directly.
 */
@Injectable()
export class OrganizationContextService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Returns the current organization's ID from ALS context.
   * Throws MissingTenantContextError if no org is in context.
   */
  getCurrentOrganizationId(): string {
    const store = tenantContextStorage.getStore();
    if (!store?.organizationId) {
      throw new MissingTenantContextError();
    }
    return store.organizationId;
  }

  /**
   * Returns the current organization's ID or null if not in context.
   */
  getCurrentOrganizationIdOrNull(): string | null {
    const store = tenantContextStorage.getStore();
    return store?.organizationId ?? null;
  }

  /**
   * Returns detailed org info for the current organization in context.
   * Throws MissingTenantContextError if no org context.
   * Throws NotFoundException if the org doesn't exist in DB.
   */
  async getCurrent(): Promise<OrganizationDetailDto> {
    const orgId = this.getCurrentOrganizationId();
    const org = await this.prismaService.raw.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException(`Organization ${orgId} not found`);
    }

    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status as 'active' | 'inactive',
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      deactivatedAt: org.deactivatedAt?.toISOString() ?? null,
      deactivatedByUserId: org.deactivatedByUserId,
      mission: org.mission ?? null,
      vision: org.vision ?? null,
      values: org.values ?? null,
      context: org.context ?? null,
    };
  }

  /**
   * Returns null if no organization is in context (no-throw variant).
   */
  async getCurrentOrNull(): Promise<OrganizationDetailDto | null> {
    const orgId = this.getCurrentOrganizationIdOrNull();
    if (!orgId) return null;

    const org = await this.prismaService.raw.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) return null;

    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status as 'active' | 'inactive',
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      deactivatedAt: org.deactivatedAt?.toISOString() ?? null,
      deactivatedByUserId: org.deactivatedByUserId,
      mission: org.mission ?? null,
      vision: org.vision ?? null,
      values: org.values ?? null,
      context: org.context ?? null,
    };
  }
}
