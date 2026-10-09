import type {
  PlanningAggregateDto,
  PlanningAxisUnitDto,
  PlanningObjectiveDto,
  PlanningTreeDto,
  PlanningUnitNodeDto,
} from '@gestion-publica/shared-types/okr';
import type { SemaphoreColor } from '@gestion-publica/shared-types/metrics';
import { PLANNING_TREE_LABELS as L } from '@/lib/labels';
import type { PlanningTreeViewMode } from './planning-tree-filters';

/**
 * Lectura de un nodo. Resultado y gestión van siempre separados; `progressBp = null` = no hay con qué medir
 * (sin objetivos), no 0 (RN-P8, RN-P10).
 */
export interface NodeReading {
  progressBp: number | null;
  deviationBp: number | null;
  semaphore: SemaphoreColor | null;
}

export interface NodeReadings {
  result: NodeReading & { pendingBucketsCount: number };
  execution: NodeReading;
}

export type TreeNodeKind = 'plan' | 'axis' | 'unit' | 'withoutAxis' | 'objective';

export interface TreeNode {
  /** Único dentro del árbol (sirve de key y de estado de colapso). */
  key: string;
  kind: TreeNodeKind;
  label: string;
  /** Texto secundario (ej: "3 objetivos"). */
  caption: string;
  readings: NodeReadings;
  /** Solo en objetivos: link a la ficha. */
  href: string | null;
  /** Sin objetivos en el nodo: la vista muestra "Sin objetivos". */
  isEmpty: boolean;
  children: TreeNode[];
}

export function readingsFromAggregate(a: PlanningAggregateDto): NodeReadings {
  return {
    result: {
      progressBp: a.result.progressBp,
      deviationBp: a.result.deviationBp,
      semaphore: a.result.semaphore,
      pendingBucketsCount: a.result.pendingBucketsCount,
    },
    execution: {
      progressBp: a.execution.progressBp,
      deviationBp: a.execution.deviationBp,
      semaphore: a.execution.semaphore,
    },
  };
}

export function readingsFromObjective(o: PlanningObjectiveDto): NodeReadings {
  return {
    result: {
      progressBp: o.result.progressBp,
      deviationBp: o.result.deviationBp,
      semaphore: o.result.semaphore,
      pendingBucketsCount: o.result.pendingBucketsCount,
    },
    execution: {
      progressBp: o.execution.progressBp,
      deviationBp: o.execution.deviationBp,
      semaphore: o.execution.semaphore,
    },
  };
}

export function objectiveNode(o: PlanningObjectiveDto, parentKey: string): TreeNode {
  return {
    key: `${parentKey}/o:${o.id}`,
    kind: 'objective',
    label: o.title,
    caption: '',
    readings: readingsFromObjective(o),
    href: `/objectives/${o.id}`,
    isEmpty: false,
    children: [],
  };
}

function aggregateNode(
  key: string,
  kind: TreeNodeKind,
  label: string,
  aggregate: PlanningAggregateDto,
  children: TreeNode[],
): TreeNode {
  return {
    key,
    kind,
    label,
    caption: L.objectivesCount(aggregate.objectivesCount),
    readings: readingsFromAggregate(aggregate),
    href: null,
    isEmpty: aggregate.objectivesCount === 0,
    children,
  };
}

function indexObjectives(dto: PlanningTreeDto): Map<string, PlanningObjectiveDto> {
  return new Map(dto.objectives.map((o) => [o.id, o]));
}

function flattenUnits(units: PlanningUnitNodeDto[]): PlanningUnitNodeDto[] {
  return units.flatMap((u) => [u, ...flattenUnits(u.children)]);
}

export function unitNamesById(dto: PlanningTreeDto): Map<string, string> {
  return new Map(flattenUnits(dto.units).map((u) => [u.id, u.name]));
}

function resolveObjectives(
  ids: string[],
  byId: Map<string, PlanningObjectiveDto>,
): PlanningObjectiveDto[] {
  return ids.flatMap((id) => {
    const o = byId.get(id);
    return o ? [o] : [];
  });
}

/** Unidades de un eje, con sus objetivos directos en ese eje. */
function axisUnitNodes(
  parentKey: string,
  units: PlanningAxisUnitDto[],
  objectiveIds: string[],
  byId: Map<string, PlanningObjectiveDto>,
  names: Map<string, string>,
): TreeNode[] {
  const objectives = resolveObjectives(objectiveIds, byId);
  return units.map((u) => {
    const key = `${parentKey}/u:${u.orgUnitId}`;
    const own = objectives.filter((o) => o.orgUnitId === u.orgUnitId);
    return aggregateNode(
      key,
      'unit',
      names.get(u.orgUnitId) ?? '—',
      u.aggregate,
      own.map((o) => objectiveNode(o, key)),
    );
  });
}

function unitNode(
  u: PlanningUnitNodeDto,
  parentKey: string,
  byId: Map<string, PlanningObjectiveDto>,
): TreeNode {
  const key = `${parentKey}/u:${u.id}`;
  const children = [
    ...resolveObjectives(u.objectiveIds, byId).map((o) => objectiveNode(o, key)),
    ...u.children.map((c) => unitNode(c, key, byId)),
  ];
  // El agregado de la unidad es el del SUBÁRBOL (promedio simple de objetivos, sin cascada entre unidades).
  return aggregateNode(key, 'unit', u.name, u.aggregate, children);
}

const PLAN_KEY = 'plan';

/** Vista "Por ejes": Plan → Ejes → Unidades del eje → Objetivos, + "Sin eje". */
export function buildAxesTree(dto: PlanningTreeDto): TreeNode {
  const byId = indexObjectives(dto);
  const names = unitNamesById(dto);
  const axisNodes = dto.axes.map((axis) => {
    const key = `${PLAN_KEY}/a:${axis.id}`;
    return aggregateNode(
      key,
      'axis',
      axis.name,
      axis.aggregate,
      axisUnitNodes(key, axis.units, axis.objectiveIds, byId, names),
    );
  });
  const withoutAxisKey = `${PLAN_KEY}/a:none`;
  // "Sin eje" se muestra siempre, aunque esté vacío (decisión de Pedro, C21).
  const withoutAxis = [
    aggregateNode(
      withoutAxisKey,
      'withoutAxis',
      L.withoutAxis,
      dto.withoutAxis.aggregate,
      axisUnitNodes(
        withoutAxisKey,
        dto.withoutAxis.units,
        dto.withoutAxis.objectiveIds,
        byId,
        names,
      ),
    ),
  ];
  return planNode(dto, [...axisNodes, ...withoutAxis]);
}

/** Vista "Por unidades": Plan → árbol de unidades → Objetivos directos. */
export function buildUnitsTree(dto: PlanningTreeDto): TreeNode {
  const byId = indexObjectives(dto);
  const unitNodes = dto.units.map((u) => unitNode(u, PLAN_KEY, byId));
  return planNode(dto, unitNodes);
}

function planNode(dto: PlanningTreeDto, children: TreeNode[]): TreeNode {
  return aggregateNode(PLAN_KEY, 'plan', dto.plan.title ?? L.noPlan, dto.plan.aggregate, children);
}

export function buildTree(dto: PlanningTreeDto, view: PlanningTreeViewMode): TreeNode {
  return view === 'axes' ? buildAxesTree(dto) : buildUnitsTree(dto);
}

/** Claves de los nodos que se pueden colapsar (tienen hijos). */
export function expandableKeys(root: TreeNode): string[] {
  return [root, ...root.children.flatMap((c) => flatten(c))]
    .filter((n) => n.children.length > 0)
    .map((n) => n.key);
}

function flatten(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/** Hay algo para mostrar: al menos un objetivo en el período (con los filtros aplicados). */
export function hasObjectives(dto: PlanningTreeDto): boolean {
  return dto.objectives.length > 0;
}

/** Datos del tablero por eje (SPEC §5.2) para la pantalla de Plan de gobierno. */
export interface AxisBoard {
  readings: NodeReadings;
  objectivesCount: number;
  units: Array<{ key: string; name: string; objectivesCount: number; readings: NodeReadings }>;
}

export function buildAxisBoards(dto: PlanningTreeDto): Record<string, AxisBoard> {
  const names = unitNamesById(dto);
  return Object.fromEntries(
    dto.axes.map((axis): [string, AxisBoard] => [
      axis.id,
      {
        readings: readingsFromAggregate(axis.aggregate),
        objectivesCount: axis.aggregate.objectivesCount,
        units: axis.units.map((u) => ({
          key: u.orgUnitId,
          name: names.get(u.orgUnitId) ?? '—',
          objectivesCount: u.aggregate.objectivesCount,
          readings: readingsFromAggregate(u.aggregate),
        })),
      },
    ]),
  );
}

/** Estado por objetivo para el listado `/objectives`. */
export function indexObjectiveReadings(dto: PlanningTreeDto): Map<string, NodeReadings> {
  return new Map(dto.objectives.map((o) => [o.id, readingsFromObjective(o)]));
}
