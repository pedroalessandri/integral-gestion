import { UnprocessableEntityException } from '@nestjs/common';
import {
  formatDecimal4,
  isValidBucketDate,
  parseDecimal4,
  type MetricFrequency,
  type PeriodRange,
  type TargetPointInput,
} from '@gestion-publica/metrics-domain';

/** Punto ya validado: fecha de bucket en UTC y valor decimal canónico. */
export interface ValidTargetPoint {
  bucketDate: Date;
  expectedValue: string;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Dos listas de puntos son iguales si coinciden fecha y valor (comparando los decimales como enteros escalados). */
export function sameTargetPoints(
  a: ReadonlyArray<{ bucketDate: Date; expectedValue: string }>,
  b: ReadonlyArray<{ bucketDate: Date; expectedValue: string }>,
): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x.bucketDate.getTime() - y.bucketDate.getTime());
  const sb = [...b].sort((x, y) => x.bucketDate.getTime() - y.bucketDate.getTime());
  return sa.every((p, i) => {
    const q = sb[i] as { bucketDate: Date; expectedValue: string };
    return p.bucketDate.getTime() === q.bucketDate.getTime() && parseDecimal4(p.expectedValue) === parseDecimal4(q.expectedValue);
  });
}

function invalid(reason: string): UnprocessableEntityException {
  return new UnprocessableEntityException(`IndicatorTargetPointsInvalid: ${reason}`);
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toDateOnly(date) !== value) {
    throw invalid(`"${value}" no es una fecha válida.`);
  }
  return date;
}

/**
 * Valida y normaliza los puntos de una curva manual (RN-P17):
 *  - cada fecha es un inicio de bucket de la frecuencia de la métrica dentro del período;
 *  - sin fechas repetidas;
 *  - el ÚLTIMO punto (por fecha) es igual a la meta del indicador.
 * Devuelve los puntos ordenados por fecha. Con lista vacía devuelve `[]` (el llamador decide si es válido).
 *
 * @throws UnprocessableEntityException `IndicatorTargetPointsInvalid` con el motivo.
 */
export function validateTargetPoints(
  points: ReadonlyArray<{ bucketDate: string; expectedValue: string }>,
  ctx: { range: PeriodRange; frequency: MetricFrequency; target: string },
): ValidTargetPoint[] {
  const seen = new Set<number>();
  const parsed = points.map((p) => {
    const bucketDate = parseDateOnly(p.bucketDate);
    if (!isValidBucketDate(bucketDate, ctx.range, ctx.frequency)) {
      throw invalid(
        `${p.bucketDate} no es el inicio de un bucket ${ctx.frequency} dentro del período del indicador.`,
      );
    }
    if (seen.has(bucketDate.getTime())) {
      throw invalid(`hay más de un punto para el bucket ${p.bucketDate}.`);
    }
    seen.add(bucketDate.getTime());
    return { bucketDate, expectedValue: formatDecimal4(parseDecimal4(p.expectedValue)) };
  });
  parsed.sort((a, b) => a.bucketDate.getTime() - b.bucketDate.getTime());

  const last = parsed[parsed.length - 1];
  if (last !== undefined && parseDecimal4(last.expectedValue) !== parseDecimal4(ctx.target)) {
    throw invalid(
      `el último punto (${toDateOnly(last.bucketDate)}) debe ser igual a la meta del indicador (${formatDecimal4(parseDecimal4(ctx.target))}), pero vale ${last.expectedValue} (RN-P17).`,
    );
  }
  return parsed;
}

/** Puntos persistidos -> entrada de `expectedCurve` (metrics-domain). */
export function toCurvePoints(
  rows: ReadonlyArray<{ bucketDate: Date; expectedValue: { toString(): string } }>,
): TargetPointInput[] {
  return rows.map((r) => ({ bucketDate: r.bucketDate, expectedValue: r.expectedValue.toString() }));
}
