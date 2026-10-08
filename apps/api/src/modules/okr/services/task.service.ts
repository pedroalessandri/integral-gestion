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
  computeExecutionProgress,
  computeProjectProgress,
  computeTaskStatus,
  projectSumAfterDelete,
  weightMode,
} from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import type { CreateTaskDto } from '../dto/create-task.dto.js';
import type { UpdateTaskDto } from '../dto/update-task.dto.js';
import type { CreateProjectTaskDto } from '../dto/create-project-task.dto.js';
import type { SetSiblingWeightsDto } from '../dto/set-sibling-weights.dto.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import { recomputeKrAndObjectiveProgress } from './recompute.js';
import { lockProject, recomputeProjectAndObjectiveExecution } from './project-recompute.js';
import { assertSameSiblingSet, assertValidWeightGroup } from './weight-group.js';

type PeriodRow = {
  id: string;
  code: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

type PeriodRef = { id: string; status: 'open' | 'closed' | 'future'; code: string };

type TaskRow = {
  id: string;
  keyResultId: string | null;
  projectId: string | null;
  organizationId: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp: number | null;
  progressBp: number;
  startsAt: Date;
  endsAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectParentRow = {
  id: string;
  objectiveId: string;
  progressMode: string;
  startsAt: Date;
  endsAt: Date;
  objective: { period: PeriodRow };
};

type TaskWithParent = TaskRow & {
  keyResult: { objective: { period: PeriodRow } } | null;
  project: ProjectParentRow | null;
};

const PERIOD_SELECT = { id: true, code: true, status: true, startsAt: true, endsAt: true } as const;
const OBJECTIVE_PERIOD_INCLUDE = { objective: { include: { period: { select: PERIOD_SELECT } } } } as const;
/** Padre de una tarea: KR legacy o proyecto (exactamente uno, CHECK chk_task_parent_xor). */
const TASK_PARENT_INCLUDE = {
  keyResult: { include: OBJECTIVE_PERIOD_INCLUDE },
  project: { include: OBJECTIVE_PERIOD_INCLUDE },
} as const;

/** Validate that task dates are within the parent period's range (camino KR legacy). */
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

/** RN-P5: las fechas de una tarea caen dentro de las de su proyecto (inclusive). */
function assertTaskDatesWithinProject(
  startsAt: Date,
  endsAt: Date,
  project: { startsAt: Date; endsAt: Date },
): void {
  if (startsAt > endsAt) {
    throw new UnprocessableEntityException(
      `TaskDatesInvalid: la fecha de inicio de la tarea (${startsAt.toISOString()}) debe ser anterior o igual a la de fin (${endsAt.toISOString()}).`,
    );
  }
  if (startsAt < project.startsAt || endsAt > project.endsAt) {
    throw new UnprocessableEntityException(
      `TaskOutsideProject: las fechas de la tarea (${startsAt.toISOString().slice(0, 10)} a ${endsAt.toISOString().slice(0, 10)}) deben caer dentro de las del proyecto (${project.startsAt.toISOString().slice(0, 10)} a ${project.endsAt.toISOString().slice(0, 10)}) (RN-P5).`,
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

  async listByProject(projectId: string, orgId: string): Promise<TaskSummaryDto[]> {
    await this.findProjectOrThrow(projectId, orgId);
    const tasks = await this.prisma.scoped.task.findMany({
      where: { projectId, organizationId: orgId, deletedAt: null },
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
            period: { select: PERIOD_SELECT },
          },
        },
      },
    });
    if (!kr) {
      throw new NotFoundException(`Key result ${keyResultId} not found`);
    }

    const period = (kr as { objective: { period: PeriodRow } }).objective.period;
    assertPeriodOpen(period as PeriodRef);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertTaskDatesWithinPeriod(startsAt, endsAt, period);

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const siblings = await tx.task.findMany({
          where: { keyResultId, organizationId: orgId, deletedAt: null },
          select: { weightBp: true },
        });
        const currentSum = siblings.reduce((acc: number, s: { weightBp: number | null }) => acc + (s.weightBp ?? 0), 0);
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

  /**
   * Crea una tarea bajo un proyecto (RN-P5, RN-P6). Las fechas caen dentro del proyecto y el peso es
   * opcional y todo-o-nada con las demás tareas del proyecto (se valida el grupo resultante).
   */
  async createInProject(
    projectId: string,
    orgId: string,
    dto: CreateProjectTaskDto,
    authContext: AuthContext,
  ): Promise<TaskDetailDto> {
    const project = await this.findProjectOrThrow(projectId, orgId);
    assertPeriodOpen(project.objective.period as PeriodRef);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertTaskDatesWithinProject(startsAt, endsAt, project);
    const weightBp = dto.weightBp ?? null;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await lockProject(tx, projectId, orgId);
        const siblings = await tx.task.findMany({
          where: { projectId, organizationId: orgId, deletedAt: null },
          select: { weightBp: true },
        });
        assertValidWeightGroup([...siblings, { weightBp }], 'tareas');

        const task = await tx.task.create({
          data: {
            projectId,
            organizationId: orgId,
            title: dto.title,
            description: dto.description ?? null,
            ownerUserId: dto.ownerUserId ?? null,
            weightBp,
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
              projectId,
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

        await this.recomputeProject(tx, projectId, orgId);
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
    const existing = await this.findTaskWithParentOrThrow(id, orgId);
    const existingRow = existing as TaskRow;
    const project = existing.project;
    const period = (project ? project.objective.period : existing.keyResult?.objective.period) as PeriodRow;
    assertPeriodOpen(period as PeriodRef);

    // Resolve effective dates for validation
    const newStartsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existingRow.startsAt;
    const newEndsAt = dto.endsAt !== undefined ? new Date(dto.endsAt) : existingRow.endsAt;
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      if (project) assertTaskDatesWithinProject(newStartsAt, newEndsAt, project);
      else assertTaskDatesWithinPeriod(newStartsAt, newEndsAt, period);
    }

    // El camino KR legacy siempre exige peso (CHECK chk_task_kr_weight).
    if (!project && dto.weightBp === null) {
      throw new UnprocessableEntityException(
        'KrTaskWeightRequired: las tareas de un Key Result siempre llevan peso.',
      );
    }
    const weightChanged = dto.weightBp !== undefined && dto.weightBp !== existingRow.weightBp;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        if (project) await lockProject(tx, project.id, orgId);

        if (weightChanged && dto.weightBp !== undefined) {
          const siblings = await tx.task.findMany({
            where: project
              ? { projectId: project.id, organizationId: orgId, deletedAt: null, id: { not: id } }
              : { keyResultId: existingRow.keyResultId, organizationId: orgId, deletedAt: null, id: { not: id } },
            select: { weightBp: true },
          });
          if (project) {
            // RN-P6: se valida el grupo resultante (todo-o-nada, suma 10000).
            assertValidWeightGroup([...siblings, { weightBp: dto.weightBp }], 'tareas');
          } else {
            const siblingsSum = siblings.reduce((acc: number, s: { weightBp: number | null }) => acc + (s.weightBp ?? 0), 0);
            if (siblingsSum + (dto.weightBp ?? 0) > 10000) {
              throw new ConflictException(
                `Actualizar este peso haría que la suma de pesos de las tareas sea ${((siblingsSum + (dto.weightBp ?? 0)) / 100).toFixed(1)}%, superando el 100% permitido.`,
              );
            }
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

        // If weight changed, recompute the cached progress up the branch (KR path or project path).
        if (weightChanged) {
          if (project) {
            await this.recomputeProject(tx, project.id, orgId);
          } else if (existingRow.keyResultId) {
            await recomputeKrAndObjectiveProgress(
              tx,
              existingRow.keyResultId,
              orgId,
              computeKrProgress,
              computeObjectiveProgress,
            );
          }
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

  /**
   * Reemplaza de forma atómica los pesos de TODAS las tareas vivas de un proyecto (RN-P6/RN-P7):
   * o todas con peso y suman 10000, o todas `null` (promedio simple). Es la única forma de pasar un
   * grupo de "sin pesos" a "con pesos" sin dejarlo mixto en el medio.
   */
  async setProjectTaskWeights(
    projectId: string,
    orgId: string,
    dto: SetSiblingWeightsDto,
    authContext: AuthContext,
  ): Promise<TaskSummaryDto[]> {
    const project = await this.findProjectOrThrow(projectId, orgId);
    assertPeriodOpen(project.objective.period as PeriodRef);

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await lockProject(tx, projectId, orgId);
        const live = (await tx.task.findMany({
          where: { projectId, organizationId: orgId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        })) as TaskRow[];
        assertSameSiblingSet(
          live.map((t) => t.id),
          dto.weights.map((w) => w.id),
        );
        assertValidWeightGroup(dto.weights, 'tareas');

        const result: TaskRow[] = [];
        for (const task of live) {
          const requested = dto.weights.find((w) => w.id === task.id)?.weightBp ?? null;
          if (requested === task.weightBp) {
            result.push(task);
            continue;
          }
          const updated = (await tx.task.update({ where: { id: task.id }, data: { weightBp: requested } })) as TaskRow;
          await this.auditEmitter.emit({
            action: 'task.updated',
            entityType: 'okr.task',
            entityId: task.id,
            diff: { before: { weightBp: task.weightBp }, after: { weightBp: requested } },
          });
          result.push(updated);
        }

        await this.recomputeProject(tx, projectId, orgId);
        return result.map((t) => this.toSummaryDto(t));
      }),
    );
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.findTaskWithParentOrThrow(id, orgId);
    const project = existing.project;
    assertPeriodOpen(
      (project ? project.objective.period : existing.keyResult?.objective.period) as PeriodRef,
    );

    const existingTask = existing as TaskRow;

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        if (project) {
          await lockProject(tx, project.id, orgId);
          // RN-P6 / RN-25: no se puede dejar un grupo ponderado con suma != 10000.
          const siblings = await tx.task.findMany({
            where: { projectId: project.id, organizationId: orgId, deletedAt: null },
            select: { id: true, weightBp: true },
          });
          if (weightMode(siblings) === 'weighted' && siblings.length > 1) {
            const remaining = projectSumAfterDelete(siblings, id);
            if (remaining !== 10000) {
              throw new UnprocessableEntityException(
                `WeightSumInvalid: borrar esta tarea dejaría los pesos de las tareas en ${remaining} bp (deben sumar 10000). Redistribuí los pesos primero (RN-P6).`,
              );
            }
          }
        }

        await tx.task.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        // Recompute cached progress after task deletion (project path or KR path).
        if (project) {
          await this.recomputeProject(tx, project.id, orgId);
        } else if (existingTask.keyResultId) {
          await recomputeKrAndObjectiveProgress(
            tx,
            existingTask.keyResultId,
            orgId,
            computeKrProgress,
            computeObjectiveProgress,
          );
        }

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

    const existing = await this.findTaskWithParentOrThrow(id, orgId);
    const project = existing.project;
    assertPeriodOpen(
      (project ? project.objective.period : existing.keyResult?.objective.period) as PeriodRef,
    );

    const existingTask = existing as TaskRow;
    const beforeProgressBp = existingTask.progressBp;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        if (project) await lockProject(tx, project.id, orgId);

        // Update task progress
        const updatedTask = await tx.task.update({
          where: { id },
          data: { progressBp },
        });

        // Recompute cached progress via the shared helper of each branch
        if (project) {
          await this.recomputeProject(tx, project.id, orgId);
        } else if (existingTask.keyResultId) {
          await recomputeKrAndObjectiveProgress(
            tx,
            existingTask.keyResultId,
            orgId,
            computeKrProgress,
            computeObjectiveProgress,
          );
        }

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

  /** Tarea viva de la org con su padre (KR o proyecto) y el período del objetivo. */
  private async findTaskWithParentOrThrow(id: string, orgId: string): Promise<TaskWithParent> {
    const existing = await this.prisma.scoped.task.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: TASK_PARENT_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    return existing as TaskWithParent;
  }

  private async findProjectOrThrow(projectId: string, orgId: string): Promise<ProjectParentRow> {
    const project = await this.prisma.scoped.project.findFirst({
      where: { id: projectId, organizationId: orgId, deletedAt: null },
      include: OBJECTIVE_PERIOD_INCLUDE,
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
    return project as ProjectParentRow;
  }

  /** Tarea -> proyecto -> avance de gestión del objetivo, en la transacción activa. */
  private async recomputeProject(
    tx: Parameters<typeof lockProject>[0],
    projectId: string,
    orgId: string,
  ): Promise<void> {
    await recomputeProjectAndObjectiveExecution(
      tx,
      projectId,
      orgId,
      computeProjectProgress,
      computeExecutionProgress,
    );
  }

  private toSummaryDto(t: TaskRow): TaskSummaryDto {
    return {
      id: t.id,
      keyResultId: t.keyResultId,
      projectId: t.projectId,
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
      ...this.toSummaryDto(t),
      description: t.description ?? null,
      ownerUserId: t.ownerUserId ?? null,
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
