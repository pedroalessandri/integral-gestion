import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { aggregateProgressBp, MixedWeightGroupError } from './cascade';
import { plannedProgress } from './planned';

const bp = fc.integer({ min: 0, max: 10_000 });
const progressList = fc.array(bp, { minLength: 1, maxLength: 10 });

/** Weights summing to exactly 10000 for n items. */
function weightsFor(n: number): fc.Arbitrary<number[]> {
  return fc
    .array(fc.integer({ min: 0, max: 10_000 }), { minLength: n, maxLength: n })
    .map((raw) => {
      const total = raw.reduce((a, b) => a + b, 0);
      if (total === 0) return [10_000, ...raw.slice(1).map(() => 0)];
      const scaled = raw.map((w) => Math.floor((w * 10_000) / total));
      const rest = 10_000 - scaled.reduce((a, b) => a + b, 0);
      scaled[0] = (scaled[0] ?? 0) + rest;
      return scaled;
    });
}

describe('aggregateProgressBp properties', () => {
  it('all siblings at 100% -> 10000 (weighted and unweighted)', () => {
    fc.assert(
      fc.property(progressList, (ps) => {
        const unweighted = ps.map(() => ({ progressBp: 10_000 }));
        if (aggregateProgressBp(unweighted) !== 10_000) return false;
        return true;
      }),
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }).chain(weightsFor), (ws) => {
        return aggregateProgressBp(ws.map((w) => ({ weightBp: w, progressBp: 10_000 }))) === 10_000;
      }),
    );
  });

  it('unweighted equals trunc(mean)', () => {
    fc.assert(
      fc.property(progressList, (ps) => {
        const mean = ps.reduce((a, b) => a + b, 0) / ps.length;
        return aggregateProgressBp(ps.map((p) => ({ progressBp: p }))) === Math.trunc(mean);
      }),
    );
  });

  it('weight 10000 on one sibling yields that sibling progress', () => {
    fc.assert(
      fc.property(progressList, fc.nat(), (ps, k) => {
        const idx = k % ps.length;
        const items = ps.map((p, i) => ({ weightBp: i === idx ? 10_000 : 0, progressBp: p }));
        return aggregateProgressBp(items) === ps[idx];
      }),
    );
  });

  it('monotonic: raising progress of a sibling never lowers the total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) =>
          fc.tuple(weightsFor(n), fc.array(bp, { minLength: n, maxLength: n }), fc.nat(), bp),
        ),
        ([ws, ps, k, newP]) => {
          const idx = k % ps.length;
          const before = ws.map((w, i) => ({ weightBp: w, progressBp: ps[i] ?? 0 }));
          const after = before.map((it, i) => (i === idx ? { ...it, progressBp: Math.max(it.progressBp, newP) } : it));
          return aggregateProgressBp(after) >= aggregateProgressBp(before);
        },
      ),
    );
    fc.assert(
      fc.property(progressList, fc.nat(), bp, (ps, k, newP) => {
        const idx = k % ps.length;
        const before = ps.map((p) => ({ progressBp: p }));
        const after = ps.map((p, i) => ({ progressBp: i === idx ? Math.max(p, newP) : p }));
        return aggregateProgressBp(after) >= aggregateProgressBp(before);
      }),
    );
  });

  it('mixed group always throws MixedWeightGroupError', () => {
    fc.assert(
      fc.property(fc.array(bp, { minLength: 2, maxLength: 8 }), fc.nat(), (ps, k) => {
        const idx = k % ps.length;
        const items = ps.map((p, i) => (i === idx ? { weightBp: 10_000, progressBp: p } : { progressBp: p }));
        try {
          aggregateProgressBp(items);
          return false;
        } catch (e) {
          return e instanceof MixedWeightGroupError;
        }
      }),
    );
  });
});

describe('plannedProgress properties', () => {
  const T0 = Date.UTC(2020, 0, 1);
  const taskArb = fc
    .tuple(fc.integer({ min: 0, max: 1_000_000_000 }), fc.integer({ min: 0, max: 1_000_000_000 }))
    .map(([s, dur]) => ({ startsAt: new Date(T0 + s), endsAt: new Date(T0 + s + dur) }));
  const tasksArb = fc.array(taskArb, { minLength: 1, maxLength: 6 });
  const atArb = fc.integer({ min: -1_000_000_000, max: 3_000_000_000 }).map((o) => new Date(T0 + o));

  it('result within [0, 10000]', () => {
    fc.assert(
      fc.property(tasksArb, atArb, (ts, at) => {
        const r = plannedProgress(ts, at);
        return r >= 0 && r <= 10_000;
      }),
    );
  });

  it('monotonic non-decreasing in at', () => {
    fc.assert(
      fc.property(tasksArb, atArb, atArb, (ts, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return plannedProgress(ts, lo) <= plannedProgress(ts, hi);
      }),
    );
  });

  it('0 before all starts, 10000 after all ends', () => {
    fc.assert(
      fc.property(tasksArb, (ts) => {
        const minStart = Math.min(...ts.map((t) => t.startsAt.getTime()));
        const maxEnd = Math.max(...ts.map((t) => t.endsAt.getTime()));
        return (
          plannedProgress(ts, new Date(minStart - 1)) === 0 &&
          plannedProgress(ts, new Date(maxEnd + 1)) === 10_000
        );
      }),
    );
  });
});
