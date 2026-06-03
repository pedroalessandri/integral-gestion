import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { validateWeightSumInvariant, projectSumAfterDelete } from './invariants';

/** Arbitrary for a valid weightBp integer */
const weightBpArb = fc.integer({ min: 0, max: 10_000 });

/** Arbitrary for an array of items with weightBp */
const itemsArb = fc.array(weightBpArb, { minLength: 0, maxLength: 10 }).map((weights) =>
  weights.map((w) => ({ weightBp: w })),
);

describe('validateWeightSumInvariant property tests', () => {
  it('is sound: returns ok=true iff actual sum equals expected', () => {
    fc.assert(
      fc.property(
        itemsArb,
        fc.integer({ min: 0, max: 100_000 }),
        (items, expected) => {
          const actual = items.reduce((acc, item) => acc + item.weightBp, 0);
          const result = validateWeightSumInvariant(items, expected);
          if (actual === expected) {
            return result.ok === true;
          } else {
            return result.ok === false && result.actual === actual && result.expected === expected;
          }
        },
      ),
    );
  });
});

describe('projectSumAfterDelete property tests', () => {
  it('equals totalSum - deletedItem.weightBp for any valid list', () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc.record({
              id: fc.uuid(),
              weightBp: fc.integer({ min: 0, max: 10_000 }),
            }),
            { minLength: 1, maxLength: 10 },
          )
          .chain((siblings) =>
            fc.nat({ max: siblings.length - 1 }).map((idx) => ({
              siblings,
              toDeleteId: siblings[idx]?.id ?? siblings[0]?.id ?? '',
              deletedWeight: siblings[idx]?.weightBp ?? 0,
            })),
          ),
        ({ siblings, toDeleteId, deletedWeight }) => {
          const totalSum = siblings.reduce((acc, s) => acc + s.weightBp, 0);
          const result = projectSumAfterDelete(siblings, toDeleteId);
          return result === totalSum - deletedWeight;
        },
      ),
    );
  });
});
