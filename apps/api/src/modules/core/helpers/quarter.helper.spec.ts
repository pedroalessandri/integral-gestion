import { describe, it, expect } from 'vitest';
import {
  deriveCurrentQuarter,
  quarterBounds,
  derivePeriodFromInput,
  formatPeriodCode,
  parsePeriodCode,
} from './quarter.helper.js';

/**
 * Unit tests for quarter.helper.ts
 * All 7 cases per the approved plan.
 * Argentina is UTC-3 (no DST).
 */

describe('deriveCurrentQuarter', () => {
  it('derives Q1 for a date in January in AR timezone', () => {
    // 2026-01-15T12:00:00Z — in AR time: 2026-01-15T09:00:00-03:00 → Q1
    const result = deriveCurrentQuarter(new Date('2026-01-15T12:00:00Z'));
    expect(result).toEqual({ year: 2026, quarter: 1 });
  });

  it('derives Q2 for a date in April in AR timezone', () => {
    // 2026-04-21T15:00:00Z — in AR time: 2026-04-21T12:00:00-03:00 → Q2
    const result = deriveCurrentQuarter(new Date('2026-04-21T15:00:00Z'));
    expect(result).toEqual({ year: 2026, quarter: 2 });
  });

  it('derives Q3 for a date in July in AR timezone', () => {
    const result = deriveCurrentQuarter(new Date('2026-07-01T10:00:00Z'));
    expect(result).toEqual({ year: 2026, quarter: 3 });
  });

  it('derives Q4 for a date in December in AR timezone', () => {
    const result = deriveCurrentQuarter(new Date('2026-12-31T23:00:00Z'));
    expect(result).toEqual({ year: 2026, quarter: 4 });
  });

  it('handles year boundary — Jan 1 00:00:00 AR is Jan 1 03:00:00 UTC', () => {
    // Jan 1 00:00:00 AR = Jan 1 03:00:00 UTC → Q1
    const result = deriveCurrentQuarter(new Date('2026-01-01T03:00:00Z'));
    expect(result).toEqual({ year: 2026, quarter: 1 });
  });
});

describe('quarterBounds', () => {
  it('computes Q1 bounds (Jan 1 – Mar 31 AR)', () => {
    const { startsAt, endsAt } = quarterBounds(2026, 1);
    // Jan 1 00:00:00 AR = Jan 1 03:00:00 UTC
    expect(startsAt.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    // Mar 31 23:59:59.999 AR = Apr 1 02:59:59.999 UTC
    expect(endsAt.toISOString()).toBe('2026-04-01T02:59:59.999Z');
  });

  it('computes Q2 bounds (Apr 1 – Jun 30 AR)', () => {
    const { startsAt, endsAt } = quarterBounds(2026, 2);
    // Apr 1 00:00:00 AR = Apr 1 03:00:00 UTC
    expect(startsAt.toISOString()).toBe('2026-04-01T03:00:00.000Z');
    // Jun 30 23:59:59.999 AR = Jul 1 02:59:59.999 UTC
    expect(endsAt.toISOString()).toBe('2026-07-01T02:59:59.999Z');
  });
});

describe('parsePeriodCode', () => {
  it('parses a valid code', () => {
    expect(parsePeriodCode('2026-Q2')).toEqual({ year: 2026, quarter: 2 });
  });

  it('throws BadRequestException on invalid format', () => {
    expect(() => parsePeriodCode('2026-2')).toThrow();
    expect(() => parsePeriodCode('Q2-2026')).toThrow();
  });
});

describe('formatPeriodCode', () => {
  it('formats correctly', () => {
    expect(formatPeriodCode(2026, 2)).toBe('2026-Q2');
  });
});

describe('derivePeriodFromInput', () => {
  const now = new Date('2026-04-21T15:00:00Z'); // Q2 2026 in AR

  it('case 1: no input → derives current Q from now', () => {
    const result = derivePeriodFromInput({}, now);
    expect(result.code).toBe('2026-Q2');
    expect(result.startsAt.toISOString()).toBe('2026-04-01T03:00:00.000Z');
    expect(result.endsAt.toISOString()).toBe('2026-07-01T02:59:59.999Z');
  });

  it('case 2: only code → derives bounds from code', () => {
    const result = derivePeriodFromInput({ code: '2026-Q1' }, now);
    expect(result.code).toBe('2026-Q1');
    expect(result.startsAt.toISOString()).toBe('2026-01-01T03:00:00.000Z');
    expect(result.endsAt.toISOString()).toBe('2026-04-01T02:59:59.999Z');
  });

  it('case 3: only startsAt + endsAt → derives code and validates alignment', () => {
    const result = derivePeriodFromInput(
      {
        startsAt: '2026-04-01T03:00:00.000Z',
        endsAt: '2026-07-01T02:59:59.999Z',
      },
      now,
    );
    expect(result.code).toBe('2026-Q2');
  });

  it('case 3: throws if dates do not align to Q boundary', () => {
    expect(() =>
      derivePeriodFromInput(
        {
          startsAt: '2026-04-01T03:00:00.000Z',
          endsAt: '2026-07-15T02:59:59.999Z', // wrong end date
        },
        now,
      ),
    ).toThrow();
  });

  it('case 4: all three provided and coherent → returns as-is', () => {
    const result = derivePeriodFromInput(
      {
        code: '2026-Q2',
        startsAt: '2026-04-01T03:00:00.000Z',
        endsAt: '2026-07-01T02:59:59.999Z',
      },
      now,
    );
    expect(result.code).toBe('2026-Q2');
  });

  it('case 4: all three provided but mismatch → throws', () => {
    expect(() =>
      derivePeriodFromInput(
        {
          code: '2026-Q1', // says Q1
          startsAt: '2026-04-01T03:00:00.000Z', // but Q2 bounds
          endsAt: '2026-07-01T02:59:59.999Z',
        },
        now,
      ),
    ).toThrow();
  });

  it('case 5: partial mixture (only startsAt) → throws', () => {
    expect(() =>
      derivePeriodFromInput({ startsAt: '2026-04-01T03:00:00.000Z' }, now),
    ).toThrow();
  });
});
