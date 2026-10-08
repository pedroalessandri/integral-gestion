import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { deviationBp, progressDeviationBp, aggregateDeviationBp } from './deviation';

describe('deviationBp', () => {
  it('es positivo si va adelantado y negativo si atrasado', () => {
    expect(deviationBp({ actual: 60n, expected: 50n, baseline: 0n, target: 100n })).toBe(1000);
    expect(deviationBp({ actual: 40n, expected: 50n, baseline: 0n, target: 100n })).toBe(-1000);
  });
  it('en decrecientes, bajar más de lo esperado es adelantado', () => {
    expect(deviationBp({ actual: 40n, expected: 50n, baseline: 100n, target: 0n })).toBe(1000);
  });
  it('base == meta devuelve 0', () => {
    expect(deviationBp({ actual: 3n, expected: 2n, baseline: 5n, target: 5n })).toBe(0);
  });
  it('trunca hacia cero y no acota', () => {
    expect(deviationBp({ actual: 1n, expected: 0n, baseline: 0n, target: 3n })).toBe(3333);
    expect(deviationBp({ actual: 0n, expected: 1n, baseline: 0n, target: 3n })).toBe(-3333);
    expect(deviationBp({ actual: 500n, expected: 0n, baseline: 0n, target: 100n })).toBe(50_000);
  });
  it('es invariante a la escala (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 10_000 }),
        (a, e, t, k) => {
          const K = BigInt(k);
          expect(deviationBp({ actual: BigInt(a) * K, expected: BigInt(e) * K, baseline: 0n, target: BigInt(t) * K })).toBe(
            deviationBp({ actual: BigInt(a), expected: BigInt(e), baseline: 0n, target: BigInt(t) }),
          );
        },
      ),
    );
  });
});

describe('progressDeviationBp (gestión, RN-P9)', () => {
  it('resta avance real menos planificado', () => {
    expect(progressDeviationBp(4000, 5000)).toBe(-1000);
    expect(progressDeviationBp(7000, 5000)).toBe(2000);
    expect(progressDeviationBp(0, 0)).toBe(0);
  });
  it('coincide con deviationBp sobre el tramo 0..10000 (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }), (a, e) => {
        expect(progressDeviationBp(a, e)).toBe(
          deviationBp({ actual: BigInt(a), expected: BigInt(e), baseline: 0n, target: 10_000n }),
        );
      }),
    );
  });
  it('rechaza no enteros', () => {
    expect(() => progressDeviationBp(1.5, 0)).toThrow(RangeError);
  });
});

describe('aggregateDeviationBp', () => {
  it('sin hermanos medibles devuelve null', () => {
    expect(aggregateDeviationBp([])).toBeNull();
    expect(aggregateDeviationBp([{ weightBp: null, deviationBp: null }])).toBeNull();
  });
  it('media simple si algún hermano no tiene peso', () => {
    expect(
      aggregateDeviationBp([
        { weightBp: null, deviationBp: -1000 },
        { weightBp: null, deviationBp: 500 },
      ]),
    ).toBe(-250);
  });
  it('media ponderada si todos tienen peso', () => {
    expect(
      aggregateDeviationBp([
        { weightBp: 7000, deviationBp: -1000 },
        { weightBp: 3000, deviationBp: 2000 },
      ]),
    ).toBe(-100);
  });
  it('excluye los no medibles y renormaliza los pesos', () => {
    expect(
      aggregateDeviationBp([
        { weightBp: 5000, deviationBp: -2000 },
        { weightBp: 5000, deviationBp: null },
      ]),
    ).toBe(-2000);
  });
  it('trunca hacia cero', () => {
    expect(
      aggregateDeviationBp([
        { weightBp: null, deviationBp: -1 },
        { weightBp: null, deviationBp: 0 },
      ]),
    ).toBe(0);
  });
  it('con pesos en cero cae a media simple', () => {
    expect(
      aggregateDeviationBp([
        { weightBp: 0, deviationBp: 100 },
        { weightBp: 0, deviationBp: 300 },
      ]),
    ).toBe(200);
  });
  it('queda entre el mínimo y el máximo de los desvíos (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -30_000, max: 30_000 }), { minLength: 1, maxLength: 10 }), (devs) => {
        const r = aggregateDeviationBp(devs.map((d) => ({ weightBp: null, deviationBp: d })));
        expect(r).not.toBeNull();
        expect(r as number).toBeGreaterThanOrEqual(Math.min(...devs));
        expect(r as number).toBeLessThanOrEqual(Math.max(...devs));
      }),
    );
  });
});
