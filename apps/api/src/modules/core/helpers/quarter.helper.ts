import { BadRequestException } from '@nestjs/common';

/**
 * Quarter helper — pure functions for AR timezone period derivation.
 *
 * Argentina has no DST and uses a fixed UTC-3 offset.
 * All timestamps are stored in UTC; AR timezone is applied for derivation only.
 *
 * Per ADR 0002 D8 and plan step 5.
 */

const AR_TIMEZONE = 'America/Argentina/Buenos_Aires';
const AR_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC-3, no DST

/** Quarter number type. */
type Quarter = 1 | 2 | 3 | 4;

/**
 * Derives the current year and quarter from a Date, interpreted in AR timezone.
 */
export function deriveCurrentQuarter(now: Date): { year: number; quarter: Quarter } {
  const formatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: AR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  });

  const parts = formatter.formatToParts(now);
  const yearPart = parts.find((p) => p.type === 'year');
  const monthPart = parts.find((p) => p.type === 'month');

  if (!yearPart || !monthPart) {
    throw new Error('Failed to format date parts for AR timezone');
  }

  const year = parseInt(yearPart.value, 10);
  const month = parseInt(monthPart.value, 10);
  const quarter = Math.ceil(month / 3) as Quarter;

  return { year, quarter };
}

/**
 * Computes the UTC start and end timestamps for a given year/quarter in AR timezone.
 *
 * AR has no DST (fixed UTC-3).
 * Q1: Jan 1 00:00:00 AR – Mar 31 23:59:59.999 AR
 * Q2: Apr 1 00:00:00 AR – Jun 30 23:59:59.999 AR
 * Q3: Jul 1 00:00:00 AR – Sep 30 23:59:59.999 AR
 * Q4: Oct 1 00:00:00 AR – Dec 31 23:59:59.999 AR
 */
export function quarterBounds(
  year: number,
  quarter: Quarter,
): { startsAt: Date; endsAt: Date } {
  // Start month (1-indexed) for each quarter
  const startMonths: Record<Quarter, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };
  // End month for each quarter
  const endMonths: Record<Quarter, number> = { 1: 3, 2: 6, 3: 9, 4: 12 };
  // Last day of end month
  const endDays: Record<Quarter, number> = { 1: 31, 2: 30, 3: 30, 4: 31 };

  const startMonth = startMonths[quarter];
  const endMonth = endMonths[quarter];
  const endDay = endDays[quarter];

  // AR start: year-MM-01 00:00:00 AR = UTC + 3h
  const startsAt = new Date(
    Date.UTC(year, startMonth - 1, 1, 0, 0, 0, 0) + AR_OFFSET_MS,
  );

  // AR end: year-MM-DD 23:59:59.999 AR = UTC + 3h
  const endsAt = new Date(
    Date.UTC(year, endMonth - 1, endDay, 23, 59, 59, 999) + AR_OFFSET_MS,
  );

  return { startsAt, endsAt };
}

/**
 * Parses a period code string (e.g. '2026-Q2') into year and quarter.
 * Throws BadRequestException if format is invalid.
 */
export function parsePeriodCode(code: string): { year: number; quarter: Quarter } {
  const match = /^(\d{4})-Q([1-4])$/.exec(code);
  if (!match) {
    throw new BadRequestException(
      `Invalid period code format: "${code}". Expected format: YYYY-Qn (e.g. 2026-Q2).`,
    );
  }
  const year = parseInt(match[1]!, 10);
  const quarter = parseInt(match[2]!, 10) as Quarter;
  return { year, quarter };
}

/**
 * Formats year and quarter into a period code string (e.g. '2026-Q2').
 */
export function formatPeriodCode(year: number, quarter: Quarter): string {
  return `${year}-Q${quarter}`;
}

/**
 * Given start/end Date objects (in UTC), derives which quarter they correspond to
 * by comparing against Q boundaries in AR timezone.
 * Returns the quarter and year if the dates align, or null if they don't.
 */
function matchQuarterBounds(
  startsAt: Date,
  endsAt: Date,
): { year: number; quarter: Quarter } | null {
  // Try to match against the year implied by startsAt
  const { year } = deriveCurrentQuarter(startsAt);

  // Check adjacent quarters too (startsAt might be in Dec but end in Q4 of same year, etc.)
  const candidateYears = [year - 1, year, year + 1];

  for (const candidateYear of candidateYears) {
    for (const q of [1, 2, 3, 4] as Quarter[]) {
      const bounds = quarterBounds(candidateYear, q);
      if (
        bounds.startsAt.getTime() === startsAt.getTime() &&
        bounds.endsAt.getTime() === endsAt.getTime()
      ) {
        return { year: candidateYear, quarter: q };
      }
    }
  }

  return null;
}

export interface PeriodInput {
  code?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface DerivedPeriod {
  code: string;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Derives a complete period (code, startsAt, endsAt) from a potentially partial input.
 *
 * Rules per ADR 0002 D8:
 *  - No input or {}: derive all from now in AR timezone.
 *  - Only code: derive startsAt/endsAt from code.
 *  - Only startsAt+endsAt: derive code, validate alignment to Q boundary. If not aligned → 400.
 *  - All three: validate coherence. Mismatch → 400.
 *  - Partial mixture (only one date field): → 400.
 *
 * @param input - partial period input from request
 * @param now   - current timestamp for deriving the current Q
 */
export function derivePeriodFromInput(
  input: PeriodInput,
  now: Date,
): DerivedPeriod {
  const hasCode = input.code !== undefined && input.code !== '';
  const hasStartsAt = input.startsAt !== undefined && input.startsAt !== '';
  const hasEndsAt = input.endsAt !== undefined && input.endsAt !== '';

  // Case 1: no input → derive everything from now
  if (!hasCode && !hasStartsAt && !hasEndsAt) {
    const { year, quarter } = deriveCurrentQuarter(now);
    const bounds = quarterBounds(year, quarter);
    return {
      code: formatPeriodCode(year, quarter),
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
    };
  }

  // Case 2: only code → derive bounds from code
  if (hasCode && !hasStartsAt && !hasEndsAt) {
    const { year, quarter } = parsePeriodCode(input.code!);
    const bounds = quarterBounds(year, quarter);
    return {
      code: input.code!,
      startsAt: bounds.startsAt,
      endsAt: bounds.endsAt,
    };
  }

  // Case 3: only startsAt + endsAt → derive code, validate alignment
  if (!hasCode && hasStartsAt && hasEndsAt) {
    const startsAt = new Date(input.startsAt!);
    const endsAt = new Date(input.endsAt!);

    if (isNaN(startsAt.getTime())) {
      throw new BadRequestException(`Invalid startsAt date: "${input.startsAt}".`);
    }
    if (isNaN(endsAt.getTime())) {
      throw new BadRequestException(`Invalid endsAt date: "${input.endsAt}".`);
    }

    const match = matchQuarterBounds(startsAt, endsAt);
    if (!match) {
      // Compute expected bounds for the quarter that startsAt falls in
      const { year, quarter } = deriveCurrentQuarter(startsAt);
      const expected = quarterBounds(year, quarter);
      throw new BadRequestException({
        error: 'period.range_not_aligned_to_quarter',
        expected: {
          starts_at: expected.startsAt.toISOString(),
          ends_at: expected.endsAt.toISOString(),
        },
        message: `The provided startsAt/endsAt do not align to an exact quarter boundary in AR timezone.`,
      });
    }

    return {
      code: formatPeriodCode(match.year, match.quarter),
      startsAt,
      endsAt,
    };
  }

  // Case 4: all three → validate coherence
  if (hasCode && hasStartsAt && hasEndsAt) {
    const { year, quarter } = parsePeriodCode(input.code!);
    const expectedBounds = quarterBounds(year, quarter);

    const startsAt = new Date(input.startsAt!);
    const endsAt = new Date(input.endsAt!);

    if (isNaN(startsAt.getTime())) {
      throw new BadRequestException(`Invalid startsAt date: "${input.startsAt}".`);
    }
    if (isNaN(endsAt.getTime())) {
      throw new BadRequestException(`Invalid endsAt date: "${input.endsAt}".`);
    }

    if (
      expectedBounds.startsAt.getTime() !== startsAt.getTime() ||
      expectedBounds.endsAt.getTime() !== endsAt.getTime()
    ) {
      throw new BadRequestException({
        error: 'period.code_range_mismatch',
        message: `The provided code "${input.code}" does not match the given startsAt/endsAt.`,
        expected: {
          starts_at: expectedBounds.startsAt.toISOString(),
          ends_at: expectedBounds.endsAt.toISOString(),
        },
      });
    }

    return { code: input.code!, startsAt, endsAt };
  }

  // Case 5: partial mixture (only one date field, or code + only one date)
  throw new BadRequestException({
    error: 'period.partial_override_invalid',
    message:
      'Provee firstPeriod completo, solo code, o solo startsAt+endsAt.',
  });
}
