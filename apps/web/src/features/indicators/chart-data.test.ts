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

describe('withIndicatorExpectedCurve: from_projects', () => {
  const fp = (steps: Array<{ endsAt: string; contributionValue: string }> | undefined) =>
    withIndicatorExpectedCurve(series, {
      mode: 'from_projects',
      baselineValue: '10',
      targetValue: '20',
      targetPoints: [],
      period,
      ...(steps && { steps }),
    });
  it('sin pasos disponibles deja la serie de la API', () => {
    expect(fp(undefined)).toBe(series);
  });
  it('dibuja la escalera: sube en el endsAt de cada proyecto y no antes', () => {
    const out = fp([
      { endsAt: '2027-03-31T00:00:00.000Z', contributionValue: '4' },
      { endsAt: '2027-09-30T00:00:00.000Z', contributionValue: '6' },
    ]);
    const at = (iso: string) => out.expected.find((p) => p.date === iso)?.value;
    expect(Number(at('2027-01-01T00:00:00.000Z'))).toBe(10);
    expect(Number(at('2027-03-30T23:59:59.999Z'))).toBe(10);
    expect(Number(at('2027-03-31T00:00:00.000Z'))).toBe(14);
    expect(Number(at('2027-09-30T00:00:00.000Z'))).toBe(20);
    expect(Number(at('2027-12-31T00:00:00.000Z'))).toBe(20);
    const times = out.expected.map((p) => new Date(p.date).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
  it('un paso fuera del período no agrega puntos de muestreo', () => {
    const out = fp([{ endsAt: '2028-03-31T00:00:00.000Z', contributionValue: '4' }]);
    expect(out.expected).toHaveLength(series.expected.length);
    expect(values(out).every((v) => v === 10)).toBe(true);
  });
});
