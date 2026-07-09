import { describe, it, expect } from 'vitest';
import { parseDecimal4, formatDecimal4, InvalidDecimalError } from './decimal';

describe('parseDecimal4 / formatDecimal4', () => {
  it('round-trips integers', () => {
    expect(formatDecimal4(parseDecimal4('0'))).toBe('0');
    expect(formatDecimal4(parseDecimal4('500'))).toBe('500');
    expect(formatDecimal4(parseDecimal4('45000000'))).toBe('45000000');
  });

  it('round-trips decimals, trimming trailing zeros', () => {
    expect(formatDecimal4(parseDecimal4('12.5'))).toBe('12.5');
    expect(formatDecimal4(parseDecimal4('12.5000'))).toBe('12.5');
    expect(formatDecimal4(parseDecimal4('0.0001'))).toBe('0.0001');
    expect(formatDecimal4(parseDecimal4('8.25'))).toBe('8.25');
  });

  it('handles negatives (corrections, RN-C6)', () => {
    expect(formatDecimal4(parseDecimal4('-3'))).toBe('-3');
    expect(formatDecimal4(parseDecimal4('-0.5'))).toBe('-0.5');
    expect(parseDecimal4('-1') + parseDecimal4('1')).toBe(0n);
  });

  it('sums exactly where floats would drift', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE — must be exact here.
    const sum = parseDecimal4('0.1') + parseDecimal4('0.2');
    expect(formatDecimal4(sum)).toBe('0.3');
  });

  it('rejects malformed values', () => {
    expect(() => parseDecimal4('')).toThrow(InvalidDecimalError);
    expect(() => parseDecimal4('1.23456')).toThrow(InvalidDecimalError);
    expect(() => parseDecimal4('1,5')).toThrow(InvalidDecimalError);
    expect(() => parseDecimal4('abc')).toThrow(InvalidDecimalError);
    expect(() => parseDecimal4('1e5')).toThrow(InvalidDecimalError);
  });
});
