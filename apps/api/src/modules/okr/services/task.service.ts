import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TaskDetailDto, TaskSummaryDto } from '@gestion-publica/shared-types/okr';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  computeExecutionProgress,
  computeProjectProgress,
  computeTaskStatus,
  projectSumAfterDelete,
  weightMode,
} from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import type { UpdateTaskDto } from '../dto/update-task.dto.js';
import type { CreateProjectTaskDto } from '../dto/create-project-task.dto.js';
import type { SetSiblingWeightsDto } from '../dto/set-sibling-weights.dto.js';
import { ORG_UNIT_SCOPE, type OrgUnitScope } from '../../../common/contracts/index.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import { lockProject, recomputeProjectAndObjectiveExecution } from './project-recompute.js';
import { ProjectLifecyclePublisher, type ProjectProgressTransition } from './project-lifecycle-publisher.js';
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
  projectId: string;
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
  orgUnitId: string;
  progressMode: string;
  startsAt: Date;
  endsAt: Date;
  objective: { period: PeriodRow; orgUnitId: string };
};

type TaskWithParent = TaskRow & {
  project: ProjectParentRow;
};

const PERIOD_SELECT = { id: true, code: true, status: true, startsAt: true, endsAt: true } as const;
const OBJECTIVE_PERIOD_INCLUDE = { objective: { include: { period: { select: PERIOD_SELECT } } } } as const;
/** Padre de una tarea: su proyecto (N5). */
const TASK_PARENT_INCLUDE = {
  project: { include: OBJECTIVE_PERIOD_INCLUDE },
} as const;

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
    private readonly lifecycle: ProjectLifecyclePublisher,
    @Inject(ORG_UNIT_SCOPE) private readonly orgUnitScope: OrgUnitScope,
  ) {}

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
    await this.orgUnitScope.assertCanWriteInUnit(authContext, project.orgUnitId);
    assertPeriodOpen(project.objective.period as PeriodRef);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertTaskDatesWithinProject(startsAt, endsAt, project);
    const weightBp = dto.weightBp ?? null;

    return this.runWithTransitions(orgId, authContext, async (tx, transitions) => {
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

      await this.recomputeProject(tx, projectId, orgId, transitions);
      return this.toDetailDto(task as TaskRow);
    });
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateTaskDto,
    authContext: AuthContext,
  ): Promise<TaskDetailDto> {
    const existing = await this.findTaskWithParentOrThrow(id, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, this.taskUnitId(existing));
    const existingRow = existing as TaskRow;
    const project = existing.project;
    assertPeriodOpen(project.objective.period as PeriodRef);

    // Resolve effective dates for validation
    const newStartsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existingRow.startsAt;
    const newEndsAt = dto.endsAt !== undefined ? new Date(dto.endsAt) : existingRow.endsAt;
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      assertTaskDatesWithinProject(newStartsAt, newEndsAt, project);
    }
    const weightChanged = dto.weightBp !== undefined && dto.weightBp !== existingRow.weightBp;

    return this.runWithTransitions(orgId, authContext, async (tx, transitions) => {
      await lockProject(tx, project.id, orgId);

      if (weightChanged && dto.weightBp !== undefined) {
        const siblings = await tx.task.findMany({
          where: { projectId: project.id, organizationId: orgId, deletedAt: null, id: { not: id } },
          select: { weightBp: true },
        });
        // RN-P6: se valida el grupo resultante (todo-o-nada, suma 10000).
        assertValidWeightGroup([...siblings, { weightBp: dto.weightBp }], 'tareas');
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

      if (weightChanged) {
        await this.recomputeProject(tx, project.id, orgId, transitions);
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
    });
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
    await this.orgUnitScope.assertCanWriteInUnit(authContext, project.orgUnitId);
    assertPeriodOpen(project.objective.period as PeriodRef);

    return this.runWithTransitions(orgId, authContext, async (tx, transitions) => {
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

      await this.recomputeProject(tx, projectId, orgId, transitions);
      return result.map((t) => this.toSummaryDto(t));
    });
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.findTaskWithParentOrThrow(id, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, this.taskUnitId(existing));
    const project = existing.project;
    assertPeriodOpen(project.objective.period as PeriodRef);

    await this.runWithTransitions(orgId, authContext, async (tx, transitions) => {
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

      await tx.task.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await this.recomputeProject(tx, project.id, orgId, transitions);

      await this.auditEmitter.emit({
        action: 'task.deleted',
        entityType: 'okr.task',
        entityId: id,
        diff: {
          before: { deletedAt: null },
          after: { deletedAt: new Date().toISOString() },
        },
      });
    });
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
    await this.orgUnitScope.assertCanWriteInUnit(authContext, this.taskUnitId(existing));
    const project = existing.project;
    assertPeriodOpen(project.objective.period as PeriodRef);

    const existingTask = existing as TaskRow;
    const beforeProgressBp = existingTask.progressBp;

    return this.runWithTransitions(orgId, authContext, async (tx, transitions) => {
      await lockProject(tx, project.id, orgId);

      // Update task progress
      const updatedTask = await tx.task.update({
        where: { id },
        data: { progressBp },
      });

      await this.recomputeProject(tx, project.id, orgId, transitions);

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
    });
  }

  /** RN-P20: la unidad efectiva de una tarea es la de su proyecto (`Project.orgUnitId`). */
  private taskUnitId(existing: TaskWithParent): string {
    return existing.project.orgUnitId;
  }

  /** Tarea viva de la org con su proyecto y el período del objetivo. */
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

  /**
   * Corre `fn` en una transacción con el contexto de tenant y, DESPUÉS del commit, publica los eventos de proyecto
   * (`project.completed` / `project.reopened`, ADR-0009 D5) de las transiciones de avance que juntó `fn`.
   */
  private async runWithTransitions<T>(
    orgId: string,
    authContext: AuthContext,
    fn: (tx: Parameters<typeof lockProject>[0], transitions: ProjectProgressTransition[]) => Promise<T>,
  ): Promise<T> {
    const transitions: ProjectProgressTransition[] = [];
    const result = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction((tx) => fn(tx, transitions)),
    );
    await this.lifecycle.publishTransitions(orgId, authContext, transitions);
    return result;
  }

  /** Tarea -> proyecto -> avance de gestión del objetivo, en la transacción activa. Anota la transición de avance. */
  private async recomputeProject(
    tx: Parameters<typeof lockProject>[0],
    projectId: string,
    orgId: string,
    transitions: ProjectProgressTransition[],
  ): Promise<void> {
    const before = await tx.project.findFirstOrThrow({
      where: { id: projectId, organizationId: orgId },
      select: { title: true, objectiveId: true, progressCachedBp: true },
    });
    await recomputeProjectAndObjectiveExecution(
      tx,
      projectId,
      orgId,
      computeProjectProgress,
      computeExecutionProgress,
    );
    const after = await tx.project.findFirstOrThrow({
      where: { id: projectId, organizationId: orgId },
      select: { progressCachedBp: true },
    });
    if (after.progressCachedBp !== before.progressCachedBp) {
      transitions.push({
        projectId,
        projectTitle: before.title,
        objectiveId: before.objectiveId,
        fromBp: before.progressCachedBp,
        toBp: after.progressCachedBp,
      });
    }
  }

  private toSummaryDto(t: TaskRow): TaskSummaryDto {
    return {
      id: t.id,
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
