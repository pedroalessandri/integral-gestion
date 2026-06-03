import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type {
  OrganizationDetailDto,
  OrganizationSummaryDto,
  PeriodDetailDto,
} from '@gestion-publica/shared-types/core';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/audit-event-emitter.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
export interface FirstPeriodInput {
  code: string;
  startsAt: string;
  endsAt: string;
}

export interface CreateOrganizationInput {
  slug: string;
  name: string;
  firstPeriod?: FirstPeriodInput;
}

export interface UpdateOrganizationInput {
  name?: string;
  mission?: string | null;
  vision?: string | null;
  values?: string | null;
  context?: string | null;
}

export interface ListOrgsQuery {
  status?: 'active' | 'inactive';
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface CreateOrganizationResult {
  organization: OrganizationDetailDto;
  period: PeriodDetailDto;
}

/**
 * OrganizationService — manages organization lifecycle.
 *
 * D8-c: create() is atomic org+first period per ADR 0002 D8.
 * Wraps in prismaService.runInTransaction; emits both audit events inside the tx.
 *
 * D1: No soft-delete; uses status 'active'|'inactive'.
 *
 * Per ADR 0002 and plan step 4 (OrganizationService).
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  /**
   * Creates an organization and its first period atomically (D8-c).
   * The period status is 'open' if now is within [startsAt, endsAt], else 'future'.
   * Throws ConflictException if slug is already taken.
   */
  async create(
    input: CreateOrganizationInput,
    authContext: AuthContext,
  ): Promise<CreateOrganizationResult> {
    const now = new Date();

    if (!input.firstPeriod) {
      throw new Error('firstPeriod is required when creating an organization');
    }

    const periodStartsAt = new Date(input.firstPeriod.startsAt);
    const periodEndsAt = new Date(input.firstPeriod.endsAt);

    // Determine period status
    const periodStatus =
      now >= periodStartsAt && now <= periodEndsAt ? 'open' : 'future';

    try {
      const result = await tenantContextStorage.run(authContext, () =>
        this.prismaService.runInTransaction(async (tx) => {
          // Create organization
          const org = await tx.organization.create({
            data: {
              slug: input.slug,
              name: input.name,
              status: 'active',
            },
          });

          // Create first period
          const period = await tx.period.create({
            data: {
              organizationId: org.id,
              code: input.firstPeriod!.code,
              status: periodStatus,
              startsAt: periodStartsAt,
              endsAt: periodEndsAt,
            },
          });

          // Emit audit events inside the transaction
          // TODO(ADR-0003): audit emit wires through tx when real audit lands
          await this.auditEmitter.emit({
            action: 'organization.created',
            entityType: 'core.organization',
            entityId: org.id,
            diff: {
              before: null,
              after: { slug: org.slug, name: org.name, status: 'active' },
            },
          });

          await this.auditEmitter.emit({
            action: 'period.created',
            entityType: 'core.period',
            entityId: period.id,
            diff: {
              before: null,
              after: {
                code: period.code,
                status: period.status as 'future' | 'open',
                startsAt: period.startsAt.toISOString(),
                endsAt: period.endsAt.toISOString(),
              },
            },
          });

          return { org, period };
        }),
      );

      return {
        organization: this.toDetailDto(result.org),
        period: this.toPeriodDetailDto(result.period),
      };
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) {
        throw new ConflictException(`Organization slug "${input.slug}" is already taken.`);
      }
      throw err;
    }
  }

  /**
   * Updates organization name. Slug is immutable in MVP.
   */
  async update(
    id: string,
    patch: UpdateOrganizationInput,
    authContext: AuthContext,
  ): Promise<OrganizationDetailDto> {
    const org = await this.prismaService.raw.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.organization.update({
          where: { id },
          data: {
            ...(patch.name !== undefined && { name: patch.name }),
            ...(patch.mission !== undefined && { mission: patch.mission }),
            ...(patch.vision !== undefined && { vision: patch.vision }),
            ...(patch.values !== undefined && { values: patch.values }),
            ...(patch.context !== undefined && { context: patch.context }),
          },
        });

        await this.auditEmitter.emit({
          action: 'organization.updated',
          entityType: 'core.organization',
          entityId: id,
          diff: {
            before: {
              name: org.name,
              mission: org.mission,
              vision: org.vision,
              values: org.values,
              context: org.context,
            },
            after: {
              name: updated.name,
              mission: updated.mission,
              vision: updated.vision,
              values: updated.values,
              context: updated.context,
            },
          },
        });

        return this.toDetailDto(updated);
      }),
    );
  }

  /**
   * Activates an organization (sets status='active').
   * Throws ConflictException if already active.
   */
  async activate(id: string, authContext: AuthContext): Promise<OrganizationDetailDto> {
    const org = await this.prismaService.raw.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);

    if (org.status === 'active') {
      throw new ConflictException(`Organization ${id} is already active.`);
    }

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.organization.update({
          where: { id },
          data: {
            status: 'active',
            deactivatedAt: null,
            deactivatedByUserId: null,
          },
        });

        await this.auditEmitter.emit({
          action: 'organization.activated',
          entityType: 'core.organization',
          entityId: id,
          diff: {
            before: { status: 'inactive' },
            after: { status: 'active' },
          },
        });

        return this.toDetailDto(updated);
      }),
    );
  }

  /**
   * Deactivates an organization (sets status='inactive').
   * Throws ConflictException if already inactive.
   */
  async deactivate(
    id: string,
    authContext: AuthContext,
    reason?: string,
  ): Promise<OrganizationDetailDto> {
    const org = await this.prismaService.raw.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);

    if (org.status === 'inactive') {
      throw new ConflictException(`Organization ${id} is already inactive.`);
    }

    const deactivatedAt = new Date();

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.organization.update({
          where: { id },
          data: {
            status: 'inactive',
            deactivatedAt,
            deactivatedByUserId: authContext.userId,
          },
        });

        await this.auditEmitter.emit({
          action: 'organization.deactivated',
          entityType: 'core.organization',
          entityId: id,
          diff: {
            before: { status: 'active' },
            after: {
              status: 'inactive',
              deactivatedAt: deactivatedAt.toISOString(),
              ...(reason && { reason }),
            },
          },
        });

        return this.toDetailDto(updated);
      }),
    );
  }

  /**
   * Finds an organization by ID. Throws NotFoundException if not found.
   */
  async findById(id: string): Promise<OrganizationDetailDto> {
    const org = await this.prismaService.raw.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return this.toDetailDto(org);
  }

  /**
   * Lists organizations with optional filters and cursor-based pagination.
   */
  async list(query: ListOrgsQuery): Promise<{
    items: OrganizationSummaryDto[];
    nextCursor: string | null;
  }> {
    const limit = Math.min(query.limit ?? 50, 200);

    const orgs = await this.prismaService.raw.organization.findMany({
      where: {
        ...(query.status && { status: query.status }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { slug: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    });

    const hasMore = orgs.length > limit;
    const items = hasMore ? orgs.slice(0, limit) : orgs;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    return {
      items: items.map((o) => this.toSummaryDto(o)),
      nextCursor,
    };
  }

  private toSummaryDto(org: {
    id: string;
    slug: string;
    name: string;
    status: string;
    createdAt: Date;
  }): OrganizationSummaryDto {
    return {
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status as 'active' | 'inactive',
      createdAt: org.createdAt.toISOString(),
    };
  }

  private toDetailDto(org: {
    id: string;
    slug: string;
    name: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    deactivatedAt: Date | null;
    deactivatedByUserId: string | null;
    mission?: string | null;
    vision?: string | null;
    values?: string | null;
    context?: string | null;
  }): OrganizationDetailDto {
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

  private toPeriodDetailDto(period: {
    id: string;
    organizationId: string;
    code: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    closedAt: Date | null;
    closedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PeriodDetailDto {
    return {
      id: period.id,
      organizationId: period.organizationId,
      code: period.code,
      status: period.status as 'open' | 'closed' | 'future',
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
      closedAt: period.closedAt?.toISOString() ?? null,
      closedByUserId: period.closedByUserId,
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString(),
    };
  }
}

/** Checks if an error is a Prisma unique constraint violation (P2002). */
function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  );
}
