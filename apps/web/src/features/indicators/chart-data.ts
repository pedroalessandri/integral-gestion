import { expectedCurve } from '@gestion-publica/metrics-domain';
import type {
  ExpectedCurveMode,
  IndicatorTargetPointDto,
  MetricSeriesDto,
  ProjectContributionDto,
} from '@gestion-publica/shared-types/metrics';
import { contributionSteps } from '@/features/contributions/contributions';

export interface ExpectedCurveChartInput {
  mode: ExpectedCurveMode;
  /** Base y meta del indicador (D8), no las de la métrica. */
  baselineValue: string;
  targetValue: string;
  /** Puntos de la curva manual (RN-P17). */
  targetPoints: ReadonlyArray<IndicatorTargetPointDto>;
  /** Período del indicador (ISO-8601). */
  period: { startsAt: string; endsAt: string };
  /** Pasos de la curva `from_projects` (RN-P17): `endsAt` planificado del proyecto + su aporte. */
  steps?: ReadonlyArray<{ endsAt: string; contributionValue: string }>;
}

/**
 * `GET metrics/:id/series` arma la curva esperada lineal con la base y la meta de la métrica (D8). Acá se vuelve a
 * evaluar con la base y la meta del indicador y con su modo de curva (RN-P17), sobre las mismas fechas de muestreo
 * que devuelve la API (inicio de cada bucket + fin del período). Como los puntos manuales caen en inicios de bucket,
 * el muestreo traza la poligonal exacta. La función es `expectedCurve` de `metrics-domain`, la misma que usa el
 * backend para el desvío: no se reimplementa acá. `from_projects` se dibuja escalonada con los pasos
 * de los aportes; sin ellos se deja la serie de la API.
 */
export function withIndicatorExpectedCurve(series: MetricSeriesDto, input: ExpectedCurveChartInput): MetricSeriesDto {
  if (series.expected.length === 0) return series;
  if (input.mode === 'from_projects' && input.steps === undefined) return series;
  const startsAt = new Date(input.period.startsAt);
  const endsAt = new Date(input.period.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return series;
  const range = { startsAt, endsAt };
  const base = { range, baseline: input.baselineValue, target: input.targetValue };
  const points = input.targetPoints.map((p) => ({
    bucketDate: new Date(`${p.bucketDate}T00:00:00.000Z`),
    expectedValue: p.expectedValue,
  }));
  // `expectedCurve` evalúa el instante exacto del inicio del período como la base, aunque haya un punto manual en
  // esa fecha (el salto ocurre apenas después). En el gráfico, en la fecha de un punto se dibuja el valor del punto.
  if (input.mode === 'from_projects') {
    return { ...series, expected: stepCurve(series, input, range, base) };
  }
  const pointByTime = new Map(points.map((p) => [p.bucketDate.getTime(), p.expectedValue]));
  return {
    ...series,
    expected: series.expected.map((p) => {
      const at = new Date(p.date);
      if (input.mode === 'manual') {
        const value = pointByTime.get(at.getTime()) ?? expectedCurve({ mode: 'manual', at, points, ...base });
        return { date: p.date, value };
      }
      return { date: p.date, value: expectedCurve({ mode: 'linear', at, ...base }) };
    }),
  };
}

/**
 * Curva `from_projects`: sube en el `endsAt` de cada proyecto. Como el gráfico une los puntos con rectas, además de
 * las fechas de muestreo de la API se agregan, por cada paso, el instante anterior y el del paso, así que se ve el
 * escalón en lugar de una diagonal. Los valores salen de `expectedCurve` (metrics-domain).
 */
function stepCurve(
  series: MetricSeriesDto,
  input: ExpectedCurveChartInput,
  range: { startsAt: Date; endsAt: Date },
  base: { range: { startsAt: Date; endsAt: Date }; baseline: string; target: string },
) {
  const steps = (input.steps ?? []).flatMap((s) => {
    const endsAt = new Date(s.endsAt);
    return Number.isNaN(endsAt.getTime()) ? [] : [{ endsAt, contributionValue: s.contributionValue }];
  });
  const times = new Set(series.expected.map((p) => new Date(p.date).getTime()));
  for (const step of steps) {
    const t = step.endsAt.getTime();
    if (t < range.startsAt.getTime() || t > range.endsAt.getTime()) continue;
    times.add(t);
    if (t - 1 >= range.startsAt.getTime()) times.add(t - 1);
  }
  return [...times]
    .sort((a, b) => a - b)
    .map((t) => {
      const at = new Date(t);
      return { date: at.toISOString(), value: expectedCurve({ mode: 'from_projects', at, steps, ...base }) };
    });
}

/**
 * Serie a graficar para un indicador. Si es manual y no se pudieron cargar sus puntos, se deja la serie de la API
 * (lineal con base y meta de la métrica) antes que dibujar una curva falsa; el llamador avisa el error.
 */
export function seriesForIndicator(
  series: MetricSeriesDto,
  indicator: { expectedCurveMode: ExpectedCurveMode; baselineValue: string; targetValue: string },
  targetPoints: ReadonlyArray<IndicatorTargetPointDto> | null,
  period: { startsAt: string; endsAt: string },
  /** Aportes del indicador; `null` si no se pudieron cargar (se deja la serie de la API). */
  contributions: ReadonlyArray<Pick<ProjectContributionDto, 'projectEndsAt' | 'contributionValue'>> | null = null,
): MetricSeriesDto {
  if (indicator.expectedCurveMode === 'manual' && targetPoints === null) return series;
  if (indicator.expectedCurveMode === 'from_projects' && contributions === null) return series;
  return withIndicatorExpectedCurve(series, {
    mode: indicator.expectedCurveMode,
    baselineValue: indicator.baselineValue,
    targetValue: indicator.targetValue,
    targetPoints: targetPoints ?? [],
    period,
    ...(contributions && { steps: contributionSteps(contributions) }),
  });
}
