import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  PlanningAggregateDto,
  PlanningAxisNodeDto,
  PlanningAxisUnitDto,
  PlanningObjectiveDto,
  PlanningTreeDto,
  PlanningUnitNodeDto,
} from '@gestion-publica/shared-types/okr';
import {
  aggregateObjectiveReadings,
  aggregateObjectiveReadingsBy,
  buildUnitAggregates,
  unitSubtreeIds,
  type ObjectiveReadingInput,
  type UnitAggregateNode,
} from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import {
  AXIS_TREE_READER,
  OBJECTIVE_PROGRESS_READER,
  ORG_UNIT_TREE_READER,
  type AxisTreeReader,
  type ObjectiveProgressReader,
  type OrgUnitTreeReader,
  type OrgUnitTreeRow,
} from '../../../common/contracts/index.js';
import { IndicatorStatusService } from './indicator-status.service.js';

export interface PlanningTreeFilters {
  /** Sin período se usa el abierto de la org; si no hay ninguno abierto, 404 `OpenPeriodNotFound`. */
  periodId?: string;
  axisId?: string;
  orgUnitId?: string;
}

/**
 * Árbol de planificación y tableros por eje y unidad (SPEC §5.2/§5.3, RN-P10). Solo lectura.
 *
 * - Sin N+1: carga en lote los objetivos del período (puerto de `okr`), la estructura de unidades y ejes (puertos
 *   de `core` y `planning`) y el estado de todos los objetivos con `IndicatorStatusService` (mismo cálculo que
 *   `GET objectives/:id/status`). La cantidad de queries no depende de la cantidad de objetivos.
 * - La agregación (promedio simple de objetivos por lectura, desvío medio, semáforo) es matemática pura de
 *   `okr-domain`; este service solo carga, filtra y mapea a DTOs. Las dos lecturas nunca se combinan.
 * - Las lecturas están abiertas a toda la organización (RN-P20): no se filtra por alcance de unidad.
 */
@Injectable()
export class PlanningTreeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: IndicatorStatusService,
    @Inject(OBJECTIVE_PROGRESS_READER) private readonly progressReader: ObjectiveProgressReader,
    @Inject(ORG_UNIT_TREE_READER) private readonly unitReader: OrgUnitTreeReader,
    @Inject(AXIS_TREE_READER) private readonly axisReader: AxisTreeReader,
  ) {}

  async getPlanningTree(
    orgId: string,
    filters: PlanningTreeFilters,
    now: Date = new Date(),
  ): Promise<PlanningTreeDto> {
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

    const [allUnits, plan, readings] = await Promise.all([
      this.unitReader.listLiveOrgUnits(orgId),
      this.axisReader.findActivePlanStructure(orgId),
      this.progressReader.readPeriodObjectivesProgress(orgId, period.id, now),
    ]);
    const axes = [...(plan?.axes ?? [])].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );

    if (filters.axisId !== undefined && !axes.some((a) => a.id === filters.axisId)) {
      throw new NotFoundException(`Axis ${filters.axisId} not found`);
    }
    let units: OrgUnitTreeRow[] = allUnits;
    let unitScope: Set<string> | null = null;
    if (filters.orgUnitId !== undefined) {
      unitScope = unitSubtreeIds(allUnits, filters.orgUnitId);
      if (unitScope.size === 0) {
        throw new NotFoundException(`OrgUnit ${filters.orgUnitId} not found`);
      }
      const scope = unitScope;
      units = allUnits.filter((u) => scope.has(u.id));
    }

    // Un eje fuera del plan activo (plan archivado) se trata como "sin eje".
    const axisIds = new Set(axes.map((a) => a.id));
    const unitIds = new Set(allUnits.map((u) => u.id));
    const selected = readings.filter(
      (r) =>
        (filters.axisId === undefined || r.axisId === filters.axisId) &&
        (unitScope === null || (r.orgUnitId !== null && unitScope.has(r.orgUnitId))),
    );

    const statuses = await this.statusService.getObjectivesStatusSummaries(orgId, selected, now);

    const objectives: PlanningObjectiveDto[] = [];
    const inputs: ObjectiveReadingInput[] = [];
    for (const r of selected) {
      const status = statuses.get(r.id);
      if (!status) continue; // inalcanzable: el servicio devuelve una entrada por cada lectura recibida
      const axisId = r.axisId !== null && axisIds.has(r.axisId) ? r.axisId : null;
      const orgUnitId = r.orgUnitId !== null && unitIds.has(r.orgUnitId) ? r.orgUnitId : null;
      objectives.push({
        id: r.id,
        title: r.title,
        orgUnitId,
        axisId,
        result: status.result,
        execution: status.execution,
      });
      inputs.push({
        id: r.id,
        orgUnitId,
        axisId,
        resultProgressBp: status.result.progressBp,
        executionProgressBp: status.execution.progressBp,
        resultDeviationBp: status.result.deviationBp,
        executionDeviationBp: status.execution.deviationBp,
        pendingBucketsCount: status.result.pendingBucketsCount,
      });
    }

    const unitAggregates = buildUnitAggregates(units, inputs);
    const unitsById = new Map(units.map((u) => [u.id, u]));
    const unitOrder = new Map<string, number>();
    const orderUnits = (nodes: ReadonlyArray<UnitAggregateNode>): void => {
      for (const n of nodes) {
        unitOrder.set(n.orgUnitId, unitOrder.size);
        orderUnits(n.children);
      }
    };
    orderUnits(unitAggregates.roots);

    /** Desglose por unidad (solo directos) de un conjunto de objetivos, en el orden del árbol y "sin unidad" al final. */
    const unitBreakdown = (items: ReadonlyArray<ObjectiveReadingInput>): PlanningAxisUnitDto[] =>
      [...aggregateObjectiveReadingsBy(items, (i) => i.orgUnitId)]
        .map(([orgUnitId, aggregate]) => ({ orgUnitId, aggregate }))
        .sort(
          (a, b) =>
            (a.orgUnitId === null ? Infinity : (unitOrder.get(a.orgUnitId) ?? Infinity)) -
            (b.orgUnitId === null ? Infinity : (unitOrder.get(b.orgUnitId) ?? Infinity)),
        );

    const toUnitNode = (node: UnitAggregateNode): PlanningUnitNodeDto => {
      const unit = unitsById.get(node.orgUnitId) as OrgUnitTreeRow;
      return {
        id: unit.id,
        name: unit.name,
        kind: unit.kind,
        order: unit.order,
        aggregate: node.aggregate as PlanningAggregateDto,
        directAggregate: node.directAggregate as PlanningAggregateDto,
        objectiveIds: node.objectiveIds,
        children: node.children.map(toUnitNode),
      };
    };

    const axisNodes: PlanningAxisNodeDto[] = (
      filters.axisId === undefined ? axes : axes.filter((a) => a.id === filters.axisId)
    ).map((axis) => {
      const items = inputs.filter((i) => i.axisId === axis.id);
      return {
        id: axis.id,
        name: axis.name,
        order: axis.order,
        aggregate: aggregateObjectiveReadings(items),
        objectiveIds: items.map((i) => i.id),
        units: unitBreakdown(items),
      };
    });
    const withoutAxisItems = inputs.filter((i) => i.axisId === null);

    return {
      asOf: now.toISOString(),
      periodId: period.id,
      filters: { axisId: filters.axisId ?? null, orgUnitId: filters.orgUnitId ?? null },
      plan: {
        id: plan?.id ?? null,
        title: plan?.title ?? null,
        aggregate: aggregateObjectiveReadings(inputs),
      },
      axes: axisNodes,
      withoutAxis: {
        aggregate: aggregateObjectiveReadings(withoutAxisItems),
        objectiveIds: withoutAxisItems.map((i) => i.id),
        units: unitBreakdown(withoutAxisItems),
      },
      units: unitAggregates.roots.map(toUnitNode),
      withoutUnit: unitAggregates.withoutUnit,
      objectives,
    };
  }
}
