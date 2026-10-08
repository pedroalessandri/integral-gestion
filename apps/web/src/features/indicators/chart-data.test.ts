import { describe, expect, it } from 'vitest';
import type { MetricSeriesDto } from '@gestion-publica/shared-types/metrics';
import { withIndicatorExpectedCurve } from './chart-data';

const period = { startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-12-31T00:00:00.000Z' };

const series: MetricSeriesDto = {
  expected: [
    { date: '2027-01-01T00:00:00.000Z', value: '0' },
    { date: '2027-07-01T00:00:00.000Z', value: '50' },
    { date: '2027-12-31T00:00:00.000Z', value: '100' },
  ],
  actual: [{ bucketDate: '2027-01-01T00:00:00.000Z', cumulativeValue: '5' }],
  summary: { cumulative: '5', expectedToDate: '0', deviationPct: 0 },
};

const values = (s: MetricSeriesDto) => s.expected.map((p) => Number(p.value));

describe('withIndicatorExpectedCurve', () => {
  it('lineal: redibuja la recta con base y meta del indicador y respeta fechas y cargas reales', () => {
    const out = withIndicatorExpectedCurve(series, {
      mode: 'linear',
      baselineValue: '10',
      targetValue: '30',
      targetPoints: [],
      period,
    });
    expect(out.expected.map((p) => p.date)).toEqual(series.expected.map((p) => p.date));
    const [first, mid, last] = values(out);
    expect(first).toBe(10);
    expect(last).toBe(30);
    expect(mid).toBeGreaterThan(19);
    expect(mid).toBeLessThan(21);
    expect(out.actual).toBe(series.actual);
  });

  it('lineal: soporta indicadores decrecientes', () => {
    const out = withIndicatorExpectedCurve(series, {
      mode: 'linear',
      baselineValue: '40',
      targetValue: '10',
      targetPoints: [],
      period,
    });
    expect(values(out)[2]).toBe(10);
    expect(values(out)[1]).toBeLessThan(40);
  });

  it('manual: pasa por los puntos y interpola desde la base hasta el primero', () => {
    const out = withIndicatorExpectedCurve(series, {
      mode: 'manual',
      baselineValue: '0',
      targetValue: '30',
      targetPoints: [
        { bucketDate: '2027-01-01', expectedValue: '18' },
        { bucketDate: '2027-07-01', expectedValue: '30' },
      ],
      period,
    });
    expect(values(out)).toEqual([18, 30, 30]);
  });

  it('manual: sin punto en el inicio, parte de la base y llega al primer punto', () => {
    const out = withIndicatorExpectedCurve(series, {
      mode: 'manual',
      baselineValue: '0',
      targetValue: '10',
      targetPoints: [{ bucketDate: '2027-07-01', expectedValue: '10' }],
      period,
    });
    expect(values(out)).toEqual([0, 10, 10]);
  });

  it('from_projects o sin muestras: devuelve la serie intacta', () => {
    const input = { baselineValue: '0', targetValue: '1', targetPoints: [], period };
    expect(withIndicatorExpectedCurve(series, { ...input, mode: 'from_projects' })).toBe(series);
    const empty = { ...series, expected: [] };
    expect(withIndicatorExpectedCurve(empty, { ...input, mode: 'linear' })).toBe(empty);
  });
});
