import type {
  ObjectiveExecutionStatusDto,
  ObjectiveResultStatusDto,
  SemaphoreColor,
} from '../metrics/indicator-status.dto.js';
import type { OrgUnitKind } from '../core/org-unit.dto.js';

/**
 * Árbol de planificación y tableros (RN-P10, SPEC §5.2/§5.3).
 *
 * GET /okr/planning-tree?periodId=&axisId=&orgUnitId=
 *   - `periodId` (opcional): período cuyos objetivos se muestran (un objetivo pertenece a un solo período). Sin él,
 *     el período abierto de la org; si no hay ninguno abierto, 404 `OpenPeriodNotFound`.
 *   - `axisId` (opcional): solo objetivos de ese eje. 404 si el eje no es del plan activo de la organización.
 *   - `orgUnitId` (opcional): solo objetivos de esa unidad y sus descendientes; `units` queda con esa unidad como
 *     única raíz. 404 si la unidad no existe en la organización.
 *
 * Reglas de lectura:
 *  - Resultado y gestión viajan SIEMPRE por separado; no existe un número combinado.
 *  - Todo valor es entero en bp (1 bp = 0,01 %; 10000 = 100 %). Redondeo y formato son del frontend.
 *  - Los desvíos son firmados: positivo = adelantado, negativo = atrasado (ver `ObjectiveStatusDto`).
 *  - `null` en un promedio o desvío agregado significa "no hay con qué calcularlo" (sin objetivos, o ningún
 *    objetivo con cargas en resultado). No es 0.
 *  - Un agregado (`PlanningAggregateDto`) es el promedio simple de los OBJETIVOS que contiene, en cada lectura;
 *    no hay cascada de avance entre unidades (ADR-0009, regla 4).
 *  - El filtro se aplica ANTES de agregar: con `axisId`/`orgUnitId`, `plan.aggregate` es el de los objetivos
 *    filtrados.
 */

/** Resumen de RESULTADO de un objetivo: lo mismo que `ObjectiveStatusDto.result`, sin el detalle por indicador. */
export type PlanningObjectiveResultDto = Omit<ObjectiveResultStatusDto, 'indicators'>;

/** Objetivo del árbol, con las dos lecturas (idénticas a las de GET /okr/objectives/:id/status). */
export interface PlanningObjectiveDto {
  id: string;
  title: string;
  /** Unidad del objetivo (siempre tiene una). */
  orgUnitId: string;
  /** Eje del plan activo; `null` si no tiene eje. */
  axisId: string | null;
  result: PlanningObjectiveResultDto;
  execution: ObjectiveExecutionStatusDto;
}

/** Agregado de resultado de un conjunto de objetivos. */
export interface PlanningResultAggregateDto {
  /** Promedio simple de `result.progressBp` de los objetivos (entero, truncado). `null` sin objetivos. */
  progressBp: number | null;
  /** Media simple de los desvíos de resultado MEDIBLES de los objetivos. `null` si ninguno tiene cargas. */
  deviationBp: number | null;
  /** Semáforo del desvío agregado (umbrales 10/25 puntos). `null` si `deviationBp` es `null`. */
  semaphore: SemaphoreColor | null;
  /** Suma de las cargas pendientes (buckets vencidos) de los objetivos. */
  pendingBucketsCount: number;
}

/** Agregado de gestión de un conjunto de objetivos. */
export interface PlanningExecutionAggregateDto {
  /** Promedio simple de `execution.progressBp` de los objetivos. `null` sin objetivos. */
  progressBp: number | null;
  /** Media simple de los desvíos de gestión. `null` sin objetivos. */
  deviationBp: number | null;
  semaphore: SemaphoreColor | null;
}

export interface PlanningAggregateDto {
  /** Cantidad de objetivos que entran en el agregado. */
  objectivesCount: number;
  result: PlanningResultAggregateDto;
  execution: PlanningExecutionAggregateDto;
}

/** Nodo raíz (N1): el plan de gobierno activo. `id`/`title` son `null` si la organización no tiene plan activo. */
export interface PlanningPlanNodeDto {
  id: string | null;
  title: string | null;
  /** Todos los objetivos del período (filtrados), tengan o no eje/unidad. */
  aggregate: PlanningAggregateDto;
}

/** Agregado de los objetivos DIRECTOS de una unidad dentro de un eje (o dentro de "sin eje"). */
export interface PlanningAxisUnitDto {
  orgUnitId: string;
  aggregate: PlanningAggregateDto;
}

/** Eje (N2) con sus objetivos y las unidades que aportan objetivos a ese eje (SPEC §5.2). */
export interface PlanningAxisNodeDto {
  id: string;
  name: string;
  order: number;
  aggregate: PlanningAggregateDto;
  /** Ids (de `PlanningTreeDto.objectives`) de los objetivos del eje. */
  objectiveIds: string[];
  /** Una entrada por unidad con objetivos en el eje (solo directos de esa unidad, no del subárbol). */
  units: PlanningAxisUnitDto[];
}

/** Objetivos sin eje ("Sin eje"). Siempre presente; `aggregate.objectivesCount = 0` si no hay. */
export interface PlanningWithoutAxisDto {
  aggregate: PlanningAggregateDto;
  objectiveIds: string[];
  units: PlanningAxisUnitDto[];
}

/** Unidad (N3) del árbol de `OrgUnit` completo, incluidas las unidades sin objetivos. */
export interface PlanningUnitNodeDto {
  id: string;
  name: string;
  kind: OrgUnitKind;
  order: number;
  /** Agregado del SUBÁRBOL: objetivos de la unidad y de todas sus descendientes (promedio simple de objetivos). */
  aggregate: PlanningAggregateDto;
  /** Agregado solo de los objetivos asignados directamente a la unidad. */
  directAggregate: PlanningAggregateDto;
  /** Ids (de `PlanningTreeDto.objectives`) de los objetivos asignados directamente a la unidad. */
  objectiveIds: string[];
  children: PlanningUnitNodeDto[];
}

export interface PlanningTreeDto {
  /** ISO-8601 UTC del momento de cálculo. */
  asOf: string;
  periodId: string;
  filters: { axisId: string | null; orgUnitId: string | null };
  plan: PlanningPlanNodeDto;
  /** Ejes del plan activo (todos, incluso sin objetivos), por `order`. Con `axisId` queda solo ese eje. */
  axes: PlanningAxisNodeDto[];
  withoutAxis: PlanningWithoutAxisDto;
  /** Árbol de unidades (raíz: la central). Con `orgUnitId` la raíz es esa unidad. */
  units: PlanningUnitNodeDto[];
  /** Lista plana de objetivos (filtrados), sin repetir: los nodos los referencian por id. */
  objectives: PlanningObjectiveDto[];
}
