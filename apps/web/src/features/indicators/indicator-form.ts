import type {
  CreateObjectiveIndicatorDto,
  MetricDirection,
  MetricFrequency,
  MetricKind,
  MetricSummaryDto,
  IndicatorTargetPointDto,
  MetricUnit,
  ObjectiveIndicatorDto,
  ObjectiveIndicatorLinkMode,
  UpdateObjectiveIndicatorDto,
} from '@gestion-publica/shared-types/metrics';
import { scaleDecimal } from './decimal';
import { fromProjectsAvailability } from '@/features/contributions/contributions';
import {
  curveBuckets,
  pointsToValues,
  toEditableCurveMode,
  toTargetPointInputs,
  validateCurvePoints,
  type CurvePeriod,
  type EditableCurveMode,
  type PointValues,
} from './curve-form';

import { FROM_PROJECTS_UNAVAILABLE_LABELS } from '@/lib/labels';

export { DECIMAL_RE, scaleDecimal } from './decimal';

export type IndicatorSourceMode = 'existing' | 'new';

export interface IndicatorFormValues {
  sourceMode: IndicatorSourceMode;
  /** Solo con `sourceMode = 'existing'`. */
  metricId: string;
  /** Solo con `sourceMode = 'new'`. */
  name: string;
  unit: MetricUnit;
  frequency: MetricFrequency;
  kind: MetricKind;
  source: string;
  description: string;
  direction: MetricDirection;
  baselineValue: string;
  targetValue: string;
  /** Vínculo con la gestión (RN-P14b). */
  linkMode: ObjectiveIndicatorLinkMode;
  /** Curva esperada (RN-P17). `from_projects` exige `output` + `execution_feeds_indicator`. */
  curveMode: EditableCurveMode;
  /** Valores de la curva manual por inicio de bucket; el último bucket siempre vale la meta. */
  pointValues: PointValues;
}

export function emptyIndicatorForm(): IndicatorFormValues {
  return {
    sourceMode: 'new',
    metricId: '',
    name: '',
    unit: 'number',
    frequency: 'monthly',
    kind: 'output',
    source: '',
    description: '',
    direction: 'increasing',
    baselineValue: '0',
    targetValue: '',
    linkMode: 'independent',
    curveMode: 'linear',
    pointValues: {},
  };
}

export function indicatorToFormValues(
  indicator: ObjectiveIndicatorDto,
  metric: MetricSummaryDto | null,
  targetPoints: ReadonlyArray<IndicatorTargetPointDto> = [],
): IndicatorFormValues {
  return {
    sourceMode: 'existing',
    metricId: indicator.metricId,
    name: indicator.metricName,
    unit: indicator.unit,
    frequency: indicator.frequency,
    kind: indicator.kind,
    source: metric?.source ?? '',
    description: metric?.description ?? '',
    direction: indicator.direction,
    baselineValue: indicator.baselineValue,
    targetValue: indicator.targetValue,
    linkMode: indicator.linkMode,
    curveMode: toEditableCurveMode(indicator.expectedCurveMode),
    pointValues: pointsToValues(targetPoints),
  };
}

/** Al elegir una métrica existente, base, meta y dirección arrancan con los de la métrica (editables). */
export function applyExistingMetric(values: IndicatorFormValues, metric: MetricSummaryDto): IndicatorFormValues {
  return {
    ...values,
    metricId: metric.id,
    unit: metric.unit,
    frequency: metric.frequency,
    kind: metric.kind,
    direction: metric.direction,
    baselineValue: metric.baselineValue,
    targetValue: metric.targetValue,
  };
}

/** Valida base, meta y dirección con las mismas reglas que la API (422). `null` si está todo bien. */
export function validateBaselineTarget(baseline: string, target: string, direction: MetricDirection): string | null {
  const b = scaleDecimal(baseline);
  if (b === null) return 'La línea base debe ser un número (hasta 4 decimales).';
  const t = scaleDecimal(target);
  if (t === null) return 'La meta debe ser un número (hasta 4 decimales).';
  if (b === t) return 'La línea base y la meta no pueden ser iguales.';
  if (direction === 'increasing' && t < b) return 'Un indicador creciente necesita una meta mayor que la línea base.';
  if (direction === 'decreasing' && t > b) return 'Un indicador decreciente necesita una meta menor que la línea base.';
  return null;
}

/** Sugiere la dirección según base y meta; `null` si no se puede inferir. */
export function inferDirection(baseline: string, target: string): MetricDirection | null {
  const b = scaleDecimal(baseline);
  const t = scaleDecimal(target);
  if (b === null || t === null || b === t) return null;
  return t > b ? 'increasing' : 'decreasing';
}

export function validateIndicatorForm(
  values: IndicatorFormValues,
  editing: boolean,
  period: CurvePeriod,
): string | null {
  if (!editing) {
    if (values.sourceMode === 'existing' && values.metricId === '') return 'Elegí una métrica existente.';
    if (values.sourceMode === 'new' && values.name.trim() === '') return 'Ingresá un nombre para el indicador.';
  }
  const baseTarget = validateBaselineTarget(values.baselineValue, values.targetValue, values.direction);
  if (baseTarget) return baseTarget;
  if (values.linkMode === 'execution_feeds_indicator' && values.kind !== 'output') {
    return 'Solo los indicadores de tipo Producto pueden recibir aportes de proyectos.';
  }
  if (values.curveMode === 'from_projects') {
    const availability = fromProjectsAvailability(values);
    if (!availability.available) {
      return availability.reason === 'notOutput'
        ? FROM_PROJECTS_UNAVAILABLE_LABELS.notOutput
        : FROM_PROJECTS_UNAVAILABLE_LABELS.notLinked;
    }
  }
  if (values.curveMode === 'manual') {
    return validateCurvePoints(values.pointValues, curveBuckets(period, values.frequency), values.targetValue);
  }
  return null;
}

/**
 * Curva del indicador para el DTO. En `manual` siempre se mandan los puntos (la API los valida contra la meta
 * vigente: si la meta cambió, tienen que viajar en el mismo pedido). En `linear` solo el modo.
 */
function curveFields(values: IndicatorFormValues, period: CurvePeriod) {
  if (values.curveMode === 'manual') {
    const buckets = curveBuckets(period, values.frequency);
    return {
      expectedCurveMode: 'manual' as const,
      targetPoints: toTargetPointInputs(values.pointValues, buckets, values.targetValue),
    };
  }
  if (values.curveMode === 'from_projects') return { expectedCurveMode: 'from_projects' as const };
  return { expectedCurveMode: 'linear' as const };
}

/**
 * Crear con métrica existente o nueva en un solo paso. Sin `weightBp` salvo que el grupo ya esté ponderado: ahí va
 * `0` para que la suma siga en 10000 y se ajuste después con "Editar pesos" (mismo criterio que proyectos y tareas).
 */
export function toCreateIndicatorDto(
  values: IndicatorFormValues,
  groupWeighted: boolean,
  period: CurvePeriod,
): CreateObjectiveIndicatorDto {
  const common = {
    baselineValue: values.baselineValue.trim(),
    targetValue: values.targetValue.trim(),
    direction: values.direction,
    ...(groupWeighted && { weightBp: 0 }),
    ...(values.linkMode !== 'independent' && { linkMode: values.linkMode }),
    ...curveFields(values, period),
  };
  if (values.sourceMode === 'existing') return { metricId: values.metricId, ...common };
  const source = values.source.trim();
  const description = values.description.trim();
  return {
    metric: {
      name: values.name.trim(),
      unit: values.unit,
      frequency: values.frequency,
      kind: values.kind,
      ...(source !== '' && { source }),
      ...(description !== '' && { description }),
    },
    ...common,
  };
}

/** Base, meta, dirección y curva van al indicador (D8). Los pesos viajan solo por el PUT en bloque. */
export function toUpdateIndicatorDto(
  values: IndicatorFormValues,
  period: CurvePeriod,
  /** Vínculo actual: `linkMode` solo viaja si cambió (cambiarlo con proyectos vinculados da 422). */
  currentLinkMode: ObjectiveIndicatorLinkMode,
): UpdateObjectiveIndicatorDto {
  return {
    ...curveFields(values, period),
    ...(values.linkMode !== currentLinkMode && { linkMode: values.linkMode }),
    baselineValue: values.baselineValue.trim(),
    targetValue: values.targetValue.trim(),
    direction: values.direction,
  };
}

/** Tipo, fuente y descripción son atributos de la métrica: se mandan por su PATCH solo si cambiaron. */
export function toMetricAttributesPatch(
  values: IndicatorFormValues,
  current: { kind: MetricKind; source: string | null; description: string | null },
): { kind?: MetricKind; source?: string | null; description?: string | null } | null {
  const source = values.source.trim() === '' ? null : values.source.trim();
  const description = values.description.trim() === '' ? null : values.description.trim();
  const patch = {
    ...(values.kind !== current.kind && { kind: values.kind }),
    ...(source !== current.source && { source }),
    ...(description !== current.description && { description }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}
