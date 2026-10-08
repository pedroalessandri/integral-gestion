import type { MetricDirection, MetricFrequency, MetricKind, MetricUnit } from './metric.dto.js';

/**
 * ObjectiveIndicator (N4, ADR-0009 D2/D8): vínculo objetivo <-> métrica con base, meta, dirección y peso
 * opcional. Manda sobre Metric para el avance del objetivo. Decimales como string, pesos y avances en bp.
 */

export type ExpectedCurveMode = 'linear' | 'manual' | 'from_projects';
/** RN-P14b: vínculo del indicador con la gestión. */
export type ObjectiveIndicatorLinkMode =
  | 'independent'
  | 'execution_feeds_indicator'
  | 'indicator_feeds_execution';

export interface ObjectiveIndicatorDto {
  id: string;
  objectiveId: string;
  metricId: string;
  metricName: string;
  unit: MetricUnit;
  frequency: MetricFrequency;
  kind: MetricKind;
  /** Decimal string. Manda sobre la base de la métrica (D8). */
  baselineValue: string;
  /** Decimal string. */
  targetValue: string;
  direction: MetricDirection;
  /** `null` si el grupo de indicadores del objetivo no pondera (RN-P6). */
  weightBp: number | null;
  expectedCurveMode: ExpectedCurveMode;
  linkMode: ObjectiveIndicatorLinkMode;
  /** Valor acumulado actual de la métrica (base de la métrica + Σ incrementos), decimal string. */
  lastValue: string;
  /** `false` si la métrica todavía no tiene cargas ("sin datos"); el avance es 0. */
  hasData: boolean;
  /** Avance de este indicador en bp (0..10000). */
  progressCachedBp: number;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** Datos de la métrica nueva cuando se crea el indicador en un solo paso. Dirección, base y meta salen del indicador. */
export interface CreateInlineMetricDto {
  name: string;
  unit: MetricUnit;
  frequency: MetricFrequency;
  kind: MetricKind;
  source?: string;
  description?: string;
}

/**
 * POST /okr/objectives/:objectiveId/indicators — exactamente uno entre `metricId` (métrica existente
 * del mismo período) y `metric` (métrica nueva, se crea en el período del objetivo en la misma transacción).
 */
export interface CreateObjectiveIndicatorDto {
  metricId?: string;
  metric?: CreateInlineMetricDto;
  /** Decimal string. Con métrica existente, por defecto la base de la métrica; con métrica nueva, por defecto 0. */
  baselineValue?: string;
  /** Decimal string. Obligatoria con métrica nueva; con existente, por defecto la meta de la métrica. */
  targetValue?: string;
  /** Con métrica existente, por defecto la de la métrica; obligatoria con métrica nueva. */
  direction?: MetricDirection;
  /** Entero 0..10000. Todo-o-nada con los hermanos (RN-P6). */
  weightBp?: number | null;
  linkMode?: ObjectiveIndicatorLinkMode;
  /**
   * Curva esperada (RN-P17). Por defecto `linear`. `manual` exige `targetPoints` válidos en el mismo pedido.
   * `from_projects` se rechaza con 422 `ExpectedCurveModeNotAvailable` hasta que existan los aportes (F7).
   */
  expectedCurveMode?: ExpectedCurveMode;
  /** Puntos de la curva manual. Solo con `expectedCurveMode = 'manual'`. */
  targetPoints?: IndicatorTargetPointInput[];
}

/** PATCH /okr/indicators/:id. La métrica no se cambia (borrar y crear otro indicador). */
export interface UpdateObjectiveIndicatorDto {
  baselineValue?: string;
  targetValue?: string;
  direction?: MetricDirection;
  weightBp?: number | null;
  linkMode?: ObjectiveIndicatorLinkMode;
  /**
   * Cambia el modo de curva. `manual` exige puntos válidos (los guardados o `targetPoints` en este pedido).
   * `from_projects` se rechaza con 422 hasta F7.
   */
  expectedCurveMode?: ExpectedCurveMode;
  /** Reemplaza los puntos de la curva manual en el mismo pedido (se validan contra la meta resultante). */
  targetPoints?: IndicatorTargetPointInput[];
}

/** Punto de la curva esperada manual (RN-P17): acumulado esperado absoluto en un bucket. */
export interface IndicatorTargetPointInput {
  /** YYYY-MM-DD: inicio de un bucket de la frecuencia de la métrica dentro del período. */
  bucketDate: string;
  /** Decimal string (hasta 4 decimales). */
  expectedValue: string;
}

export type IndicatorTargetPointDto = IndicatorTargetPointInput;

/** PUT /okr/indicators/:id/target-points — reemplazo atómico de todos los puntos. El último debe ser igual a la meta. */
export interface SetIndicatorTargetPointsDto {
  points: IndicatorTargetPointInput[];
}

/** PUT /okr/objectives/:objectiveId/indicators/weights — reemplazo atómico de todo el grupo (RN-P6/P7). */
export interface SetObjectiveIndicatorWeightsDto {
  weights: Array<{ id: string; weightBp: number | null }>;
}
