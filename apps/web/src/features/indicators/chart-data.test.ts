import { describe, expect, it } from 'vitest';
import type { MetricSeriesDto } from '@gestion-publica/shared-types/metrics';
import { withIndicatorLinearExpected } from './chart-data';

const series: MetricSeriesDto = {
  expected: [
    { date: '2027-01-01T00:00:00.000Z', value: '0' },
    { date: '2027-07-02T00:00:00.000Z', value: '50' },
    { date: '2027-12-31T00:00:00.000Z', value: '100' },
  ],
  actual: [{ bucketDate: '2027-01-01T00:00:00.000Z', cumulativeValue: '5' }],
  summary: { cumulative: '5', expectedToDate: '0', deviationPct: 0 },
};

describe('withIndicatorLinearExpected', () => {
  it('redibuja la recta con base y meta del indicador y respeta fechas y cargas reales', () => {
    const out = withIndicatorLinearExpected(series, '10', '30');
    expect(out.expected.map((p) => p.date)).toEqual(series.expected.map((p) => p.date));
    expect(Number(out.expected[0]?.value)).toBe(10);
    expect(Number(out.expected[2]?.value)).toBe(30);
    expect(Number(out.expected[1]?.value)).toBeGreaterThan(19);
    expect(Number(out.expected[1]?.value)).toBeLessThan(21);
    expect(out.actual).toBe(series.actual);
  });
  it('soporta indicadores decrecientes', () => {
    const out = withIndicatorLinearExpected(series, '40', '10');
    expect(Number(out.expected[2]?.value)).toBe(10);
    expect(Number(out.expected[1]?.value)).toBeLessThan(40);
  });
  it('devuelve la serie intacta si no hay puntos esperados', () => {
    const empty = { ...series, expected: [] };
    expect(withIndicatorLinearExpected(empty, '0', '1')).toBe(empty);
  });
});
