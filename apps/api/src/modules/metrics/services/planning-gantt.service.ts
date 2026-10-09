import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ObjectivePlanGanttDto,
  PlanningGanttDto,
  ProjectGanttDto,
  ProjectProgressMode,
  TaskGanttDto,
} from '@gestion-publica/shared-types/okr';
import { computeTaskStatus, unitSubtreeIds } from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import {
  AXIS_TREE_READER,
  OBJECTIVE_PROGRESS_READER,
  ORG_UNIT_TREE_READER,
  type AxisTreeReader,
  type ObjectiveProgressReader,
  type OrgUnitTreeReader,
} from '../../../common/contracts/index.js';
import { IndicatorStatusService } from './indicator-status.service.js';

export interface PlanningGanttFilters {
  /** Sin período se usa el abierto de la org; si no hay ninguno abierto, 404 `OpenPeriodNotFound`. */
  periodId?: string;
  axisId?: string;
  orgUnitId?: string;
}

interface ProjectRow {
  id: string;
  objectiveId: string;
  orgUnitId: string;
  title: string;
  progressCachedBp: number;
  progressMode: string;
  startsAt: Date;
  endsAt: Date;
}

interface TaskRow {
  id: string;
  projectId: string | null;
  title: string;
  progressBp: number;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Vista ejecutiva Objetivo -> Proyecto -> Tarea (SPEC §5.7). Solo lectura.
 *
 * - Sin N+1: objetivos del período por el puerto de `okr` (lote), estructura por los puertos de `core`/`planning`,
 *   semáforos con `IndicatorStatusService` (mismo cálculo que `GET objectives/:id/status`) y proyectos y tareas en
 *   una query por tipo con `IN (...)`. Cantidad de queries independiente de la cantidad de objetivos.
 * - Resultado y gestión van separados, nunca combinados. No se calcula avance acá: se leen los caches.
 * - Lecturas abiertas a toda la organización (RN-P20).
 */
@Injectable()
export class PlanningGanttService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: IndicatorStatusService,
    @Inject(OBJECTIVE_PROGRESS_READER) private readonly progressReader: ObjectiveProgressReader,
    @Inject(ORG_UNIT_TREE_READER) private readonly unitReader: OrgUnitTreeReader,
    @Inject(AXIS_TREE_READER) private readonly axisReader: AxisTreeReader,
  ) {}

  async getPlanningGantt(
    orgId: string,
    filters: PlanningGanttFilters,
    now: Date = new Date(),
  ): Promise<PlanningGanttDto> {
    const period = await this.prisma.scoped.period.findFirst({
      where: filters.periodId
        ? { id: filters.periodId, organizationId: orgId, deletedAt: null }
        : { organizationId: orgId, status: 'open', deletedAt: null },
      select: { id: true },
    });
    if (!period) {
      throw new NotFoundException(
        filters.periodId
          ? `Period ${filters.periodId} not found`
          : 'OpenPeriodNotFound: la organización no tiene un período abierto',
      );
    }

    const [units, plan, readings] = await Promise.all([
      this.unitReader.listLiveOrgUnits(orgId),
      this.axisReader.findActivePlanStructure(orgId),
      this.progressReader.readPeriodObjectivesProgress(orgId, period.id, now),
    ]);
    const axes = plan?.axes ?? [];

    if (filters.axisId !== undefined && !axes.some((a) => a.id === filters.axisId)) {
      throw new NotFoundException(`Axis ${filters.axisId} not found`);
    }
    let unitScope: Set<string> | null = null;
    if (filters.orgUnitId !== undefined) {
      unitScope = unitSubtreeIds(units, filters.orgUnitId);
      if (unitScope.size === 0) {
        throw new NotFoundException(`OrgUnit ${filters.orgUnitId} not found`);
      }
    }

    const selected = readings.filter(
      (r) =>
        (filters.axisId === undefined || r.axisId === filters.axisId) &&
        (unitScope === null || (r.orgUnitId !== null && unitScope.has(r.orgUnitId))),
    );

    const statuses = await this.statusService.getObjectivesStatusSummaries(orgId, selected, now);

    const objectiveIds = selected.map((r) => r.id);
    const projects: ProjectRow[] =
      objectiveIds.length === 0
        ? []
        : ((await this.prisma.scoped.project.findMany({
            where: { organizationId: orgId, objectiveId: { in: objectiveIds }, deletedAt: null },
            orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          })) as ProjectRow[]);
    const tasks: TaskRow[] =
      projects.length === 0
        ? []
        : ((await this.prisma.scoped.task.findMany({
            where: {
              organizationId: orgId,
              projectId: { in: projects.map((p) => p.id) },
              deletedAt: null,
            },
            orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          })) as TaskRow[]);

    const unitsById = new Map(units.map((u) => [u.id, u]));
    const axesById = new Map(axes.map((a) => [a.id, a]));

    const tasksByProject = new Map<string, TaskGanttDto[]>();
    for (const t of tasks) {
      if (t.projectId === null) continue;
      const list = tasksByProject.get(t.projectId) ?? [];
      list.push({
        id: t.id,
        title: t.title,
        status: computeTaskStatus(t.progressBp, t.endsAt, now),
        progressBp: t.progressBp,
        startsAt: t.startsAt.toISOString(),
        endsAt: t.endsAt.toISOString(),
      });
      tasksByProject.set(t.projectId, list);
    }
    const projectsByObjective = new Map<string, ProjectRow[]>();
    for (const p of projects) {
      const list = projectsByObjective.get(p.objectiveId) ?? [];
      list.push(p);
      projectsByObjective.set(p.objectiveId, list);
    }

    const objectives: ObjectivePlanGanttDto[] = [];
    for (const r of selected) {
      const status = statuses.get(r.id);
      if (!status) continue; // inalcanzable: una entrada por cada lectura recibida
      const unit = unitsById.get(r.orgUnitId);
      if (!unit) continue; // inalcanzable: una unidad con objetivos vivos no se puede borrar
      // Un eje fuera del plan activo (plan archivado) se trata como "sin eje".
      const axis = r.axisId !== null ? axesById.get(r.axisId) : undefined;
      const rows = projectsByObjective.get(r.id) ?? [];
      const projectDtos: ProjectGanttDto[] = rows.map((p) => ({
        id: p.id,
        title: p.title,
        orgUnitId: p.orgUnitId,
        orgUnitName: unitsById.get(p.orgUnitId)?.name ?? '',
        progressBp: p.progressCachedBp,
        progressMode: p.progressMode as ProjectProgressMode,
        startsAt: p.startsAt.toISOString(),
        endsAt: p.endsAt.toISOString(),
        tasks: tasksByProject.get(p.id) ?? [],
      }));
      objectives.push({
        id: r.id,
        title: r.title,
        orgUnitId: unit.id,
        orgUnitName: unit.name,
        orgUnitKind: unit.kind,
        axisId: axis?.id ?? null,
        axisName: axis?.name ?? null,
        startsAt:
          rows.length === 0
            ? null
            : new Date(Math.min(...rows.map((p) => p.startsAt.getTime()))).toISOString(),
        endsAt:
          rows.length === 0
            ? null
            : new Date(Math.max(...rows.map((p) => p.endsAt.getTime()))).toISOString(),
        result: {
          progressBp: status.result.progressBp,
          deviationBp: status.result.deviationBp,
          semaphore: status.result.semaphore,
          pendingBucketsCount: status.result.pendingBucketsCount,
        },
        execution: {
          progressBp: status.execution.progressBp,
          plannedBp: status.execution.plannedBp,
          deviationBp: status.execution.deviationBp,
          semaphore: status.execution.semaphore,
        },
        projects: projectDtos,
      });
    }

    return {
      asOf: now.toISOString(),
      periodId: period.id,
      filters: { axisId: filters.axisId ?? null, orgUnitId: filters.orgUnitId ?? null },
      objectives,
    };
  }
}
