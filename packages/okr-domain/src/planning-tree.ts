import { aggregateDeviationBp, semaphore, type SemaphoreColor } from '@gestion-publica/deviation-domain';

/**
 * Agregación del árbol de planificación (RN-P10, ADR-0009 regla 4). Puro, sin DB.
 *
 * - NO hay cascada de avance entre unidades: el avance de una unidad, un eje o el plan es el promedio simple de
 *   los OBJETIVOS que lo componen (no el promedio de los promedios de sus hijos), por lectura.
 * - Las dos lecturas (resultado y gestión) se agregan por separado y nunca se combinan en un número único.
 * - Todo es entero en bp; el promedio trunca hacia cero (mismo criterio que `aggregateDeviationBp`).
 */

/** Lectura de un objetivo ya resuelta (cachés + desvíos de cada lectura). */
export interface ObjectiveReadingInput {
  id: string;
  orgUnitId: string;
  axisId: string | null;
  /** `resultProgressCachedBp`. */
  resultProgressBp: number;
  /** `executionProgressCachedBp`. */
  executionProgressBp: number;
  /** Desvío de resultado; `null` si ningún indicador tiene datos (no cuenta en el promedio). */
  resultDeviationBp: number | null;
  /** Desvío de gestión (real − planificado). */
  executionDeviationBp: number;
  /** Buckets vencidos sin carga, sumados de todos los indicadores del objetivo. */
  pendingBucketsCount: number;
}

export interface ReadingAggregate {
  objectivesCount: number;
  result: {
    /** Promedio simple de `resultProgressBp`; `null` sin objetivos. */
    progressBp: number | null;
    /** Media simple de los desvíos medibles; `null` si ninguno lo es. */
    deviationBp: number | null;
    semaphore: SemaphoreColor | null;
    /** Suma de las cargas pendientes de los objetivos. */
    pendingBucketsCount: number;
  };
  execution: {
    progressBp: number | null;
    deviationBp: number | null;
    semaphore: SemaphoreColor | null;
  };
}

function meanBp(values: ReadonlyArray<number>): number | null {
  if (values.length === 0) return null;
  for (const v of values) {
    if (!Number.isInteger(v)) throw new RangeError('bp values must be integers');
  }
  const sum = values.reduce((acc, v) => acc + BigInt(v), 0n);
  return Number(sum / BigInt(values.length));
}

function simpleDeviation(values: ReadonlyArray<number | null>): number | null {
  return aggregateDeviationBp(values.map((deviationBp) => ({ weightBp: null, deviationBp })));
}

/** Agrega un conjunto de objetivos: promedio simple por lectura, desvío medio, semáforo y cargas pendientes. */
export function aggregateObjectiveReadings(items: ReadonlyArray<ObjectiveReadingInput>): ReadingAggregate {
  const resultDeviation = simpleDeviation(items.map((i) => i.resultDeviationBp));
  const executionDeviation = simpleDeviation(items.map((i) => i.executionDeviationBp));
  return {
    objectivesCount: items.length,
    result: {
      progressBp: meanBp(items.map((i) => i.resultProgressBp)),
      deviationBp: resultDeviation,
      semaphore: resultDeviation === null ? null : semaphore(resultDeviation),
      pendingBucketsCount: items.reduce((acc, i) => acc + i.pendingBucketsCount, 0),
    },
    execution: {
      progressBp: meanBp(items.map((i) => i.executionProgressBp)),
      deviationBp: executionDeviation,
      semaphore: executionDeviation === null ? null : semaphore(executionDeviation),
    },
  };
}

/** Agrupa por una clave (`null` = sin asignar) y agrega cada grupo. Conserva el orden de primera aparición. */
export function aggregateObjectiveReadingsBy<K extends string | null>(
  items: ReadonlyArray<ObjectiveReadingInput>,
  keyOf: (item: ObjectiveReadingInput) => K,
): Map<K, ReadingAggregate> {
  const groups = new Map<K, ObjectiveReadingInput[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return new Map([...groups].map(([key, group]) => [key, aggregateObjectiveReadings(group)]));
}

export interface OrgUnitTreeInput {
  id: string;
  parentId: string | null;
  order: number;
  name: string;
}

export interface UnitAggregateNode {
  orgUnitId: string;
  /** Ids de los objetivos asignados directamente a la unidad. */
  objectiveIds: string[];
  /** Agregado del SUBÁRBOL: objetivos de la unidad y de todas sus descendientes (promedio de objetivos). */
  aggregate: ReadingAggregate;
  /** Agregado solo de los objetivos directos de la unidad. */
  directAggregate: ReadingAggregate;
  children: UnitAggregateNode[];
}

export interface UnitAggregates {
  roots: UnitAggregateNode[];
}

/**
 * Arma el árbol de unidades con el agregado de cada nodo. Incluye las unidades sin objetivos (agregado vacío).
 * Hermanos ordenados por `order` y luego por nombre. Las raíces son las unidades sin padre (o cuyo padre no está
 * en la lista). Tolera ciclos en datos corruptos (cada unidad se visita una sola vez).
 */
export function buildUnitAggregates(
  units: ReadonlyArray<OrgUnitTreeInput>,
  objectives: ReadonlyArray<ObjectiveReadingInput>,
): UnitAggregates {
  const unitIds = new Set(units.map((u) => u.id));
  const childrenOf = new Map<string, OrgUnitTreeInput[]>();
  const roots: OrgUnitTreeInput[] = [];
  for (const unit of units) {
    if (unit.parentId !== null && unitIds.has(unit.parentId) && unit.parentId !== unit.id) {
      const siblings = childrenOf.get(unit.parentId);
      if (siblings) siblings.push(unit);
      else childrenOf.set(unit.parentId, [unit]);
    } else {
      roots.push(unit);
    }
  }
  const byOrder = (a: OrgUnitTreeInput, b: OrgUnitTreeInput) => a.order - b.order || a.name.localeCompare(b.name);

  const directOf = new Map<string, ObjectiveReadingInput[]>();
  // Todo objetivo tiene unidad (NOT NULL desde F10). Los de una unidad que no está en la lista no se muestran.
  for (const o of objectives) {
    if (!unitIds.has(o.orgUnitId)) continue;
    const list = directOf.get(o.orgUnitId);
    if (list) list.push(o);
    else directOf.set(o.orgUnitId, [o]);
  }

  const visited = new Set<string>();
  const build = (unit: OrgUnitTreeInput): { node: UnitAggregateNode; subtree: ObjectiveReadingInput[] } => {
    visited.add(unit.id);
    const direct = directOf.get(unit.id) ?? [];
    const children = (childrenOf.get(unit.id) ?? []).filter((c) => !visited.has(c.id)).sort(byOrder).map(build);
    const subtree = [...direct, ...children.flatMap((c) => c.subtree)];
    return {
      subtree,
      node: {
        orgUnitId: unit.id,
        objectiveIds: direct.map((o) => o.id),
        aggregate: aggregateObjectiveReadings(subtree),
        directAggregate: aggregateObjectiveReadings(direct),
        children: children.map((c) => c.node),
      },
    };
  };

  const builtRoots = roots.sort(byOrder).map((r) => build(r).node);
  // Unidades inalcanzables (ciclo en datos corruptos): sus objetivos no se muestran en el árbol.

  return { roots: builtRoots };
}

/** Ids de la unidad y de todas sus descendientes (para el filtro por unidad). Vacío si la unidad no existe. */
export function unitSubtreeIds(units: ReadonlyArray<OrgUnitTreeInput>, rootId: string): Set<string> {
  const result = new Set<string>();
  if (!units.some((u) => u.id === rootId)) return result;
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (result.has(id)) continue;
    result.add(id);
    for (const u of units) if (u.parentId === id) stack.push(u.id);
  }
  return result;
}
