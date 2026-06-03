import { describe, it, expect } from 'vitest';
import { truncateBpFromPct, bpToPct } from './basis-points';

describe('truncateBpFromPct', () => {
  it('converts 33.3333% to 3333 bp (RN-22)', () => {
    expect(truncateBpFromPct(33.3333)).toBe(3333);
  });

  it('converts 0% to 0 bp', () => {
    expect(truncateBpFromPct(0)).toBe(0);
  });

  it('converts 100% to 10000 bp', () => {
    expect(truncateBpFromPct(100)).toBe(10000);
  });

  it('converts 99.99% to 9999 bp', () => {
    expect(truncateBpFromPct(99.99)).toBe(9999);
  });

  it('converts 50% to 5000 bp', () => {
    expect(truncateBpFromPct(50)).toBe(5000);
  });

  it('throws RangeError for NaN', () => {
    expect(() => truncateBpFromPct(NaN)).toThrow(RangeError);
  });

  it('throws RangeError for -0.01 (below 0)', () => {
    expect(() => truncateBpFromPct(-0.01)).toThrow(RangeError);
  });

  it('throws RangeError for 100.01 (above 100)', () => {
    expect(() => truncateBpFromPct(100.01)).toThrow(RangeError);
  });

  it('throws RangeError for Infinity', () => {
    expect(() => truncateBpFromPct(Infinity)).toThrow(RangeError);
  });
});

describe('bpToPct', () => {
  it('converts 8200 bp to 82 (presentation)', () => {
    expect(bpToPct(8200, 2)).toBe(82);
  });

  it('converts 3333 bp to 33.33', () => {
    expect(bpToPct(3333, 2)).toBe(33.33);
  });

  it('throws RangeError for bp > 10000', () => {
    expect(() => bpToPct(10001)).toThrow(RangeError);
  });

  it('throws RangeError for bp < 0', () => {
    expect(() => bpToPct(-1)).toThrow(RangeError);
  });

  it('converts 0 bp to 0', () => {
    expect(bpToPct(0)).toBe(0);
  });

  it('converts 10000 bp to 100', () => {
    expect(bpToPct(10000)).toBe(100);
  });
});
