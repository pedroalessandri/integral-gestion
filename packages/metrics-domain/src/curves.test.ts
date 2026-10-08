import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  expectedCurve,
  pendingBuckets,
} from './curves';
import { buildBuckets } from './buckets';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const range = { startsAt: d('2026-01-01'), endsAt: d('2026-12-31') };
const base = { range, baseline: '0', target: '100' };

describe('expectedCurve linear', () => {
  it('coincide con expectedAt', () => {
    const r = { startsAt: d('2026-04-01'), endsAt: d('2026-04-11') };
    expect(
      expectedCurve({ mode: 'linear', at: d('2026-04-06'), range: r, baseline: '0', target: '100' }),
    ).toBe('50');
  });
});

describe('expectedCurve manual', () => {
  const points = [
    { bucketDate: d('2026-07-01'), expectedValue: '30' },
    { bucketDate: d('2026-12-31'), expectedValue: '100' },
  ];
  const at = (s: string) => expectedCurve({ ...base, mode: 'manual', points, at: d(s) });

  it('pasa por los puntos y por la base al inicio', () => {
    expect(at('2026-01-01')).toBe('0');
    expect(at('2026-07-01')).toBe('30');
    expect(at('2026-12-31')).toBe('100');
  });
  it('interpola entre puntos y desde la base hasta el primero', () => {
    const r = { startsAt: d('2026-01-01'), endsAt: d('2026-01-11') };
    const pts = [{ bucketDate: d('2026-01-11'), expectedValue: '100' }];
    expect(
      expectedCurve({ mode: 'manual', range: r, baseline: '0', target: '100', points: pts, at: d('2026-01-06') }),
    ).toBe('50');
  });
  it('queda constante después del último punto y antes del inicio', () => {
    expect(at('2027-03-01')).toBe('100');
    expect(at('2025-01-01')).toBe('0');
  });
  it('no depende del orden de los puntos', () => {
    const rev = expectedCurve({ ...base, mode: 'manual', points: [...points].reverse(), at: d('2026-09-01') });
    expect(rev).toBe(at('2026-09-01'));
  });
  it('sin puntos devuelve la base', () => {
    expect(expectedCurve({ ...base, mode: 'manual', points: [], at: d('2026-06-01') })).toBe('0');
  });
  it('decreciente', () => {
    const r = { startsAt: d('2026-01-01'), endsAt: d('2026-01-11') };
    expect(
      expectedCurve({
        mode: 'manual',
        range: r,
        baseline: '100',
        target: '0',
        points: [{ bucketDate: d('2026-01-11'), expectedValue: '0' }],
        at: d('2026-01-06'),
      }),
    ).toBe('50');
  });
});

describe('expectedCurve from_projects', () => {
  const steps = [
    { endsAt: d('2026-03-31'), contributionValue: '10' },
    { endsAt: d('2026-06-30'), contributionValue: '25.5' },
    { endsAt: d('2026-06-30'), contributionValue: '4.5' },
  ];
  const at = (s: string) => expectedCurve({ ...base, baseline: '5', mode: 'from_projects', steps, at: d(s) });
  it('es escalonada e inclusiva en endsAt', () => {
    expect(at('2026-03-30')).toBe('5');
    expect(at('2026-03-31')).toBe('15');
    expect(at('2026-06-29')).toBe('15');
    expect(at('2026-06-30')).toBe('45');
    expect(at('2027-01-01')).toBe('45');
  });
  it('sin pasos queda en la base', () => {
    expect(expectedCurve({ ...base, mode: 'from_projects', steps: [], at: d('2026-06-30') })).toBe('0');
  });
});

describe('pendingBuckets', () => {
  const r = { startsAt: d('2026-01-01'), endsAt: d('2026-06-30') };
  const buckets = buildBuckets(r, 'monthly'); // 1/1 … 1/6
  const run = (entries: string[], today: string, grace = 10) =>
    pendingBuckets(entries.map((e) => ({ bucketDate: d(e) })), buckets, d(today), grace, r.endsAt)
      .map((x) => x.toISOString().slice(0, 10));

  it('un bucket recién cerrado está en gracia', () => {
    expect(run([], '2026-02-11')).toEqual([]); // enero cerró 1/2, +10 días = no más de 10
  });
  it('vence al pasar graceDays', () => {
    expect(run([], '2026-02-12')).toEqual(['2026-01-01']);
  });
  it('un bucket con entry no está pendiente (aun con incremento 0)', () => {
    expect(run(['2026-01-01'], '2026-03-20')).toEqual(['2026-02-01']);
  });
  it('el último bucket cierra al fin del período', () => {
    expect(run(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'], '2026-07-10')).toEqual([]);
    expect(run(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'], '2026-07-11')).toEqual([
      '2026-06-01',
    ]);
  });
  it('sin periodEnd el último bucket nunca vence', () => {
    expect(pendingBuckets([], [d('2026-01-01')], d('2030-01-01'), 10)).toEqual([]);
  });
  it('el bucket en curso no vence', () => {
    expect(run([], '2026-01-20')).toEqual([]);
  });
  it('graceDays inválido lanza', () => {
    expect(() => pendingBuckets([], buckets, d('2026-01-01'), -1)).toThrow(RangeError);
  });
  it('la cantidad de pendientes nunca crece al cargar más entries (property)', () => {
    fc.assert(
      fc.property(
        fc.subarray(buckets.map((b) => b.getTime())),
        fc.integer({ min: 0, max: 400 }),
        (loaded, offset) => {
          const today = new Date(d('2026-01-01').getTime() + offset * 86_400_000);
          const some = pendingBuckets(loaded.slice(1).map((t) => ({ bucketDate: new Date(t) })), buckets, today, 10, r.endsAt);
          const more = pendingBuckets(loaded.map((t) => ({ bucketDate: new Date(t) })), buckets, today, 10, r.endsAt);
          expect(more.length).toBeLessThanOrEqual(some.length);
        },
      ),
    );
  });
});

describe('expectedCurve manual (property)', () => {
  it('es monótono para puntos crecientes y queda dentro de [base, meta]', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 364 }),
        fc.integer({ min: 0, max: 364 }),
        (vals, a, b) => {
          const sortedVals = [...vals].sort((x, y) => x - y);
          const points = sortedVals.map((v, i) => ({
            bucketDate: new Date(range.startsAt.getTime() + (i + 1) * 60 * 86_400_000),
            expectedValue: String(v),
          }));
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          const at = (n: number) =>
            Number(
              expectedCurve({ ...base, mode: 'manual', points, at: new Date(range.startsAt.getTime() + n * 86_400_000) }),
            );
          expect(at(hi)).toBeGreaterThanOrEqual(at(lo));
          expect(at(lo)).toBeGreaterThanOrEqual(0);
          expect(at(hi)).toBeLessThanOrEqual(100);
        },
      ),
    );
  });
});
