import type { SemaphoreColor } from '../metrics/indicator-status.dto.js';
import type { OrgUnitKind } from '../core/org-unit.dto.js';
import type { TaskGanttDto } from './objective-gantt.dto.js';
import type { ProjectProgressMode } from './project.dto.js';

/**
 * Vista ejecutiva (Gantt) Objetivo -> Proyecto -> Tarea (SPEC §5.7, RN-P8/RN-P9).
 *
 * GET /okr/planning-gantt?periodId=&axisId=&orgUnitId=
 *   - `periodId` (opcional): período cuyos objetivos se listan. Sin él, el período abierto de la org; si no hay
 *     ninguno abierto, 404 `OpenPeriodNotFound`. Período inexistente o de otra org: 404.
 *   - `axisId` (opcional): solo objetivos de ese eje. 404 si el eje no es del plan activo de la organización.
 *   - `orgUnitId` (opcional): solo objetivos de esa unidad y sus descendientes. 404 si la unidad no existe.
 *   - Permiso `okr:read`; lectura abierta a toda la organización (RN-P20).
 *
 * Reglas de lectura:
 *  - Resultado y gestión viajan SIEMPRE por separado; no existe un número combinado.
 *  - Todo valor es entero en bp (1 bp = 0,01 %). Los desvíos son firmados (positivo = adelantado).
 *  - `result` y `execution` de cada objetivo son idénticos a los de GET /okr/objectives/:id/status y a los del
 *    árbol de planificación. Los proyectos solo traen su avance (cache), sin semáforo propio.
 *  - Un objetivo sin proyectos se incluye, con `startsAt`/`endsAt` en `null` y `projects: []`.
 *  - Orden: objetivos por `createdAt` asc; proyectos por `startsAt` asc; tareas por `startsAt` asc.
 */

/** Resumen de RESULTADO de un objetivo en el Gantt (sin detalle por indicador). */
export interface PlanningGanttResultDto {
  /** `resultProgressCachedBp` del objetivo. */
  progressBp: number;
  /** Desvío de los indicadores medibles. `null` si ninguno tiene cargas. */
  deviationBp: number | null;
  /** `null` si `deviationBp` es `null`. */
  semaphore: SemaphoreColor | null;
  /** Suma de cargas pendientes (buckets vencidos) de los indicadores. */
  pendingBucketsCount: number;
}

/** Resumen de GESTIÓN de un objetivo en el Gantt. */
export interface PlanningGanttExecutionDto {
  /** `executionProgressCachedBp` del objetivo. */
  progressBp: number;
  /** Avance planificado a `asOf` según las fechas de las tareas (bp). */
  plannedBp: number;
  /** progressBp - plannedBp. */
  deviationBp: number;
  semaphore: SemaphoreColor;
}

/** Proyecto (N5) con sus tareas. */
export interface ProjectGanttDto {
  id: string;
  title: string;
  orgUnitId: string;
  orgUnitName: string;
  /** Integer 0..10000. `Project.progressCachedBp` (cache). */
  progressBp: number;
  /** `from_tasks` | `from_indicator` (en este último las tareas son informativas). */
  progressMode: ProjectProgressMode;
  /** ISO-8601 UTC. Fechas PLANIFICADAS del proyecto (no derivadas de las tareas). */
  startsAt: string;
  endsAt: string;
  tasks: TaskGanttDto[];
}

/** Objetivo estratégico con sus proyectos. */
export interface ObjectivePlanGanttDto {
  id: string;
  title: string;
  orgUnitId: string;
  orgUnitName: string;
  orgUnitKind: OrgUnitKind;
  /** Eje del plan activo; `null` si no tiene (o si es de un plan archivado). */
  axisId: string | null;
  axisName: string | null;
  /** ISO-8601 UTC. min(project.startsAt); `null` si el objetivo no tiene proyectos. */
  startsAt: string | null;
  /** ISO-8601 UTC. max(project.endsAt); `null` si el objetivo no tiene proyectos. */
  endsAt: string | null;
  result: PlanningGanttResultDto;
  execution: PlanningGanttExecutionDto;
  projects: ProjectGanttDto[];
}

export interface PlanningGanttDto {
  /** ISO-8601 UTC del momento de cálculo. */
  asOf: string;
  /** Período efectivamente usado (el pedido o el abierto por defecto). */
  periodId: string;
  filters: { axisId: string | null; orgUnitId: string | null };
  objectives: ObjectivePlanGanttDto[];
}
