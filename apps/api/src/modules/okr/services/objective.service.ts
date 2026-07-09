import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import type {
  ObjectiveCascadeDto,
  ObjectiveDetailDto,
  ObjectiveGanttDto,
  ObjectiveSummaryDto,
  OwnerInCascadeDto,
  OwnerSummaryDto,
  PeriodStatusDto,
} from '@gestion-publica/shared-types/okr';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  computeKrProgress,
  computeObjectiveProgress,
  validateWeightSumInvariant,
  computeProgressStatus,
  computeTaskStatus,
} from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { PeriodService, MemberService } from '../../core/index.js';
import type { CreateObjectiveDto } from '../dto/create-objective.dto.js';
import type { UpdateObjectiveDto } from '../dto/update-objective.dto.js';
import type { RebalanceKrWeightsDto } from '../dto/rebalance-kr-weights.dto.js';

type ObjectiveRow = {
  id: string;
  organizationId: string;
  periodId: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  owner: { id: string; displayName: string; email: string } | null;
  progressCachedBp: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  period: { id: string; code: string; status: string; startsAt?: Date; endsAt?: Date };
  _count: { keyResults: number };
  /** Derived from KR dates — only populated in cascade DTO, null otherwise. */
  startsAt?: string | null;
  /** Derived from KR dates — only populated in cascade DTO, null otherwise. */
  endsAt?: string | null;
};

type KeyResultRow = {
  id: string;
  objectiveId: string;
  organizationId: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  owner: { id: string; displayName: string } | null;
  weightBp: number;
  progressCachedBp: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tasks: TaskRow[];
};

type TaskRow = {
  id: string;
  keyResultId: string;
  organizationId: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  owner: { id: string; displayName: string } | null;
  weightBp: number;
  progressBp: number;
  startsAt: Date;
  endsAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Prisma include for owner on Objective rows. */
const OBJECTIVE_OWNER_INCLUDE = {
  owner: { select: { id: true, displayName: true, email: true } },
} as const;

@Injectable()
export class ObjectiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periodService: PeriodService,
    private readonly auditEmitter: AuditEventEmitterService,
    private readonly memberService: MemberService,
  ) {}

  async list(orgId: string, periodId?: string): Promise<ObjectiveSummaryDto[]> {
    const objectives = await this.prisma.scoped.objective.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(periodId && { periodId }),
      },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        _count: { select: { keyResults: { where: { deletedAt: null } } } },
        ...OBJECTIVE_OWNER_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
    });

    return (objectives as ObjectiveRow[]).map((o) => this.toSummaryDto(o));
  }

  async getById(id: string, orgId: string): Promise<ObjectiveDetailDto> {
    const objective = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        _count: { select: { keyResults: { where: { deletedAt: null } } } },
        ...OBJECTIVE_OWNER_INCLUDE,
      },
    });

    if (!objective) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    return this.toDetailDto(objective as ObjectiveRow);
  }

  async create(
    orgId: string,
    dto: CreateObjectiveDto,
    authContext: AuthContext,
  ): Promise<ObjectiveDetailDto> {
    const period = await this.periodService.getCurrentOpenPeriod(orgId);
    if (!period) {
      throw new UnprocessableEntityException(
        'No hay un período abierto para esta organización. Abrí un período antes de crear objetivos.',
      );
    }

    // Resolve ownerUserId: use dto value if provided, otherwise default to the requesting user.
    const resolvedOwnerUserId = dto.ownerUserId !== undefined ? dto.ownerUserId : authContext.userId;

    // Validate membership when an explicit owner is provided.
    if (resolvedOwnerUserId !== null && resolvedOwnerUserId !== undefined) {
      const isMember = await this.memberService.isMemberOf(orgId, resolvedOwnerUserId);
      if (!isMember) {
        throw new UnprocessableEntityException(
          `OwnerNotMember: User "${resolvedOwnerUserId}" is not a member of organization "${orgId}".`,
        );
      }
    }

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const objective = await tx.objective.create({
          data: {
            organizationId: orgId,
            periodId: period.id,
            title: dto.title,
            description: dto.description ?? null,
            ownerUserId: resolvedOwnerUserId ?? null,
          },
          include: {
            period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
            _count: { select: { keyResults: { where: { deletedAt: null } } } },
            ...OBJECTIVE_OWNER_INCLUDE,
          },
        });

        await this.auditEmitter.emit({
          action: 'objective.created',
          entityType: 'okr.objective',
          entityId: objective.id,
          diff: {
            before: null,
            after: {
              title: objective.title,
              description: objective.description,
              periodId: objective.periodId,
              ownerUserId: objective.ownerUserId,
            },
          },
        });

        return this.toDetailDto(objective as ObjectiveRow);
      }),
    );
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateObjectiveDto,
    authContext: AuthContext,
  ): Promise<ObjectiveDetailDto> {
    const existing = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        ...OBJECTIVE_OWNER_INCLUDE,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    assertPeriodOpen((existing as { period: { id: string; status: 'open' | 'closed' | 'future'; code: string } }).period);

    // Validate new owner membership before entering the transaction.
    if (dto.ownerUserId !== undefined && dto.ownerUserId !== null) {
      const isMember = await this.memberService.isMemberOf(orgId, dto.ownerUserId);
      if (!isMember) {
        throw new UnprocessableEntityException(
          `OwnerNotMember: User "${dto.ownerUserId}" is not a member of organization "${orgId}".`,
        );
      }
    }

    const existingRow = existing as ObjectiveRow;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const updated = await tx.objective.update({
          where: { id },
          data: {
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.ownerUserId !== undefined && { ownerUserId: dto.ownerUserId }),
          },
          include: {
            period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
            _count: { select: { keyResults: { where: { deletedAt: null } } } },
            ...OBJECTIVE_OWNER_INCLUDE,
          },
        });

        // ── Owner-specific audit event ────────────────────────────────────────
        if (dto.ownerUserId !== undefined) {
          const beforeOwnerId = existingRow.ownerUserId;
          const afterOwnerId = dto.ownerUserId;

          // Only emit when owner actually changed.
          if (beforeOwnerId !== afterOwnerId) {
            if (beforeOwnerId === null && afterOwnerId !== null) {
              await this.auditEmitter.emit({
                action: 'objective.owner_assigned',
                entityType: 'okr.objective',
                entityId: id,
                diff: { before: { ownerUserId: null }, after: { ownerUserId: afterOwnerId } },
              });
            } else if (beforeOwnerId !== null && afterOwnerId === null) {
              await this.auditEmitter.emit({
                action: 'objective.owner_unassigned',
                entityType: 'okr.objective',
                entityId: id,
                diff: { before: { ownerUserId: beforeOwnerId }, after: { ownerUserId: null } },
              });
            } else if (beforeOwnerId !== null && afterOwnerId !== null) {
              await this.auditEmitter.emit({
                action: 'objective.owner_changed',
                entityType: 'okr.objective',
                entityId: id,
                diff: { before: { ownerUserId: beforeOwnerId }, after: { ownerUserId: afterOwnerId } },
              });
            }
          }
        }

        // ── Generic updated event (title/description changes) ─────────────────
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (dto.title !== undefined) {
          before['title'] = existing.title;
          after['title'] = dto.title;
        }
        if (dto.description !== undefined) {
          before['description'] = existing.description;
          after['description'] = dto.description;
        }

        if (Object.keys(after).length > 0) {
          await this.auditEmitter.emit({
            action: 'objective.updated',
            entityType: 'okr.objective',
            entityId: id,
            diff: { before, after },
          });
        }

        return this.toDetailDto(updated as ObjectiveRow);
      }),
    );
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        _count: { select: { keyResults: { where: { deletedAt: null } } } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    assertPeriodOpen((existing as { period: { id: string; status: 'open' | 'closed' | 'future'; code: string } }).period);

    const count = (existing as { _count: { keyResults: number } })._count.keyResults;
    if (count > 0) {
      throw new ConflictException(
        `No se puede eliminar el objetivo: tiene ${count} Key Result(s) activo(s). Eliminalos primero.`,
      );
    }

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.objective.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        await this.auditEmitter.emit({
          action: 'objective.deleted',
          entityType: 'okr.objective',
          entityId: id,
          diff: {
            before: { deletedAt: null },
            after: { deletedAt: new Date().toISOString() },
          },
        });
      }),
    );
  }

  async getCascade(id: string, orgId: string): Promise<ObjectiveCascadeDto> {
    const objective = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        _count: { select: { keyResults: { where: { deletedAt: null } } } },
        ...OBJECTIVE_OWNER_INCLUDE,
        keyResults: {
          where: { deletedAt: null },
          include: {
            owner: { select: { id: true, displayName: true } },
            tasks: {
              where: { deletedAt: null },
              include: {
                owner: { select: { id: true, displayName: true } },
              },
            },
          },
        },
      },
    });

    if (!objective) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    const obj = objective as ObjectiveRow & { keyResults: KeyResultRow[] };
    return this.buildCascadeDto(obj);
  }

  async listGantt(orgId: string, periodId: string): Promise<ObjectiveGanttDto[]> {
    const objectives = await this.prisma.scoped.objective.findMany({
      where: { organizationId: orgId, periodId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        keyResults: {
          where: { deletedAt: null },
          include: {
            tasks: { where: { deletedAt: null } },
          },
        },
      },
    });

    return (objectives as Array<ObjectiveRow & { keyResults: Array<KeyResultRow & { tasks: TaskRow[] }> }>).map(
      (obj) => {
        const keyResults = obj.keyResults.map((kr) => {
          // Derive KR-level dates from tasks
          let krStartsAt: string | null = null;
          let krEndsAt: string | null = null;
          if (kr.tasks.length > 0) {
            const minStartMs = Math.min(...kr.tasks.map((t) => t.startsAt.getTime()));
            const maxEndMs = Math.max(...kr.tasks.map((t) => t.endsAt.getTime()));
            krStartsAt = new Date(minStartMs).toISOString();
            krEndsAt = new Date(maxEndMs).toISOString();
          }

          const tasks = kr.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: computeTaskStatus(t.progressBp, t.endsAt),
            progressBp: t.progressBp,
            startsAt: t.startsAt.toISOString(),
            endsAt: t.endsAt.toISOString(),
          }));

          return {
            id: kr.id,
            title: kr.title,
            status: computeProgressStatus(kr.progressCachedBp),
            progressCachedBp: kr.progressCachedBp,
            startsAt: krStartsAt,
            endsAt: krEndsAt,
            tasks,
          };
        });

        // Derive Objective-level dates from KRs that have dates
        const krsWithDates = keyResults.filter(
          (kr) => kr.startsAt !== null && kr.endsAt !== null,
        );
        let objectiveStartsAt: string | null = null;
        let objectiveEndsAt: string | null = null;
        if (krsWithDates.length > 0) {
          const minStartMs = Math.min(
            ...krsWithDates.map((kr) => new Date(kr.startsAt as string).getTime()),
          );
          const maxEndMs = Math.max(
            ...krsWithDates.map((kr) => new Date(kr.endsAt as string).getTime()),
          );
          objectiveStartsAt = new Date(minStartMs).toISOString();
          objectiveEndsAt = new Date(maxEndMs).toISOString();
        }

        return {
          id: obj.id,
          title: obj.title,
          status: computeProgressStatus(obj.progressCachedBp),
          progressCachedBp: obj.progressCachedBp,
          startsAt: objectiveStartsAt,
          endsAt: objectiveEndsAt,
          keyResults,
        };
      },
    );
  }

  async rebalanceKrWeights(
    id: string,
    orgId: string,
    dto: RebalanceKrWeightsDto,
    authContext: AuthContext,
  ): Promise<ObjectiveCascadeDto> {
    const validation = validateWeightSumInvariant(
      dto.items.map((i) => ({ weightBp: i.weightBp })),
    );
    if (!validation.ok) {
      throw new ConflictException(
        `Los pesos deben sumar exactamente 100%. Se recibió ${(validation.actual / 100).toFixed(1)}%.`,
      );
    }

    const existing = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        keyResults: { where: { deletedAt: null }, select: { id: true, weightBp: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    assertPeriodOpen((existing as { period: { id: string; status: 'open' | 'closed' | 'future'; code: string } }).period);

    const activeKrIds = new Set(
      (existing as { keyResults: Array<{ id: string }> }).keyResults.map((kr) => kr.id),
    );
    for (const item of dto.items) {
      if (!activeKrIds.has(item.krId)) {
        throw new ConflictException(
          `El Key Result ${item.krId} no es un KR activo del objetivo ${id}.`,
        );
      }
    }
    if (dto.items.length !== activeKrIds.size) {
      throw new ConflictException(
        `El rebalanceo debe incluir TODOS los KRs activos. Se esperaban ${activeKrIds.size} ítems, se recibieron ${dto.items.length}.`,
      );
    }

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const beforeWeights: Record<string, number> = {};

        for (const item of dto.items) {
          const kr = (existing as { keyResults: Array<{ id: string; weightBp: number }> }).keyResults.find(
            (k) => k.id === item.krId,
          );
          if (kr) beforeWeights[item.krId] = kr.weightBp;

          await tx.keyResult.update({
            where: { id: item.krId },
            data: { weightBp: item.weightBp },
          });
        }

        await this.auditEmitter.emit({
          action: 'objective.rebalanced',
          entityType: 'okr.objective',
          entityId: id,
          diff: {
            before: {
              weights: dto.items.map((item) => ({
                krId: item.krId,
                weightBp: beforeWeights[item.krId] ?? item.weightBp,
              })),
            },
            after: {
              weights: dto.items.map((item) => ({
                krId: item.krId,
                weightBp: item.weightBp,
              })),
            },
          },
        });

        // Return fresh cascade after rebalance
        const updated = await tx.objective.findUnique({
          where: { id },
          include: {
            period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
            _count: { select: { keyResults: { where: { deletedAt: null } } } },
            ...OBJECTIVE_OWNER_INCLUDE,
            keyResults: {
              where: { deletedAt: null },
              include: {
                owner: { select: { id: true, displayName: true } },
                tasks: {
                  where: { deletedAt: null },
                  include: {
                    owner: { select: { id: true, displayName: true } },
                  },
                },
              },
            },
          },
        });

        if (!updated) {
          throw new NotFoundException(`Objective ${id} not found after rebalance`);
        }

        return this.buildCascadeDto(updated as ObjectiveRow & { keyResults: KeyResultRow[] });
      }),
    );
  }

  private toOwnerDto(
    owner: { id: string; displayName: string } | null,
  ): OwnerInCascadeDto | null {
    if (!owner) return null;
    return { id: owner.id, displayName: owner.displayName };
  }

  private toOwnerSummaryDto(
    owner: { id: string; displayName: string; email: string } | null,
  ): OwnerSummaryDto | null {
    if (!owner) return null;
    return { id: owner.id, displayName: owner.displayName, email: owner.email };
  }

  private buildCascadeDto(
    obj: ObjectiveRow & { keyResults: KeyResultRow[] },
  ): ObjectiveCascadeDto {
    const keyResultsWithProgress = obj.keyResults.map((kr) => {
      const activeTasks = kr.tasks.filter((t) => t.deletedAt === null);
      const taskSum = activeTasks.reduce((acc, t) => acc + t.weightBp, 0);
      const tasksBalanced = activeTasks.length > 0 && taskSum === 10000;
      const tasksImbalanced = activeTasks.length > 0 && !tasksBalanced;
      let krProgressBp: number;

      if (activeTasks.length === 0) {
        krProgressBp = 0;
      } else {
        if (tasksBalanced) {
          krProgressBp = computeKrProgress(
            activeTasks.map((t) => ({ weightBp: t.weightBp, progressBp: t.progressBp })),
          );
        } else {
          // Weights don't sum to 10000 — use cached value (plan incomplete)
          krProgressBp = kr.progressCachedBp;
        }
      }

      // Derived dates from tasks
      let krStartsAt: string | null = null;
      let krEndsAt: string | null = null;
      if (activeTasks.length > 0) {
        const minStartMs = Math.min(...activeTasks.map((t) => t.startsAt.getTime()));
        const maxEndMs = Math.max(...activeTasks.map((t) => t.endsAt.getTime()));
        krStartsAt = new Date(minStartMs).toISOString();
        krEndsAt = new Date(maxEndMs).toISOString();
      }

      return {
        id: kr.id,
        title: kr.title,
        description: kr.description,
        weightBp: kr.weightBp,
        progressCachedBp: krProgressBp,
        status: computeProgressStatus(krProgressBp),
        hasActiveTasks: activeTasks.length > 0,
        owner: this.toOwnerDto(kr.owner),
        startsAt: krStartsAt,
        endsAt: krEndsAt,
        tasksImbalanced,
        tasks: activeTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          weightBp: t.weightBp,
          progressBp: t.progressBp,
          startsAt: t.startsAt.toISOString(),
          endsAt: t.endsAt.toISOString(),
          status: computeTaskStatus(t.progressBp, t.endsAt),
          owner: this.toOwnerDto(t.owner),
        })),
      };
    });

    const activeKrs = obj.keyResults.filter((kr) => kr.deletedAt === null);
    let objectiveProgressBp: number;

    if (activeKrs.length === 0) {
      objectiveProgressBp = 0;
    } else {
      const krSum = activeKrs.reduce((acc, kr) => acc + kr.weightBp, 0);
      if (krSum === 10000) {
        objectiveProgressBp = computeObjectiveProgress(
          keyResultsWithProgress.map((kr) => ({
            weightBp: kr.weightBp,
            progressBp: kr.progressCachedBp,
          })),
        );
      } else {
        objectiveProgressBp = obj.progressCachedBp;
      }
    }

    const planIncomplete =
      activeKrs.length === 0 ||
      keyResultsWithProgress.some((kr) => !kr.hasActiveTasks);

    const imbalancedKrCount = keyResultsWithProgress.filter((kr) => kr.tasksImbalanced).length;

    // Derive Objective-level dates from KR dates
    const krsWithDates = keyResultsWithProgress.filter(
      (kr) => kr.startsAt !== null && kr.endsAt !== null,
    );
    let objectiveStartsAt: string | null = null;
    let objectiveEndsAt: string | null = null;
    if (krsWithDates.length > 0) {
      const minStartMs = Math.min(
        ...krsWithDates.map((kr) => new Date(kr.startsAt as string).getTime()),
      );
      const maxEndMs = Math.max(
        ...krsWithDates.map((kr) => new Date(kr.endsAt as string).getTime()),
      );
      objectiveStartsAt = new Date(minStartMs).toISOString();
      objectiveEndsAt = new Date(maxEndMs).toISOString();
    }

    const objectiveWithProgress = {
      ...obj,
      progressCachedBp: objectiveProgressBp,
      startsAt: objectiveStartsAt,
      endsAt: objectiveEndsAt,
    };

    return {
      objective: this.toDetailDto(objectiveWithProgress),
      keyResults: keyResultsWithProgress,
      planIncomplete,
      imbalancedKrCount,
    };
  }

  private toSummaryDto(o: ObjectiveRow): ObjectiveSummaryDto {
    return {
      id: o.id,
      title: o.title,
      periodCode: o.period.code,
      progressCachedBp: o.progressCachedBp,
      status: computeProgressStatus(o.progressCachedBp),
      hasActiveKeyResults: o._count.keyResults > 0,
      createdAt: o.createdAt.toISOString(),
      period: {
        id: o.period.id,
        code: o.period.code,
        status: o.period.status as PeriodStatusDto['status'],
        startsAt: o.period.startsAt?.toISOString(),
        endsAt: o.period.endsAt?.toISOString(),
      },
      startsAt: o.startsAt ?? null,
      endsAt: o.endsAt ?? null,
      owner: this.toOwnerSummaryDto(o.owner),
    };
  }

  private toDetailDto(o: ObjectiveRow): ObjectiveDetailDto {
    return {
      id: o.id,
      title: o.title,
      periodCode: o.period.code,
      progressCachedBp: o.progressCachedBp,
      status: computeProgressStatus(o.progressCachedBp),
      hasActiveKeyResults: o._count.keyResults > 0,
      createdAt: o.createdAt.toISOString(),
      description: o.description,
      organizationId: o.organizationId,
      periodId: o.periodId,
      updatedAt: o.updatedAt.toISOString(),
      period: {
        id: o.period.id,
        code: o.period.code,
        status: o.period.status as PeriodStatusDto['status'],
        startsAt: o.period.startsAt?.toISOString(),
        endsAt: o.period.endsAt?.toISOString(),
      },
      startsAt: o.startsAt ?? null,
      endsAt: o.endsAt ?? null,
      owner: this.toOwnerSummaryDto(o.owner),
    };
  }
}
