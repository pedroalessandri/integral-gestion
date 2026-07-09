import { describe, it, expect } from 'vitest';
import { progressBp, computeAutomaticKrProgressBp } from './progress';

describe('progressBp — interpolation edge cases', () => {
  it('increasing metric: linear midpoint → 5000bp', () => {
    expect(progressBp({ actual: '50', baseline: '0', target: '100' })).toBe(5_000);
  });

  it('increasing metric: clamps below baseline to 0 and beyond target to 10000', () => {
    expect(progressBp({ actual: '-10', baseline: '0', target: '100' })).toBe(0);
    expect(progressBp({ actual: '250', baseline: '0', target: '100' })).toBe(10_000);
  });

  it('decreasing metric (target < baseline): same formula via the span sign', () => {
    // baseline 100 → target 20; actual 60 is halfway → 5000bp.
    expect(progressBp({ actual: '60', baseline: '100', target: '20' })).toBe(5_000);
    // Getting worse (above baseline) clamps to 0.
    expect(progressBp({ actual: '120', baseline: '100', target: '20' })).toBe(0);
    // Beating the target clamps to 10000.
    expect(progressBp({ actual: '10', baseline: '100', target: '20' })).toBe(10_000);
  });

  it('respects 4-decimal precision without floating error', () => {
    expect(progressBp({ actual: '0.3333', baseline: '0', target: '1' })).toBe(3_333);
  });

  it('baseline === target: 10000 iff actual reached the target, else 0', () => {
    expect(progressBp({ actual: '50', baseline: '50', target: '50' })).toBe(10_000);
    expect(progressBp({ actual: '49.9999', baseline: '50', target: '50' })).toBe(0);
    expect(progressBp({ actual: '50.0001', baseline: '50', target: '50' })).toBe(0);
  });
});

describe('computeAutomaticKrProgressBp', () => {
  it('is the OKR-named alias of progressBp', () => {
    const input = { actual: '75', baseline: '0', target: '100' };
    expect(computeAutomaticKrProgressBp(input)).toBe(progressBp(input));
    expect(computeAutomaticKrProgressBp(input)).toBe(7_500);
  });
});
