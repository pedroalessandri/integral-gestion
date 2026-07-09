import { describe, it, expect } from 'vitest';
import { expectedAt } from './expected';

const range = {
  startsAt: new Date('2026-04-01T00:00:00Z'),
  endsAt: new Date('2026-07-01T00:00:00Z'), // 91 days
};

describe('expectedAt', () => {
  it('returns baseline at period start and target at period end', () => {
    expect(expectedAt(range.startsAt, range, '0', '500')).toBe('0');
    expect(expectedAt(range.endsAt, range, '0', '500')).toBe('500');
  });

  it('interpolates linearly in between', () => {
    // Exact midpoint of a 10-day range.
    const shortRange = {
      startsAt: new Date('2026-04-01T00:00:00Z'),
      endsAt: new Date('2026-04-11T00:00:00Z'),
    };
    expect(expectedAt(new Date('2026-04-06T00:00:00Z'), shortRange, '0', '100')).toBe('50');
    expect(expectedAt(new Date('2026-04-06T00:00:00Z'), shortRange, '100', '200')).toBe('150');
  });

  it('clamps dates outside the period', () => {
    expect(expectedAt(new Date('2026-01-01T00:00:00Z'), range, '0', '500')).toBe('0');
    expect(expectedAt(new Date('2027-01-01T00:00:00Z'), range, '0', '500')).toBe('500');
  });

  it('works for decreasing metrics (target < baseline)', () => {
    const shortRange = {
      startsAt: new Date('2026-04-01T00:00:00Z'),
      endsAt: new Date('2026-04-11T00:00:00Z'),
    };
    expect(expectedAt(new Date('2026-04-06T00:00:00Z'), shortRange, '12', '8')).toBe('10');
    expect(expectedAt(shortRange.endsAt, shortRange, '12', '8')).toBe('8');
  });

  it('degenerate range (start == end) returns the target', () => {
    const degenerate = { startsAt: range.startsAt, endsAt: range.startsAt };
    expect(expectedAt(range.startsAt, degenerate, '0', '500')).toBe('500');
  });
});
