import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { DeleteProjectResultDto, ProjectDetailDto, ProjectSummaryDto, ProjectProgressMode } from '@gestion-publica/shared-types/okr';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  computeExecutionProgress,
  projectSumAfterDelete,
  weightMode,
} from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { MemberService } from '../../core/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import {
  ORG_UNIT_HIERARCHY,
  ORG_UNIT_LOOKUP,
  ORG_UNIT_SCOPE,
  type OrgUnitHierarchy,
  type OrgUnitLookup,
  type OrgUnitScope,
} from '../../../common/contracts/index.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import type { CreateProjectDto } from '../dto/create-project.dto.js';
import type { UpdateProjectDto } from '../dto/update-project.dto.js';
import type { SetSiblingWeightsDto } from '../dto/set-sibling-weights.dto.js';
import { lockObjective, recomputeObjectiveExecution } from './project-recompute.js';
import { ProjectLifecyclePublisher } from './project-lifecycle-publisher.js';
import { assertSameSiblingSet, assertValidWeightGroup } from './weight-group.js';

type PeriodRow = { id: string; code: string; status: string; startsAt: Date; endsAt: Date };
type PeriodRef = { id: string; status: 'open' | 'closed' | 'future'; code: string };

type ProjectRow = {
  id: string;
  objectiveId: string;
  organizationId: string;
  orgUnitId: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  weightBp: number | null;
  startsAt: Date;
  endsAt: Date;
  progressMode: string;
  sourceObjectiveIndicatorId: string | null;
  progressCachedBp: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { tasks: number };
};

type ObjectiveForProject = {
  id: string;
  orgUnitId: string | null;
  period: PeriodRow;
};

const PERIOD_SELECT = { id: true, code: true, status: true, startsAt: true, endsAt: true } as const;
const TASK_COUNT = { _count: { select: { tasks: { where: { deletedAt: null } } } } } as const;

/**
 * ABM de proyectos (N5, ADR-0009 D2). Reglas: RN-P4 (unidad = la del objetivo o descendiente; fechas dentro del
 * período del objetivo), RN-P6 (pesos todo-o-nada entre proyectos hermanos) y RN-P8 (avance de gestión).
 * La matemática de cascada vive en `okr-domain`; este service carga, valida, persiste y audita.
 */
@Injectable()
export class ProjectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    private readonly memberService: MemberService,
    @Inject(ORG_UNIT_LOOKUP) private readonly orgUnitLookup: OrgUnitLookup,
    @Inject(ORG_UNIT_HIERARCHY) private readonly orgUnitHierarchy: OrgUnitHierarchy,
    private readonly lifecycle: ProjectLifecyclePublisher,
    @Inject(ORG_UNIT_SCOPE) private readonly orgUnitScope: OrgUnitScope,
  ) {}

  async listByObjective(objectiveId: string, orgId: string): Promise<ProjectSummaryDto[]> {
    await this.findObjectiveOrThrow(objectiveId, orgId);
    const projects = await this.prisma.scoped.project.findMany({
      where: { objectiveId, organizationId: orgId, deletedAt: null },
      include: TASK_COUNT,
      orderBy: { createdAt: 'asc' },
    });
    return (projects as ProjectRow[]).map((p) => this.toSummaryDto(p));
  }

  async getById(id: string, orgId: string): Promise<ProjectDetailDto> {
    return this.toDetailDto(await this.findProjectOrThrow(id, orgId));
  }

  async create(
    objectiveId: string,
    orgId: string,
    dto: CreateProjectDto,
    authContext: AuthContext,
  ): Promise<ProjectDetailDto> {
    const objective = await this.findObjectiveOrThrow(objectiveId, orgId);
    assertPeriodOpen(objective.period as PeriodRef);
    this.assertProgressModeOperable(dto.progressMode);

    if (objective.orgUnitId === null) {
      throw new UnprocessableEntityException(
        'ObjectiveWithoutOrgUnit: el objetivo todavía no tiene unidad asignada; asignale una antes de crear proyectos (RN-P4).',
      );
    }
    const orgUnitId = dto.orgUnitId ?? objective.orgUnitId;
    // RN-P20: la unidad efectiva del proyecto es la suya (no la del objetivo, salvo que herede).
    await this.orgUnitScope.assertCanWriteInUnit(authContext, orgUnitId);
    await this.assertOrgUnitInScope(orgId, objective.orgUnitId, orgUnitId);

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    this.assertDatesWithinPeriod(startsAt, endsAt, objective.period);
    await this.assertOwnerIsMember(orgId, dto.ownerUserId);
    const weightBp = dto.weightBp ?? null;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await lockObjective(tx, objectiveId, orgId);
        const siblings = await tx.project.findMany({
          where: { objectiveId, organizationId: orgId, deletedAt: null },
          select: { weightBp: true },
        });
        assertValidWeightGroup([...siblings, { weightBp }], 'proyectos');

        const project = (await tx.project.create({
          data: {
            objectiveId,
            organizationId: orgId,
            orgUnitId,
            title: dto.title,
            description: dto.description ?? null,
            ownerUserId: dto.ownerUserId ?? null,
            weightBp,
            startsAt,
            endsAt,
            progressMode: 'from_tasks',
          },
        })) as Omit<ProjectRow, '_count'>;

        await this.auditEmitter.emit({
          action: 'project.created',
          entityType: 'okr.project',
          entityId: project.id,
          diff: {
            before: null,
            after: {
              objectiveId,
              orgUnitId,
              title: project.title,
              description: project.description,
              ownerUserId: project.ownerUserId,
              weightBp,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              progressMode: 'from_tasks',
            },
          },
        });

        await recomputeObjectiveExecution(tx, objectiveId, orgId, computeExecutionProgress);
        return this.toDetailDto({ ...project, _count: { tasks: 0 } });
      }),
    );
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateProjectDto,
    authContext: AuthContext,
  ): Promise<ProjectDetailDto> {
    const existing = await this.findProjectOrThrow(id, orgId);
    const objective = await this.findObjectiveOrThrow(existing.objectiveId, orgId);
    // RN-P20: unidad actual del proyecto, la destino si se mueve y, si cambia el peso (reparte el grupo
    // de hermanos del objetivo), la unidad del objetivo.
    await this.orgUnitScope.assertCanWriteInUnit(authContext, existing.orgUnitId);
    if (dto.orgUnitId !== undefined && dto.orgUnitId !== existing.orgUnitId) {
      await this.orgUnitScope.assertCanWriteInUnit(authContext, dto.orgUnitId);
    }
    if (dto.weightBp !== undefined && dto.weightBp !== existing.weightBp) {
      await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId);
    }
    assertPeriodOpen(objective.period as PeriodRef);
    this.assertProgressModeOperable(dto.progressMode);

    const orgUnitChanged = dto.orgUnitId !== undefined && dto.orgUnitId !== existing.orgUnitId;
    if (orgUnitChanged && dto.orgUnitId !== undefined) {
      if (objective.orgUnitId === null) {
        throw new UnprocessableEntityException(
          'ObjectiveWithoutOrgUnit: el objetivo todavía no tiene unidad asignada (RN-P4).',
        );
      }
      await this.assertOrgUnitInScope(orgId, objective.orgUnitId, dto.orgUnitId);
    }

    const newStartsAt = dto.startsAt !== undefined ? new Date(dto.startsAt) : existing.startsAt;
    const newEndsAt = dto.endsAt !== undefined ? new Date(dto.endsAt) : existing.endsAt;
    const datesChanged = dto.startsAt !== undefined || dto.endsAt !== undefined;
    if (datesChanged) this.assertDatesWithinPeriod(newStartsAt, newEndsAt, objective.period);
    if (dto.ownerUserId !== undefined) await this.assertOwnerIsMember(orgId, dto.ownerUserId);

    const weightChanged = dto.weightBp !== undefined && dto.weightBp !== existing.weightBp;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await lockObjective(tx, existing.objectiveId, orgId);

        // RN-P5 al editar fechas del proyecto: Pedro decidió (2026-10-07) no limitar por ahora si el rango
        // nuevo deja tareas afuera. Queda en TODO.md para endurecerlo más adelante.

        if (weightChanged && dto.weightBp !== undefined) {
          const siblings = await tx.project.findMany({
            where: { objectiveId: existing.objectiveId, organizationId: orgId, deletedAt: null, id: { not: id } },
            select: { weightBp: true },
          });
          assertValidWeightGroup([...siblings, { weightBp: dto.weightBp }], 'proyectos');
        }

        const updated = (await tx.project.update({
          where: { id },
          data: {
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.ownerUserId !== undefined && { ownerUserId: dto.ownerUserId }),
            ...(dto.orgUnitId !== undefined && { orgUnitId: dto.orgUnitId }),
            ...(dto.weightBp !== undefined && { weightBp: dto.weightBp }),
            ...(dto.startsAt !== undefined && { startsAt: newStartsAt }),
            ...(dto.endsAt !== undefined && { endsAt: newEndsAt }),
          },
        })) as Omit<ProjectRow, '_count'>;

        if (weightChanged) {
          await recomputeObjectiveExecution(tx, existing.objectiveId, orgId, computeExecutionProgress);
        }

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
        if (dto.ownerUserId !== undefined) {
          before['ownerUserId'] = existing.ownerUserId;
          after['ownerUserId'] = dto.ownerUserId;
        }
        if (dto.orgUnitId !== undefined) {
          before['orgUnitId'] = existing.orgUnitId;
          after['orgUnitId'] = dto.orgUnitId;
        }
        if (dto.weightBp !== undefined) {
          before['weightBp'] = existing.weightBp;
          after['weightBp'] = dto.weightBp;
        }
        if (dto.startsAt !== undefined) {
          before['startsAt'] = existing.startsAt.toISOString();
          after['startsAt'] = newStartsAt.toISOString();
        }
        if (dto.endsAt !== undefined) {
          before['endsAt'] = existing.endsAt.toISOString();
          after['endsAt'] = newEndsAt.toISOString();
        }

        await this.auditEmitter.emit({
          action: 'project.updated',
          entityType: 'okr.project',
          entityId: id,
          diff: { before, after },
        });

        return this.toDetailDto({ ...updated, _count: existing._count });
      }),
    );
  }

  /**
   * Reemplaza de forma atómica los pesos de TODOS los proyectos vivos de un objetivo (RN-P6/RN-P7):
   * o todos con peso y suman 10000, o todos `null` (promedio simple).
   */
  async setObjectiveProjectWeights(
    objectiveId: string,
    orgId: string,
    dto: SetSiblingWeightsDto,
    authContext: AuthContext,
  ): Promise<ProjectSummaryDto[]> {
    const objective = await this.findObjectiveOrThrow(objectiveId, orgId);
    // Los pesos reparten el grupo de hermanos de todo el objetivo: se exige la unidad del objetivo.
    await this.orgUnitScope.assertCanWriteInUnit(authContext, objective.orgUnitId);
    assertPeriodOpen(objective.period as PeriodRef);

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await lockObjective(tx, objectiveId, orgId);
        const live = (await tx.project.findMany({
          where: { objectiveId, organizationId: orgId, deletedAt: null },
          include: TASK_COUNT,
          orderBy: { createdAt: 'asc' },
        })) as ProjectRow[];
        assertSameSiblingSet(
          live.map((p) => p.id),
          dto.weights.map((w) => w.id),
        );
        assertValidWeightGroup(dto.weights, 'proyectos');

        const result: ProjectRow[] = [];
        for (const project of live) {
          const requested = dto.weights.find((w) => w.id === project.id)?.weightBp ?? null;
          if (requested === project.weightBp) {
            result.push(project);
            continue;
          }
          const updated = (await tx.project.update({
            where: { id: project.id },
            data: { weightBp: requested },
          })) as Omit<ProjectRow, '_count'>;
          await this.auditEmitter.emit({
            action: 'project.updated',
            entityType: 'okr.project',
            entityId: project.id,
            diff: { before: { weightBp: project.weightBp }, after: { weightBp: requested } },
          });
          result.push({ ...updated, _count: project._count });
        }

        await recomputeObjectiveExecution(tx, objectiveId, orgId, computeExecutionProgress);
        return result.map((p) => this.toSummaryDto(p));
      }),
    );
  }

  /**
   * Borra el proyecto y, en la misma transacción, sus tareas vivas (Pedro, 2026-10-07: "se lleva todo").
   * El warning previo lo muestra la UI con `taskCount`; acá se devuelven las tareas borradas.
   */
  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<DeleteProjectResultDto> {
    const existing = await this.findProjectOrThrow(id, orgId);
    const objective = await this.findObjectiveOrThrow(existing.objectiveId, orgId);
    await this.orgUnitScope.assertCanWriteInUnit(authContext, existing.orgUnitId);
    assertPeriodOpen(objective.period as PeriodRef);

    const result = await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await lockObjective(tx, existing.objectiveId, orgId);

        // RN-P6 / RN-25: no se puede dejar un grupo ponderado con suma != 10000.
        const siblings = await tx.project.findMany({
          where: { objectiveId: existing.objectiveId, organizationId: orgId, deletedAt: null },
          select: { id: true, weightBp: true },
        });
        if (weightMode(siblings) === 'weighted' && siblings.length > 1) {
          const remaining = projectSumAfterDelete(siblings, id);
          if (remaining !== 10000) {
            throw new UnprocessableEntityException(
              `WeightSumInvalid: borrar este proyecto dejaría los pesos de los proyectos en ${remaining} bp (deben sumar 10000). Redistribuí los pesos primero (RN-P6).`,
            );
          }
        }

        const deletedAt = new Date();
        const deletedAtIso = deletedAt.toISOString();
        const tasks = await tx.task.findMany({
          where: { projectId: id, organizationId: orgId, deletedAt: null },
          select: { id: true },
        });
        for (const task of tasks) {
          await tx.task.update({ where: { id: task.id }, data: { deletedAt } });
          await this.auditEmitter.emit({
            action: 'task.deleted',
            entityType: 'okr.task',
            entityId: task.id,
            diff: { before: { deletedAt: null }, after: { deletedAt: deletedAtIso } },
          });
        }
        const deletedTaskIds = tasks.map((t) => t.id);

        await tx.project.update({ where: { id }, data: { deletedAt } });
        await recomputeObjectiveExecution(tx, existing.objectiveId, orgId, computeExecutionProgress);

        await this.auditEmitter.emit({
          action: 'project.deleted',
          entityType: 'okr.project',
          entityId: id,
          diff: { before: { deletedAt: null }, after: { deletedAt: deletedAtIso, deletedTaskIds } },
        });

        return { deletedTaskCount: deletedTaskIds.length, deletedTaskIds };
      }),
    );

    // ADR-0009 D5: después del commit, `metrics` revierte los aportes ya aplicados del proyecto y los da de baja.
    await this.lifecycle.publishDeleted(orgId, authContext, {
      id,
      title: existing.title,
      objectiveId: existing.objectiveId,
    });
    return result;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Hasta F4/F7 solo `from_tasks` es operable; `from_indicator` se rechaza explícitamente. */
  private assertProgressModeOperable(mode: ProjectProgressMode | undefined): void {
    if (mode !== undefined && mode !== 'from_tasks') {
      throw new UnprocessableEntityException(
        `ProjectProgressModeNotSupported: el modo "${mode}" todavía no está habilitado; por ahora solo "from_tasks".`,
      );
    }
  }

  /** RN-P4: la unidad existe en la org y es la del objetivo o una descendiente (vía puertos de `core`). */
  private async assertOrgUnitInScope(orgId: string, objectiveUnitId: string, unitId: string): Promise<void> {
    const unit = await this.orgUnitLookup.findLiveOrgUnit(orgId, unitId);
    if (!unit) {
      throw new UnprocessableEntityException(
        `OrgUnitNotFound: OrgUnit "${unitId}" does not exist in organization "${orgId}".`,
      );
    }
    const inScope = await this.orgUnitHierarchy.isSelfOrDescendant(orgId, objectiveUnitId, unitId);
    if (!inScope) {
      throw new UnprocessableEntityException(
        'ProjectOrgUnitOutOfScope: la unidad del proyecto debe ser la del objetivo o una unidad descendiente (RN-P4).',
      );
    }
  }

  /** RN-P4: fechas coherentes y dentro del período del objetivo (inclusive). */
  private assertDatesWithinPeriod(startsAt: Date, endsAt: Date, period: PeriodRow): void {
    if (startsAt > endsAt) {
      throw new UnprocessableEntityException(
        `ProjectDatesInvalid: la fecha de inicio (${startsAt.toISOString()}) debe ser anterior o igual a la de fin (${endsAt.toISOString()}).`,
      );
    }
    if (startsAt < period.startsAt || endsAt > period.endsAt) {
      throw new UnprocessableEntityException(
        `ProjectOutsidePeriod: las fechas del proyecto (${startsAt.toISOString().slice(0, 10)} a ${endsAt.toISOString().slice(0, 10)}) deben caer dentro del período ${period.code} (${period.startsAt.toISOString().slice(0, 10)} a ${period.endsAt.toISOString().slice(0, 10)}) (RN-P4).`,
      );
    }
  }

  private async assertOwnerIsMember(orgId: string, ownerUserId: string | null | undefined): Promise<void> {
    if (ownerUserId === undefined || ownerUserId === null) return;
    const isMember = await this.memberService.isMemberOf(orgId, ownerUserId);
    if (!isMember) {
      throw new UnprocessableEntityException(
        `OwnerNotMember: User "${ownerUserId}" is not a member of organization "${orgId}".`,
      );
    }
  }

  private async findObjectiveOrThrow(objectiveId: string, orgId: string): Promise<ObjectiveForProject> {
    const objective = await this.prisma.scoped.objective.findFirst({
      where: { id: objectiveId, organizationId: orgId, deletedAt: null },
      select: { id: true, orgUnitId: true, period: { select: PERIOD_SELECT } },
    });
    if (!objective) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }
    return objective as ObjectiveForProject;
  }

  private async findProjectOrThrow(id: string, orgId: string): Promise<ProjectRow> {
    const project = await this.prisma.scoped.project.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: TASK_COUNT,
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return project as ProjectRow;
  }

  private toSummaryDto(p: ProjectRow): ProjectSummaryDto {
    return {
      id: p.id,
      objectiveId: p.objectiveId,
      orgUnitId: p.orgUnitId,
      title: p.title,
      weightBp: p.weightBp,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      progressMode: p.progressMode as ProjectProgressMode,
      progressCachedBp: p.progressCachedBp,
      taskCount: p._count.tasks,
      createdAt: p.createdAt.toISOString(),
    };
  }

  private toDetailDto(p: ProjectRow): ProjectDetailDto {
    return {
      ...this.toSummaryDto(p),
      organizationId: p.organizationId,
      description: p.description,
      ownerUserId: p.ownerUserId,
      sourceObjectiveIndicatorId: p.sourceObjectiveIndicatorId,
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
