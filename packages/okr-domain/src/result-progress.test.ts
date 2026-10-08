import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MixedWeightGroupError, WeightSumInvariantError, computeResultProgress } from './cascade';

describe('computeResultProgress (RN-P8, avance de resultado)', () => {
  it('sin indicadores -> 0 (nunca NaN)', () => {
    expect(computeResultProgress([])).toBe(0);
  });

  it('sin pesos: promedio simple truncado', () => {
    expect(
      computeResultProgress([
        { weightBp: null, progressBp: 10000 },
        { weightBp: null, progressBp: 5000 },
        { weightBp: null, progressBp: 0 },
      ]),
    ).toBe(5000);
    expect(
      computeResultProgress([
        { weightBp: null, progressBp: 3333 },
        { weightBp: null, progressBp: 3334 },
      ]),
    ).toBe(3333);
  });

  it('con pesos: promedio ponderado', () => {
    expect(
      computeResultProgress([
        { weightBp: 7000, progressBp: 10000 },
        { weightBp: 3000, progressBp: 0 },
      ]),
    ).toBe(7000);
  });

  it('grupo mixto -> MixedWeightGroupError; suma incorrecta -> WeightSumInvariantError', () => {
    expect(() =>
      computeResultProgress([
        { weightBp: 5000, progressBp: 100 },
        { weightBp: null, progressBp: 100 },
      ]),
    ).toThrow(MixedWeightGroupError);
    expect(() =>
      computeResultProgress([
        { weightBp: 5000, progressBp: 100 },
        { weightBp: 4000, progressBp: 100 },
      ]),
    ).toThrow(WeightSumInvariantError);
  });

  it('propiedad: siempre dentro de 0..10000 para grupos sin pesos', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 10000 }), { minLength: 0, maxLength: 20 }), (progresses) => {
        const result = computeResultProgress(progresses.map((progressBp) => ({ weightBp: null, progressBp })));
        return result >= 0 && result <= 10000;
      }),
    );
  });

  it('propiedad: si todos los indicadores están al 100%, el objetivo está al 100%', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (n) => {
        const items = Array.from({ length: n }, () => ({ weightBp: null, progressBp: 10000 }));
        return computeResultProgress(items) === 10000;
      }),
    );
  });
});
