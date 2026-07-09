/**
 * Exact decimal arithmetic for metric values, without external dependencies.
 *
 * Values are DECIMAL(18,4) in the database. Internally the domain represents
 * them as bigint scaled by 10^4 ("ten-thousandths"), which makes sums and
 * linear interpolation exact — never IEEE floats (CLAUDE.md rule 7).
 *
 * The public API of the package takes and returns decimal STRINGS
 * ("123.45", "-0.005" is invalid — max 4 decimals), which is what
 * Prisma.Decimal.toString() produces for DECIMAL(18,4) columns.
 */

export const DECIMAL_SCALE = 10_000n;

const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;

export class InvalidDecimalError extends Error {
  constructor(value: string) {
    super(`Invalid decimal value "${value}": expected up to 14 integer and 4 fractional digits.`);
    this.name = 'InvalidDecimalError';
  }
}

/** Parses a decimal string (≤4 fractional digits) into a scaled bigint. */
export function parseDecimal4(value: string): bigint {
  if (!DECIMAL_RE.test(value)) {
    throw new InvalidDecimalError(value);
  }
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [intPart, fracPart = ''] = abs.split('.');
  const scaled = BigInt(intPart ?? '0') * DECIMAL_SCALE + BigInt(fracPart.padEnd(4, '0'));
  return negative ? -scaled : scaled;
}

/** Formats a scaled bigint back into a decimal string, trimming trailing zeros. */
export function formatDecimal4(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const intPart = abs / DECIMAL_SCALE;
  const fracPart = abs % DECIMAL_SCALE;
  let result = intPart.toString();
  if (fracPart !== 0n) {
    result += '.' + fracPart.toString().padStart(4, '0').replace(/0+$/, '');
  }
  return negative ? '-' + result : result;
}
