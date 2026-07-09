import { describe, it, expect } from 'vitest';
import { cumulativeSeries, cumulativeToDate } from './accumulate';
import type { EntryInput } from './types';

const entries: EntryInput[] = [
  { bucketDate: new Date('2026-05-01T00:00:00Z'), incrementValue: '30' },
  { bucketDate: new Date('2026-04-01T00:00:00Z'), incrementValue: '10' },
  { bucketDate: new Date('2026-04-01T00:00:00Z'), incrementValue: '5.5' },
  // June bucket intentionally empty (RN-C7).
];

describe('cumulativeSeries', () => {
  it('groups by bucket, sorts ascending and accumulates from baseline', () => {
    const series = cumulativeSeries(entries, '0');
    expect(series).toHaveLength(2);
    expect(series[0]!.bucketDate.toISOString().slice(0, 10)).toBe('2026-04-01');
    expect(series[0]!.cumulativeValue).toBe('15.5'); // 10 + 5.5
    expect(series[1]!.cumulativeValue).toBe('45.5'); // + 30
  });

  it('starts from a non-zero baseline', () => {
    const series = cumulativeSeries(entries, '100');
    expect(series[0]!.cumulativeValue).toBe('115.5');
    expect(series[1]!.cumulativeValue).toBe('145.5');
  });

  it('supports negative increments (corrections)', () => {
    const series = cumulativeSeries(
      [...entries, { bucketDate: new Date('2026-05-01T00:00:00Z'), incrementValue: '-20' }],
      '0',
    );
    expect(series[1]!.cumulativeValue).toBe('25.5');
  });

  it('returns empty for no entries', () => {
    expect(cumulativeSeries([], '0')).toEqual([]);
  });
});

describe('cumulativeToDate', () => {
  it('sums only buckets ≤ the cutoff date', () => {
    expect(cumulativeToDate(entries, '0', new Date('2026-04-30T00:00:00Z'))).toBe('15.5');
    expect(cumulativeToDate(entries, '0', new Date('2026-06-30T00:00:00Z'))).toBe('45.5');
  });

  it('returns the baseline when no entries qualify', () => {
    expect(cumulativeToDate(entries, '12', new Date('2026-03-01T00:00:00Z'))).toBe('12');
    expect(cumulativeToDate([], '12', new Date('2026-06-30T00:00:00Z'))).toBe('12');
  });
});
