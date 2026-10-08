import type {
  CreateObjectiveIndicatorDto,
  MetricDirection,
  MetricFrequency,
  MetricKind,
  MetricSummaryDto,
  MetricUnit,
  ObjectiveIndicatorDto,
  UpdateObjectiveIndicatorDto,
} from '@gestion-publica/shared-types/metrics';

/** Decimal con hasta 4 decimales, como lo valida la API (NUMERIC(18,4)). */
export const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

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
  };
}

export function indicatorToFormValues(indicator: ObjectiveIndicatorDto, metric: MetricSummaryDto | null): IndicatorFormValues {
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

const SCALE = 4;

/** Decimal string -> entero escalado 10^4, sin pasar por floats. `null` si no es un decimal válido. */
export function scaleDecimal(input: string): bigint | null {
  const value = input.trim();
  if (!DECIMAL_RE.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole = '0', frac = ''] = value.replace('-', '').split('.');
  const scaled = BigInt(whole + frac.padEnd(SCALE, '0'));
  return negative ? -scaled : scaled;
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

export function validateIndicatorForm(values: IndicatorFormValues, editing: boolean): string | null {
  if (!editing) {
    if (values.sourceMode === 'existing' && values.metricId === '') return 'Elegí una métrica existente.';
    if (values.sourceMode === 'new' && values.name.trim() === '') return 'Ingresá un nombre para el indicador.';
  }
  return validateBaselineTarget(values.baselineValue, values.targetValue, values.direction);
}

/**
 * Crear con métrica existente o nueva en un solo paso. Sin `weightBp` salvo que el grupo ya esté ponderado: ahí va
 * `0` para que la suma siga en 10000 y se ajuste después con "Editar pesos" (mismo criterio que proyectos y tareas).
 */
export function toCreateIndicatorDto(values: IndicatorFormValues, groupWeighted: boolean): CreateObjectiveIndicatorDto {
  const common = {
    baselineValue: values.baselineValue.trim(),
    targetValue: values.targetValue.trim(),
    direction: values.direction,
    ...(groupWeighted && { weightBp: 0 }),
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

/** Base, meta y dirección van al indicador (D8). Los pesos viajan solo por el PUT en bloque. */
export function toUpdateIndicatorDto(values: IndicatorFormValues): UpdateObjectiveIndicatorDto {
  return {
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
