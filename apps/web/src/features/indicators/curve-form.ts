import {
  buildBuckets,
  type MetricFrequency as DomainFrequency,
} from '@gestion-publica/metrics-domain';
import type {
  ExpectedCurveMode,
  IndicatorTargetPointDto,
  IndicatorTargetPointInput,
  MetricFrequency,
} from '@gestion-publica/shared-types/metrics';
import { scaleDecimal } from './decimal';

/** Modos que el editor permite elegir hoy. `from_projects` se rechaza en la API hasta C17 (RN-P17). */
export type EditableCurveMode = Exclude<ExpectedCurveMode, 'from_projects'>;

/** Período del objetivo (ISO-8601). Los buckets de carga y de la curva salen de él y de la frecuencia. */
export interface CurvePeriod {
  startsAt: string;
  endsAt: string;
}

/** Valores del editor de puntos por inicio de bucket (YYYY-MM-DD). Vacío = sin punto (se interpola). */
export type PointValues = Record<string, string>;

export function toEditableCurveMode(mode: ExpectedCurveMode): EditableCurveMode {
  return mode === 'manual' ? 'manual' : 'linear';
}

/**
 * Inicios de bucket (YYYY-MM-DD, UTC) de la frecuencia dentro del período: las fechas válidas de un punto manual.
 * Usa la misma función pura que la API (`buildBuckets`), así que el cliente y el servidor coinciden.
 */
export function curveBuckets(period: CurvePeriod, frequency: MetricFrequency): string[] {
  const startsAt = new Date(period.startsAt);
  const endsAt = new Date(period.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return [];
  return buildBuckets({ startsAt, endsAt }, frequency as DomainFrequency).map((d) => d.toISOString().slice(0, 10));
}

/** Los puntos guardados pasan a valores del editor. */
export function pointsToValues(points: ReadonlyArray<IndicatorTargetPointDto>): PointValues {
  return Object.fromEntries(points.map((p) => [p.bucketDate, p.expectedValue]));
}

/**
 * El ÚLTIMO bucket del período siempre vale la meta (RN-P17: el último punto es igual a la meta): el editor lo
 * muestra bloqueado, así la regla no puede romperse. El resto de los buckets son opcionales.
 */
export function isLockedBucket(buckets: ReadonlyArray<string>, bucketDate: string): boolean {
  return buckets.length > 0 && buckets[buckets.length - 1] === bucketDate;
}

/** Valida los puntos manuales con las mismas reglas que la API (422 `IndicatorTargetPointsInvalid`). */
export function validateCurvePoints(
  values: PointValues,
  buckets: ReadonlyArray<string>,
  targetValue: string,
): string | null {
  if (buckets.length === 0) return 'No pudimos calcular los intervalos del período. Revisá la frecuencia y el período.';
  if (scaleDecimal(targetValue) === null) return 'Completá una meta válida para armar la curva manual.';
  for (const bucket of buckets) {
    if (isLockedBucket(buckets, bucket)) continue;
    const raw = (values[bucket] ?? '').trim();
    if (raw === '') continue;
    if (scaleDecimal(raw) === null) {
      return `El valor del ${formatBucketDate(bucket)} debe ser un número (hasta 4 decimales).`;
    }
  }
  return null;
}

/** Puntos a enviar: los buckets con valor, más el último con la meta. Ordenados por fecha. */
export function toTargetPointInputs(
  values: PointValues,
  buckets: ReadonlyArray<string>,
  targetValue: string,
): IndicatorTargetPointInput[] {
  const points: IndicatorTargetPointInput[] = [];
  for (const bucket of buckets) {
    if (isLockedBucket(buckets, bucket)) {
      points.push({ bucketDate: bucket, expectedValue: targetValue.trim() });
      continue;
    }
    const raw = (values[bucket] ?? '').trim();
    if (raw !== '') points.push({ bucketDate: bucket, expectedValue: raw });
  }
  return points;
}

/** YYYY-MM-DD -> dd/mm/aaaa, sin pasar por zonas horarias. */
export function formatBucketDate(bucketDate: string): string {
  const [y, m, d] = bucketDate.split('-');
  return y && m && d ? `${d}/${m}/${y}` : bucketDate;
}
