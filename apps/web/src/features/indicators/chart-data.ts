import type { MetricSeriesDto } from '@gestion-publica/shared-types/metrics';

/**
 * El indicador manda sobre la métrica en base y meta (ADR-0009 D8) y `GET metrics/:id/series` calcula la curva
 * esperada con los de la métrica. Acá se redibuja la recta esperada lineal (RN-P17 `linear`, sin editor de curva)
 * con base y meta del indicador, sobre las mismas fechas de muestreo que devuelve la API. Es solo trazado del gráfico:
 * el avance y los desvíos los calcula el backend.
 */
export function withIndicatorLinearExpected(
  series: MetricSeriesDto,
  baselineValue: string,
  targetValue: string,
): MetricSeriesDto {
  const first = series.expected[0];
  const last = series.expected[series.expected.length - 1];
  if (!first || !last) return series;
  const start = new Date(first.date).getTime();
  const span = Math.max(1, new Date(last.date).getTime() - start);
  const baseline = Number(baselineValue);
  const target = Number(targetValue);
  return {
    ...series,
    expected: series.expected.map((p) => {
      const ratio = Math.min(1, Math.max(0, (new Date(p.date).getTime() - start) / span));
      return { date: p.date, value: String(baseline + (target - baseline) * ratio) };
    }),
  };
}
