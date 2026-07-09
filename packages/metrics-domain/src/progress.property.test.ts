import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { progressBp } from './progress';

/** Decimal-string arbitrary with up to 4 fractional digits. */
const decimalArb = fc
  .tuple(fc.integer({ min: -1_000_000, max: 1_000_000 }), fc.integer({ min: 0, max: 9999 }))
  .map(([int, frac]) => {
    const sign = int < 0 ? '-' : '';
    return `${sign}${Math.abs(int)}.${frac.toString().padStart(4, '0')}`;
  });

describe('progressBp property tests', () => {
  it('is always within [0, 10000]', () => {
    fc.assert(
      fc.property(decimalArb, decimalArb, decimalArb, (actual, baseline, target) => {
        const bp = progressBp({ actual, baseline, target });
        return Number.isInteger(bp) && bp >= 0 && bp <= 10_000;
      }),
    );
  });

  it('actual == baseline → 0 and actual == target → 10000 (when baseline ≠ target)', () => {
    fc.assert(
      fc.property(decimalArb, decimalArb, (baseline, target) => {
        fc.pre(baseline !== target);
        return (
          progressBp({ actual: baseline, baseline, target }) === 0 &&
          progressBp({ actual: target, baseline, target }) === 10_000
        );
      }),
    );
  });

  it('is monotonically non-decreasing in `actual` toward the target, for both directions', () => {
    fc.assert(
      fc.property(
        decimalArb,
        decimalArb,
        decimalArb,
        decimalArb,
        (baseline, target, a1, a2) => {
          fc.pre(baseline !== target);
          const increasing = Number(target) > Number(baseline);
          // Order a1/a2 along the direction of improvement.
          const [worse, better] =
            (increasing ? Number(a1) <= Number(a2) : Number(a1) >= Number(a2))
              ? [a1, a2]
              : [a2, a1];
          return (
            progressBp({ actual: worse, baseline, target }) <=
            progressBp({ actual: better, baseline, target })
          );
        },
      ),
    );
  });

  it('symmetric directions: mirroring baseline/target/actual yields the same progress', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        (b, t, a) => {
          fc.pre(b !== t);
          const inc = progressBp({ actual: String(a), baseline: String(b), target: String(t) });
          // Mirror around zero: increasing becomes decreasing with the same geometry.
          const dec = progressBp({
            actual: String(-a),
            baseline: String(-b),
            target: String(-t),
          });
          return inc === dec;
        },
      ),
    );
  });
});
