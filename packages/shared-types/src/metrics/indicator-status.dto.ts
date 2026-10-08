import type { ExpectedCurveMode } from './objective-indicator.dto.js';

/**
 * Estado de un indicador y de un objetivo (RN-P9, RN-P15, RN-P17).
 *
 * Los desvíos son firmados y en puntos básicos (bp) del tramo: positivo = adelantado, negativo = atrasado.
 * La presentación (redondeo, % o puntos) es del frontend.
 */

export type SemaphoreColor = 'green' | 'yellow' | 'red';

/**
 * Resumen de los aportes de proyectos de un indicador `execution_feeds_indicator` (RN-P12, RN-P17). Sirve para el
 * aviso "los aportes no alcanzan la meta" (C18).
 */
export interface IndicatorContributionsSummaryDto {
  /** Cantidad de aportes de proyectos vivos. */
  count: number;
  /** Σ de `contributionValue` de los aportes vivos (decimal string). */
  total: string;
  /** Valor al que llegaría el indicador si todos los proyectos se completan: base + Σ aportes (decimal string). */
  projectedValue: string;
  /** `false` si base + Σ aportes no llega a la meta (según la dirección): la UI avisa. */
  coversTarget: boolean;
}

/** GET /okr/indicators/:id/status */
export interface IndicatorStatusDto {
  objectiveIndicatorId: string;
  objectiveId: string;
  expectedCurveMode: ExpectedCurveMode;
  /** `false` si la métrica no tiene cargas: no hay desvío ni semáforo ("sin datos"). */
  hasData: boolean;
  /** Fecha (YYYY-MM-DD) del último bucket cargado, contra el que se mide el desvío (RN-P9). `null` sin datos. */
  asOf: string | null;
  /** Valor acumulado actual (decimal string): base de la métrica + Σ incrementos. */
  actualValue: string;
  /** Esperado según la curva en `asOf` (decimal string). `null` sin datos. */
  expectedValue: string | null;
  /** Esperado según la curva HOY (decimal string), a modo informativo. */
  expectedToday: string;
  /** Desvío de resultado en bp del tramo base → meta. `null` sin datos. */
  deviationBp: number | null;
  /** Semáforo del desvío (umbrales 10/25 puntos). `null` sin datos. */
  semaphore: SemaphoreColor | null;
  /** Inicios (YYYY-MM-DD) de los buckets vencidos sin carga (cerrados hace más de `graceDays` días). */
  pendingBuckets: string[];
  /** Días de gracia aplicados (constante de la fase, RN-P15). */
  graceDays: number;
  /** Aportes de proyectos; `null` si el indicador no es `execution_feeds_indicator`. */
  contributions: IndicatorContributionsSummaryDto | null;
}

/** Lectura de RESULTADO de un objetivo: agrega sus indicadores. */
export interface ObjectiveResultStatusDto {
  /** `resultProgressCachedBp` del objetivo. */
  progressBp: number;
  /** Desvío agregado de los indicadores medibles (media simple o ponderada). `null` si ninguno tiene datos. */
  deviationBp: number | null;
  semaphore: SemaphoreColor | null;
  /** Suma de buckets vencidos de todos los indicadores. */
  pendingBucketsCount: number;
  indicators: IndicatorStatusDto[];
}

/** Lectura de GESTIÓN de un objetivo: avance real contra el planificado por fechas. */
export interface ObjectiveExecutionStatusDto {
  /** `executionProgressCachedBp` del objetivo. */
  progressBp: number;
  /** Avance planificado a hoy según las fechas de las tareas (bp). */
  plannedBp: number;
  /** progressBp − plannedBp. */
  deviationBp: number;
  semaphore: SemaphoreColor;
}

/**
 * GET /okr/objectives/:objectiveId/status. Las dos lecturas viajan separadas y NUNCA se combinan en un
 * número único (ADR-0009 D4, CLAUDE.md).
 */
export interface ObjectiveStatusDto {
  objectiveId: string;
  /** ISO-8601 UTC del momento de cálculo. */
  asOf: string;
  result: ObjectiveResultStatusDto;
  execution: ObjectiveExecutionStatusDto;
}
