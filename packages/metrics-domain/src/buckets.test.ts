import { describe, it, expect } from 'vitest';
import { bucketContaining, buildBuckets, isValidBucketDate } from './buckets';

// Q2 2026: April 1 (Wednesday) → June 30.
const q2 = {
  startsAt: new Date('2026-04-01T00:00:00Z'),
  endsAt: new Date('2026-06-30T23:59:59Z'),
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe('buildBuckets', () => {
  it('weekly: period start first, then every Monday', () => {
    const buckets = buildBuckets(q2, 'weekly');
    expect(iso(buckets[0]!)).toBe('2026-04-01'); // period start (Wednesday)
    expect(iso(buckets[1]!)).toBe('2026-04-06'); // first Monday after start
    expect(iso(buckets[2]!)).toBe('2026-04-13');
    expect(iso(buckets[buckets.length - 1]!)).toBe('2026-06-29'); // last Monday ≤ end
    // Every bucket except the first is a Monday.
    for (const b of buckets.slice(1)) {
      expect(b.getUTCDay()).toBe(1);
    }
  });

  it('weekly: does not duplicate the start when it falls on a Monday', () => {
    const range = {
      startsAt: new Date('2026-04-06T00:00:00Z'), // Monday
      endsAt: new Date('2026-04-30T00:00:00Z'),
    };
    const buckets = buildBuckets(range, 'weekly').map(iso);
    expect(buckets).toEqual(['2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27']);
  });

  it('biweekly: days 1 and 16 of each month', () => {
    const buckets = buildBuckets(q2, 'biweekly').map(iso);
    expect(buckets).toEqual([
      '2026-04-01',
      '2026-04-16',
      '2026-05-01',
      '2026-05-16',
      '2026-06-01',
      '2026-06-16',
    ]);
  });

  it('biweekly: start mid-month keeps the start as first bucket', () => {
    const range = {
      startsAt: new Date('2026-04-10T00:00:00Z'),
      endsAt: new Date('2026-05-20T00:00:00Z'),
    };
    expect(buildBuckets(range, 'biweekly').map(iso)).toEqual([
      '2026-04-10',
      '2026-04-16',
      '2026-05-01',
      '2026-05-16',
    ]);
  });

  it('monthly: day 1 of each month', () => {
    expect(buildBuckets(q2, 'monthly').map(iso)).toEqual([
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
    ]);
  });
});

describe('isValidBucketDate', () => {
  it('accepts valid boundaries and the period start', () => {
    expect(isValidBucketDate(new Date('2026-04-01T00:00:00Z'), q2, 'monthly')).toBe(true);
    expect(isValidBucketDate(new Date('2026-05-01T00:00:00Z'), q2, 'monthly')).toBe(true);
    expect(isValidBucketDate(new Date('2026-04-16T00:00:00Z'), q2, 'biweekly')).toBe(true);
    expect(isValidBucketDate(new Date('2026-04-06T00:00:00Z'), q2, 'weekly')).toBe(true);
  });

  it('rejects non-boundary dates and dates outside the period', () => {
    expect(isValidBucketDate(new Date('2026-04-15T00:00:00Z'), q2, 'monthly')).toBe(false);
    expect(isValidBucketDate(new Date('2026-04-07T00:00:00Z'), q2, 'weekly')).toBe(false);
    expect(isValidBucketDate(new Date('2026-07-01T00:00:00Z'), q2, 'monthly')).toBe(false);
    expect(isValidBucketDate(new Date('2026-03-01T00:00:00Z'), q2, 'monthly')).toBe(false);
  });
});

describe('buildBuckets: quarterly / semiannual / annual (RN-P15)', () => {
  const year2026 = {
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T00:00:00Z'),
  };

  it('quarterly: Jan/Apr/Jul/Oct on a calendar year', () => {
    expect(buildBuckets(year2026, 'quarterly').map(iso)).toEqual([
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
    ]);
  });

  it('quarterly: first bucket is the period start when mid-quarter', () => {
    const range = {
      startsAt: new Date('2026-02-15T00:00:00Z'),
      endsAt: new Date('2026-10-01T00:00:00Z'),
    };
    expect(buildBuckets(range, 'quarterly').map(iso)).toEqual([
      '2026-02-15',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
    ]);
  });

  it('semiannual: Jan/Jul', () => {
    expect(buildBuckets(year2026, 'semiannual').map(iso)).toEqual(['2026-01-01', '2026-07-01']);
  });

  it('semiannual: multi-year range rolls over the year boundary', () => {
    const range = {
      startsAt: new Date('2026-07-01T00:00:00Z'),
      endsAt: new Date('2027-12-31T00:00:00Z'),
    };
    expect(buildBuckets(range, 'semiannual').map(iso)).toEqual([
      '2026-07-01',
      '2027-01-01',
      '2027-07-01',
    ]);
  });

  it('annual: Jan 1 of every year', () => {
    const range = {
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2028-12-31T00:00:00Z'),
    };
    expect(buildBuckets(range, 'annual').map(iso)).toEqual([
      '2026-01-01',
      '2027-01-01',
      '2028-01-01',
    ]);
  });

  it('annual: period starting mid-year; next bucket is next Jan 1', () => {
    const range = {
      startsAt: new Date('2026-12-31T00:00:00Z'),
      endsAt: new Date('2027-01-01T00:00:00Z'),
    };
    expect(buildBuckets(range, 'annual').map(iso)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('quarterly: end-of-year edge (Nov 30 start → Jan 1 next year)', () => {
    const range = {
      startsAt: new Date('2026-11-30T00:00:00Z'),
      endsAt: new Date('2027-04-01T00:00:00Z'),
    };
    expect(buildBuckets(range, 'quarterly').map(iso)).toEqual([
      '2026-11-30',
      '2027-01-01',
      '2027-04-01',
    ]);
  });

  it('isValidBucketDate honours the new frequencies', () => {
    expect(isValidBucketDate(new Date('2026-07-01T00:00:00Z'), year2026, 'semiannual')).toBe(true);
    expect(isValidBucketDate(new Date('2026-04-01T00:00:00Z'), year2026, 'semiannual')).toBe(false);
    expect(isValidBucketDate(new Date('2026-04-01T00:00:00Z'), year2026, 'quarterly')).toBe(true);
    expect(isValidBucketDate(new Date('2026-05-01T00:00:00Z'), year2026, 'quarterly')).toBe(false);
    expect(isValidBucketDate(new Date('2026-07-01T00:00:00Z'), year2026, 'annual')).toBe(false);
  });
});

describe('bucketContaining (RN-P13)', () => {
  const range = { startsAt: new Date('2027-01-01T00:00:00Z'), endsAt: new Date('2027-12-31T00:00:00Z') };
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it('mensual: devuelve el inicio del mes que contiene la fecha', () => {
    expect(iso(bucketContaining(new Date('2027-03-17T15:30:00Z'), range, 'monthly'))).toBe('2027-03-01');
    expect(iso(bucketContaining(new Date('2027-03-01T00:00:00Z'), range, 'monthly'))).toBe('2027-03-01');
  });

  it('semestral y quincenal', () => {
    expect(iso(bucketContaining(new Date('2027-09-10T00:00:00Z'), range, 'semiannual'))).toBe('2027-07-01');
    expect(iso(bucketContaining(new Date('2027-03-20T00:00:00Z'), range, 'biweekly'))).toBe('2027-03-16');
  });

  it('antes del período -> primer bucket; después -> último bucket', () => {
    expect(iso(bucketContaining(new Date('2026-06-01T00:00:00Z'), range, 'monthly'))).toBe('2027-01-01');
    expect(iso(bucketContaining(new Date('2028-06-01T00:00:00Z'), range, 'monthly'))).toBe('2027-12-01');
  });

  it('siempre devuelve un inicio de bucket válido', () => {
    for (const day of ['2027-02-28', '2027-07-04', '2027-12-31']) {
      expect(isValidBucketDate(bucketContaining(new Date(`${day}T00:00:00Z`), range, 'weekly'), range, 'weekly')).toBe(true);
    }
  });
});
