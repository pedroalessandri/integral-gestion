import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import type { PeriodDetailDto, PeriodSummaryDto } from '@gestion-publica/shared-types/core';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/audit-event-emitter.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

export interface CreatePeriodInput {
  code: string;
  startsAt: Date;
  endsAt: Date;
  status?: 'open' | 'future';
}

/**
 * PeriodService — manages period lifecycle within an organization.
 *
 * D3-A invariant: at most one 'open' period per org is enforced at DB level
 * by the partial unique index uq_period_org_one_open. We treat Prisma error
 * P2002 on that index as a 409 Conflict.
 *
 * Periods are non-editable after creation (no patchPeriod).
 * Periods are soft-deletable (softDeletePeriod) with cascade to Objectives/KRs/Tasks.
 *
 * Per ADR 0002 D2, D3-A and plan step 4 (PeriodService).
 */
@Injectable()
export class PeriodService {
  private readonly logger = new Logger(PeriodService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  /**
   * Lists periods for an organization with optional filters.
   * Excludes soft-deleted periods.
   */
  async listForOrganization(
    organizationId: string,
    options: { status?: string; limit?: number; cursor?: string } = {},
  ): Promise<PeriodDetailDto[]> {
    const periods = await this.prismaService.raw.period.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options.status && { status: options.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 50,
      ...(options.cursor && { cursor: { id: options.cursor }, skip: 1 }),
    });

    return periods.map((p) => this.toDetailDto(p));
  }

  /**
   * Returns the currently open period for an organization, or null if none exists.
   * Excludes soft-deleted periods.
   */
  async getCurrentOpenPeriod(organizationId: string): Promise<PeriodSummaryDto | null> {
    const org = await this.prismaService.raw.organization.findUnique({
      where: { id: organizationId },
      select: { status: true },
    });

    if (!org || org.status !== 'active') {
      return null;
    }

    const period = await this.prismaService.raw.period.findFirst({
      where: { organizationId, status: 'open', deletedAt: null },
    });

    if (!period) return null;

    return this.toSummaryDto(period);
  }

  /**
   * Returns a period by ID. Throws NotFoundException if not found or soft-deleted.
   */
  async getById(periodId: string): Promise<PeriodDetailDto> {
    const period = await this.prismaService.raw.period.findUnique({
      where: { id: periodId },
    });

    if (!period || period.deletedAt !== null) {
      throw new NotFoundException(`Period ${periodId} not found`);
    }

    return this.toDetailDto(period);
  }

  /**
   * Creates a new period for an organization. Status can be 'open' or 'future'.
   * Validates:
   *  - endsAt > startsAt (DB also enforces via chk_period_range)
   *  - 7 <= days between <= 366
   *  - No overlap with existing non-deleted periods
   *
   * Internal — called by OrganizationService (atomic org+period creation) and
   * by PeriodController (manual creation from admin).
   */
  async createForOrganization(
    organizationId: string,
    input: CreatePeriodInput,
    authContext: AuthContext,
  ): Promise<PeriodDetailDto> {
    const status = input.status ?? 'future';

    // Validate date range
    const diffMs = input.endsAt.getTime() - input.startsAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays < 7) {
      throw new UnprocessableEntityException('period.range_too_short: minimum 7 days required');
    }
    if (diffDays > 366) {
      throw new UnprocessableEntityException('period.range_too_long: maximum 366 days allowed');
    }

    // Check for overlaps with existing non-deleted periods
    const overlapping = await this.prismaService.raw.period.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        startsAt: { lt: input.endsAt },
        endsAt: { gt: input.startsAt },
      },
    });

    if (overlapping) {
      throw new ConflictException('period.overlap');
    }

    try {
      return await tenantContextStorage.run(authContext, () =>
        this.prismaService.runInTransaction(async (tx) => {
          const period = await tx.period.create({
            data: {
              organizationId,
              code: input.code,
              status,
              startsAt: input.startsAt,
              endsAt: input.endsAt,
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

          return this.toDetailDto(period);
        }),
      );
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) {
        throw new ConflictException(
          `A period with code "${input.code}" already exists for this organization, ` +
            `or another period is already open (D3-A).`,
        );
      }
      throw err;
    }
  }

  /**
   * Transitions a period from 'future' to 'open'.
   * Throws 409 if another period is already open (DB P2002 on partial unique index).
   * Throws 422 if the period is not in 'future' status.
   */
  async openPeriod(periodId: string, authContext: AuthContext): Promise<PeriodDetailDto> {
    const period = await this.prismaService.raw.period.findUnique({
      where: { id: periodId },
    });

    if (!period || period.deletedAt !== null) {
      throw new NotFoundException(`Period ${periodId} not found`);
    }

    if (period.status !== 'future') {
      throw new UnprocessableEntityException(
        `Period ${periodId} cannot be opened: current status is '${period.status}'. ` +
          `Only 'future' periods can be opened.`,
      );
    }

    try {
      return await tenantContextStorage.run(authContext, () =>
        this.prismaService.runInTransaction(async (tx) => {
          const updated = await tx.period.update({
            where: { id: periodId },
            data: { status: 'open' },
          });

          await this.auditEmitter.emit({
            action: 'period.opened',
            entityType: 'core.period',
            entityId: periodId,
            diff: {
              before: { status: 'future' },
              after: { status: 'open' },
            },
          });

          return this.toDetailDto(updated);
        }),
      );
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) {
        throw new ConflictException(
          `Cannot open period ${periodId}: another period is already open in this organization (D3-A).`,
        );
      }
      throw err;
    }
  }

  /**
   * Transitions a period from 'open' to 'closed'.
   * When reason='manual' and now < endsAt, also sets endsAt = closedAt (early close).
   * When reason='automatic', leaves endsAt as is.
   */
  async closePeriod(
    periodId: string,
    authContext: AuthContext,
    reason: 'manual' | 'automatic' = 'manual',
  ): Promise<PeriodDetailDto> {
    const period = await this.prismaService.raw.period.findUnique({
      where: { id: periodId },
    });

    if (!period || period.deletedAt !== null) {
      throw new NotFoundException(`Period ${periodId} not found`);
    }

    if (period.status !== 'open') {
      throw new UnprocessableEntityException(
        `Period ${periodId} cannot be closed: current status is '${period.status}'. ` +
          `Only 'open' periods can be closed.`,
      );
    }

    const closedAt = new Date();
    const isEarlyClose = reason === 'manual' && closedAt < period.endsAt;
    const newEndsAt = isEarlyClose
      ? new Date(Date.UTC(closedAt.getUTCFullYear(), closedAt.getUTCMonth(), closedAt.getUTCDate()))
      : period.endsAt;
    const auditAction = reason === 'automatic' ? 'period.auto_closed' : 'period.closed';
    const actorId = reason === 'automatic' ? 'system' : authContext.userId;

    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const updated = await tx.period.update({
          where: { id: periodId },
          data: {
            status: 'closed',
            closedAt,
            closedByUserId: actorId,
            ...(isEarlyClose && { endsAt: newEndsAt }),
          },
        });

        if (auditAction === 'period.auto_closed') {
          await this.auditEmitter.emit({
            action: 'period.auto_closed',
            entityType: 'core.period',
            entityId: periodId,
            diff: {
              before: { status: 'open' },
              after: {
                status: 'closed',
                closedAt: closedAt.toISOString(),
                closedByUserId: 'system',
              },
            },
          });
        } else {
          await this.auditEmitter.emit({
            action: 'period.closed',
            entityType: 'core.period',
            entityId: periodId,
            diff: {
              before: { status: 'open' },
              after: {
                status: 'closed',
                closedAt: closedAt.toISOString(),
                closedByUserId: actorId,
                ...(isEarlyClose && { endsAt: newEndsAt.toISOString() }),
              },
            },
          });
        }

        return this.toDetailDto(updated);
      }),
    );
  }

  /**
   * Soft-deletes a period and cascades deletedAt to all Objectives, KeyResults, and Tasks.
   * Admin-only. Uses a single transaction for atomicity.
   * Emits period.deleted audit event with cascade counts.
   */
  async softDeletePeriod(periodId: string, authContext: AuthContext): Promise<void> {
    if (!authContext.isSuperadmin && !authContext.permissions.includes('core:period:manage')) {
      throw new ForbiddenException('Insufficient permissions to delete a period');
    }

    const period = await this.prismaService.raw.period.findUnique({
      where: { id: periodId },
    });

    if (!period || period.deletedAt !== null) {
      throw new NotFoundException(`Period ${periodId} not found`);
    }

    const deletedAt = new Date();

    await tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        // Soft-delete the period itself
        await tx.period.update({
          where: { id: periodId },
          data: { deletedAt },
        });

        // Cascade: find affected objectives
        const affectedObjectives = await tx.objective.findMany({
          where: { periodId, deletedAt: null },
          select: { id: true },
        });
        const objectiveIds = affectedObjectives.map((o) => o.id);
        const objectivesDeleted = objectiveIds.length;

        // Soft-delete objectives
        if (objectivesDeleted > 0) {
          await tx.objective.updateMany({
            where: { periodId, deletedAt: null },
            data: { deletedAt },
          });
        }

        // Cascade: find affected key results
        let keyResultsDeleted = 0;
        const affectedKrIds: string[] = [];
        if (objectiveIds.length > 0) {
          const affectedKrs = await tx.keyResult.findMany({
            where: { objectiveId: { in: objectiveIds }, deletedAt: null },
            select: { id: true },
          });
          affectedKrIds.push(...affectedKrs.map((kr) => kr.id));
          keyResultsDeleted = affectedKrIds.length;

          if (keyResultsDeleted > 0) {
            await tx.keyResult.updateMany({
              where: { objectiveId: { in: objectiveIds }, deletedAt: null },
              data: { deletedAt },
            });
          }
        }

        // Cascade: soft-delete tasks
        let tasksDeleted = 0;
        if (affectedKrIds.length > 0) {
          const result = await tx.task.updateMany({
            where: { keyResultId: { in: affectedKrIds }, deletedAt: null },
            data: { deletedAt },
          });
          tasksDeleted = result.count;
        }

        await this.auditEmitter.emit({
          action: 'period.deleted',
          entityType: 'core.period',
          entityId: periodId,
          diff: {
            before: { deletedAt: null },
            after: {
              deletedAt: deletedAt.toISOString(),
              objectivesDeleted,
              keyResultsDeleted,
              tasksDeleted,
            },
          },
        });

        this.logger.log(
          `Period ${periodId} soft-deleted. Cascade: ${objectivesDeleted} objectives, ` +
            `${keyResultsDeleted} key results, ${tasksDeleted} tasks.`,
        );
      }),
    );
  }

  private toSummaryDto(period: {
    id: string;
    organizationId: string;
    code: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
  }): PeriodSummaryDto {
    return {
      id: period.id,
      organizationId: period.organizationId,
      code: period.code,
      status: period.status as 'open' | 'closed' | 'future',
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
    };
  }

  private toDetailDto(period: {
    id: string;
    organizationId: string;
    code: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    closedAt: Date | null;
    closedByUserId: string | null;
    deletedAt?: Date | null;
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
      deletedAt: period.deletedAt?.toISOString() ?? null,
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
