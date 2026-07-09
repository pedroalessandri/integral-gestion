import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TaskDetailDto, TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  computeKrProgress,
  computeObjectiveProgress,
  computeTaskStatus,
} from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import type { PrismaTransactionClient } from '../../audit/context/transaction-context-storage.js';
import type { CreateTaskDto } from '../dto/create-task.dto.js';
import type { UpdateTaskDto } from '../dto/update-task.dto.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';

type PeriodRow = {
  id: string;
  code: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

type TaskRow = {
  id: string;
  keyResultId: string;
  organizationId: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp: number;
  progressBp: number;
  startsAt: Date;
  endsAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Recompute KR progressCachedBp from its active tasks, then recompute the parent
 * Objective progressCachedBp from its active KRs.
 *
 * Short-circuit rule (mirrors computeKrProgress / computeObjectiveProgress):
 *  - If no active tasks → KR progress = 0.
 *  - If active tasks don't sum to 10000bp → KR progress = 0 (plan imbalanced).
 *  - Same logic for Objective from KRs.
 *
 * Must be called inside an active transaction.
 */
async function recomputeKrAndObjectiveProgress(
  tx: PrismaTransactionClient,
  keyResultId: string,
  organizationId: string,
  computeKrProgressFn: (tasks: Array<{ weightBp: number; progressBp: number }>) => number,
  computeObjectiveProgressFn: (krs: Array<{ weightBp: number; progressBp: number }>) => number,
): Promise<void> {
  const allKrTasks = await tx.task.findMany({
    where: { keyResultId, organizationId, deletedAt: null },
    select: { weightBp: true, progressBp: true },
  });

  const krTaskSum = (allKrTasks as Array<{ weightBp: number }>).reduce(
    (acc, t) => acc + t.weightBp,
    0,
  );
  let newKrProgressBp = 0;
  if (allKrTasks.length > 0 && krTaskSum === 10000) {
    newKrProgressBp = computeKrProgressFn(
      allKrTasks as Array<{ weightBp: number; progressBp: number }>,
    );
  }

  const updatedKr = await tx.keyResult.update({
    where: { id: keyResultId },
    data: { progressCachedBp: newKrProgressBp },
    select: { objectiveId: true, progressCachedBp: true },
  });

  const allObjKrs = await tx.keyResult.findMany({
    where: { objectiveId: updatedKr.objectiveId, organizationId, deletedAt: null },
    select: { weightBp: true, progressCachedBp: true },
  });

  const krSum = (allObjKrs as Array<{ weightBp: number }>).reduce(
    (acc, kr) => acc + kr.weightBp,
    0,
  );
  let newObjProgressBp = 0;
  if (allObjKrs.length > 0 && krSum === 10000) {
    newObjProgressBp = computeObjectiveProgressFn(
      (allObjKrs as Array<{ weightBp: number; progressCachedBp: number }>).map((kr) => ({
        weightBp: kr.weightBp,
        progressBp: kr.progressCachedBp,
      })),
    );
  }

  await tx.objective.update({
    where: { id: updatedKr.objectiveId },
    data: { progressCachedBp: newObjProgressBp },
  });
}

/** Validate that task dates are within the parent period's range. */
function assertTaskDatesWithinPeriod(
  startsAt: Date,
  endsAt: Date,
  period: PeriodRow,
): void {
  if (startsAt > endsAt) {
    throw new ConflictException(
      `La fecha de inicio de la tarea (${startsAt.toISOString()}) debe ser anterior o igual a la fecha de fin (${endsAt.toISOString()}).`,
    );
  }
  if (startsAt < period.startsAt) {
    throw new ConflictException(
      `La fecha de inicio de la tarea (${startsAt.toISOString().slice(0, 10)}) no puede ser anterior al inicio del período (${period.startsAt.toISOString().slice(0, 10)}).`,
    );
  }
  if (endsAt > period.endsAt) {
    throw new ConflictException(
      `La fecha de fin de la tarea (${endsAt.toISOString().slice(0, 10)}) no puede ser posterior al fin del período (${period.endsAt.toISOString().slice(0, 10)}).`,
    );
  }
}

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  async list(keyResultId: string, orgId: string): Promise<TaskSummaryDto[]> {
    const tasks = await this.prisma.scoped.task.findMany({
      where: { keyResultId, organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    return (tasks as TaskRow[]).map((t) => this.toSummaryDto(t));
  }

  async getById(id: string, orgId: string): Promise<TaskDetailDto> {
    const task = await this.prisma.scoped.task.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    return this.toDetailDto(task as TaskRow);
  }

  async create(
    keyResultId: string,
    orgId: string,
    dto: CreateTaskDto,
    authContext: AuthContext,
  ): Promise<TaskDetailDto> {
    const kr = await this.prisma.scoped.keyResult.findFirst({
      where: { id: keyResultId, organizationId: orgId, deletedAt: null },
      include: {
        objective: {
          include: {
            period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
          },
        },
      },
    });
    if (!kr) {
      throw new NotFoundException(`Key result ${keyResultId} not found`);
    }

    const period = (kr as { objective: { period: PeriodRow } }).objective.period;
    assertPeriodOpen(period as { id: string; status: 'open' | 'closed' | 'future'; code: string });

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertTaskDatesWithinPeriod(startsAt, endsAt, period);

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const siblings = await tx.task.findMany({
          where: { keyResultId, organizationId: orgId, deletedAt: null },
          select: { weightBp: true },
        });
        const currentSum = siblings.reduce((acc: number, s: { weightBp: number }) => acc + s.weightBp, 0);
        if (currentSum + dto.weightBp > 10000) {
          throw new ConflictException(
            `Agregar esta tarea haría que la suma de pesos sea ${((currentSum + dto.weightBp) / 100).toFixed(1)}%, superando el 100% permitido.`,
          );
        }

        const task = await tx.task.create({
          data: {
            keyResultId,
            organizationId: orgId,
            title: dto.title,
            description: dto.description ?? null,
            ownerUserId: dto.ownerUserId ?? null,
            weightBp: dto.weightBp,
            startsAt,
            endsAt,
          },
        });

        await this.auditEmitter.emit({
          action: 'task.created',
          entityType: 'okr.task',
          entityId: task.id,
          diff: {
            before: null,
            after: {
              keyResultId,
              title: task.title,
              description: task.description,
              ownerUserId: task.ownerUserId,
              weightBp: task.weightBp,
              progressBp: 0,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            },
          },
        });

        return this.toDetailDto(task as TaskRow);
      }),
    );
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateTaskDto,
    authContext: AuthContext,
  ): Promise<TaskDetailDto> {
    const existing = await this.prisma.scoped.task.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        keyResult: {
          include: {
            objective: {
              include: {
                period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
              },
            },
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }

    const period = (existing as { keyResult: { objective: { period: PeriodRow } } }).keyResult.objective.period;
    assertPeriodOpen(period as { id: string; status: 'open' | 'closed' | 'future'; code: string });

    const existingRow = existing as TaskRow;

    // Resolve effective dates for validation
    const newStartsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existingRow.startsAt;
    const newEndsAt = dto.endsAt !== undefined ? new Date(dto.endsAt) : existingRow.endsAt;
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      assertTaskDatesWithinPeriod(newStartsAt, newEndsAt, period);
    }

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        if (dto.weightBp !== undefined && dto.weightBp !== existingRow.weightBp) {
          const siblings = await tx.task.findMany({
            where: {
              keyResultId: existingRow.keyResultId,
              organizationId: orgId,
              deletedAt: null,
              id: { not: id },
            },
            select: { weightBp: true },
          });
          const siblingsSum = siblings.reduce((acc: number, s: { weightBp: number }) => acc + s.weightBp, 0);
          if (siblingsSum + dto.weightBp > 10000) {
            throw new ConflictException(
              `Actualizar este peso haría que la suma de pesos de las tareas sea ${((siblingsSum + dto.weightBp) / 100).toFixed(1)}%, superando el 100% permitido.`,
            );
          }
        }

        const updated = await tx.task.update({
          where: { id },
          data: {
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.ownerUserId !== undefined && { ownerUserId: dto.ownerUserId }),
            ...(dto.weightBp !== undefined && { weightBp: dto.weightBp }),
            ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
            ...(dto.endsAt !== undefined && { endsAt: new Date(dto.endsAt) }),
          },
        });

        // If weight changed, recompute KR + Objective cached progress
        if (dto.weightBp !== undefined && dto.weightBp !== existingRow.weightBp) {
          await recomputeKrAndObjectiveProgress(
            tx,
            existingRow.keyResultId,
            orgId,
            computeKrProgress,
            computeObjectiveProgress,
          );
        }

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (dto.title !== undefined) {
          before['title'] = existingRow.title;
          after['title'] = dto.title;
        }
        if (dto.description !== undefined) {
          before['description'] = existingRow.description;
          after['description'] = dto.description;
        }
        if (dto.ownerUserId !== undefined) {
          before['ownerUserId'] = existingRow.ownerUserId;
          after['ownerUserId'] = dto.ownerUserId;
        }
        if (dto.weightBp !== undefined) {
          before['weightBp'] = existingRow.weightBp;
          after['weightBp'] = dto.weightBp;
        }
        if (dto.startsAt !== undefined) {
          before['startsAt'] = existingRow.startsAt.toISOString();
          after['startsAt'] = dto.startsAt;
        }
        if (dto.endsAt !== undefined) {
          before['endsAt'] = existingRow.endsAt.toISOString();
          after['endsAt'] = dto.endsAt;
        }

        await this.auditEmitter.emit({
          action: 'task.updated',
          entityType: 'okr.task',
          entityId: id,
          diff: { before, after },
        });

        return this.toDetailDto(updated as TaskRow);
      }),
    );
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.prisma.scoped.task.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        keyResult: {
          include: {
            objective: {
              include: {
                period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
              },
            },
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    assertPeriodOpen((existing as { keyResult: { objective: { period: PeriodRow } } }).keyResult.objective.period as { id: string; status: 'open' | 'closed' | 'future'; code: string });

    const existingTask = existing as TaskRow;

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.task.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        // Recompute KR + Objective cached progress after task deletion
        await recomputeKrAndObjectiveProgress(
          tx,
          existingTask.keyResultId,
          orgId,
          computeKrProgress,
          computeObjectiveProgress,
        );

        await this.auditEmitter.emit({
          action: 'task.deleted',
          entityType: 'okr.task',
          entityId: id,
          diff: {
            before: { deletedAt: null },
            after: { deletedAt: new Date().toISOString() },
          },
        });
      }),
    );
  }

  async setProgress(
    id: string,
    orgId: string,
    progressBp: number,
    authContext: AuthContext,
  ): Promise<TaskDetailDto> {
    if (!Number.isInteger(progressBp) || progressBp < 0 || progressBp > 10000) {
      throw new UnprocessableEntityException(
        `El progreso debe ser un entero entre 0 y 10000. Se recibió ${progressBp}.`,
      );
    }

    const existing = await this.prisma.scoped.task.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        keyResult: {
          include: {
            objective: {
              include: {
                period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
              },
            },
          },
        },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    assertPeriodOpen((existing as { keyResult: { objective: { period: PeriodRow } } }).keyResult.objective.period as { id: string; status: 'open' | 'closed' | 'future'; code: string });

    const existingTask = existing as TaskRow;
    const beforeProgressBp = existingTask.progressBp;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        // Update task progress
        const updatedTask = await tx.task.update({
          where: { id },
          data: { progressBp },
        });

        // Recompute KR + Objective cached progress via shared helper
        await recomputeKrAndObjectiveProgress(
          tx,
          existingTask.keyResultId,
          orgId,
          computeKrProgress,
          computeObjectiveProgress,
        );

        await this.auditEmitter.emit({
          action: 'task.progress.updated',
          entityType: 'okr.task',
          entityId: id,
          diff: {
            before: { progressBp: beforeProgressBp },
            after: { progressBp },
          },
        });

        return this.toDetailDto(updatedTask as TaskRow);
      }),
    );
  }

  private toSummaryDto(t: TaskRow): TaskSummaryDto {
    return {
      id: t.id,
      keyResultId: t.keyResultId,
      title: t.title,
      weightBp: t.weightBp,
      progressBp: t.progressBp,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      status: computeTaskStatus(t.progressBp, t.endsAt),
      createdAt: t.createdAt.toISOString(),
    };
  }

  private toDetailDto(t: TaskRow): TaskDetailDto {
    return {
      id: t.id,
      keyResultId: t.keyResultId,
      title: t.title,
      weightBp: t.weightBp,
      progressBp: t.progressBp,
      startsAt: t.startsAt.toISOString(),
      endsAt: t.endsAt.toISOString(),
      status: computeTaskStatus(t.progressBp, t.endsAt),
      createdAt: t.createdAt.toISOString(),
      description: t.description ?? null,
      ownerUserId: t.ownerUserId ?? null,
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
