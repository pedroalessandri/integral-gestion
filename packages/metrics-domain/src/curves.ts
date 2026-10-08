import { parseDecimal4, formatDecimal4 } from './decimal';
import { expectedAt } from './expected';
import { toUTCMidnight } from './buckets';
import type { EntryInput, PeriodRange } from './types';

/**
 * Curvas esperadas y cargas vencidas (RN-P15, RN-P17). El desvío y el semáforo (RN-P9) viven en
 * `@gestion-publica/deviation-domain`.
 * Todo exacto: valores como strings decimales (bigint escalado por dentro) y
 * desvíos / umbrales en puntos básicos enteros. Nunca floats (CLAUDE.md regla 7).
 */

export type ExpectedCurveMode = 'linear' | 'manual' | 'from_projects';

/** Punto de la curva manual: acumulado esperado en un bucket (`IndicatorTargetPoint`). */
export interface TargetPointInput {
  bucketDate: Date;
  expectedValue: string;
}

/** Aporte planificado de un proyecto: sube el esperado en `contributionValue` en `endsAt`. */
export interface ProjectStepInput {
  endsAt: Date;
  contributionValue: string;
}

interface ExpectedCurveBase {
  at: Date;
  range: PeriodRange;
  /** Línea base y meta del `ObjectiveIndicator` (D8). */
  baseline: string;
  target: string;
}

export type ExpectedCurveInput =
  | (ExpectedCurveBase & { mode: 'linear' })
  | (ExpectedCurveBase & { mode: 'manual'; points: ReadonlyArray<TargetPointInput> })
  | (ExpectedCurveBase & { mode: 'from_projects'; steps: ReadonlyArray<ProjectStepInput> });

/**
 * Valor esperado (acumulado, absoluto) a la fecha `at` según el modo (RN-P17):
 *  - `linear`: recta base → meta entre inicio y fin del período ({@link expectedAt}).
 *  - `manual`: interpolación lineal en el tiempo entre puntos. Antes del primer
 *    punto se interpola desde (inicio del período, base); después del último
 *    queda constante en su valor (la API garantiza que es la meta).
 *  - `from_projects`: escalonada. `baseline + Σ contributionValue` de los
 *    pasos con `endsAt <= at`. No se acota a la meta (la UI avisa si no llega).
 */
export function expectedCurve(input: ExpectedCurveInput): string {
  if (input.mode === 'linear') {
    return expectedAt(input.at, input.range, input.baseline, input.target);
  }

  const at = input.at.getTime();

  if (input.mode === 'from_projects') {
    let total = parseDecimal4(input.baseline);
    for (const step of input.steps) {
      if (step.endsAt.getTime() <= at) total += parseDecimal4(step.contributionValue);
    }
    return formatDecimal4(total);
  }

  // manual
  const anchors = [
    { ms: input.range.startsAt.getTime(), value: parseDecimal4(input.baseline) },
    ...input.points
      .map((p) => ({ ms: toUTCMidnight(p.bucketDate).getTime(), value: parseDecimal4(p.expectedValue) }))
      .sort((a, b) => a.ms - b.ms),
  ];

  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) return input.baseline;
  if (at <= first.ms) return formatDecimal4(first.value);
  if (at >= last.ms) return formatDecimal4(last.value);

  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const next = anchors[i];
    if (prev === undefined || next === undefined) continue;
    if (at <= next.ms) {
      const span = next.ms - prev.ms;
      if (span <= 0) return formatDecimal4(next.value);
      return formatDecimal4(prev.value + ((next.value - prev.value) * BigInt(at - prev.ms)) / BigInt(span));
    }
  }
  return formatDecimal4(last.value);
}

/** RN-P15: días de gracia por defecto (constante en esta fase). */
export const DEFAULT_GRACE_DAYS = 10;

const DAY_MS = 86_400_000;

/**
 * Buckets con carga vencida (RN-P15): los que están cerrados hace MÁS de
 * `graceDays` días y no tienen ningún entry (un entry con incremento 0 cuenta
 * como cargado).
 *
 * `buckets` son los inicios devueltos por `buildBuckets`; un bucket cierra
 * cuando empieza el siguiente y el último cierra en `periodEnd`. Con
 * `cierre = c`, está vencido si `hoy − c > graceDays` días (todo en UTC).
 * Devuelve los inicios vencidos en orden ascendente.
 */
export function pendingBuckets(
  entries: ReadonlyArray<Pick<EntryInput, 'bucketDate'>>,
  buckets: ReadonlyArray<Date>,
  today: Date,
  graceDays: number = DEFAULT_GRACE_DAYS,
  periodEnd?: Date,
): Date[] {
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    throw new RangeError('graceDays must be a non-negative integer');
  }
  const loaded = new Set(entries.map((e) => toUTCMidnight(e.bucketDate).getTime()));
  const todayMs = toUTCMidnight(today).getTime();
  const sorted = [...buckets].map(toUTCMidnight).sort((a, b) => a.getTime() - b.getTime());

  const pending: Date[] = [];
  sorted.forEach((start, i) => {
    const next = sorted[i + 1];
    const closeMs = next !== undefined ? next.getTime() : periodEnd ? toUTCMidnight(periodEnd).getTime() : undefined;
    if (closeMs === undefined) return; // sin cierre conocido: no se puede vencer
    if (loaded.has(start.getTime())) return;
    if (todayMs - closeMs > graceDays * DAY_MS) pending.push(start);
  });
  return pending;
}
