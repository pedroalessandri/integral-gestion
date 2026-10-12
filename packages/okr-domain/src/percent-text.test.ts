import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatBpAsPercentString, parsePercentStringToBp } from './percent-text';

describe('parsePercentStringToBp', () => {
  it('parsea valores exactos sin pasar por flotantes', () => {
    expect(parsePercentStringToBp('45.5')).toBe(4550);
    expect(parsePercentStringToBp('45.30')).toBe(4530);
    expect(parsePercentStringToBp('0.05')).toBe(5);
    expect(parsePercentStringToBp('0')).toBe(0);
    expect(parsePercentStringToBp('100')).toBe(10000);
    expect(parsePercentStringToBp('100.00')).toBe(10000);
    expect(parsePercentStringToBp('0.29')).toBe(29); // 0.29 * 100 = 28.999... en flotante
    expect(parsePercentStringToBp('1.15')).toBe(115);
  });

  it.each(['', '-1', '+5', '1,5', '1e2', ' 5', '5 ', '12.345', '.5', '5.', '100.01', '101', '1000', 'abc'])(
    'rechaza %j',
    (text) => {
      expect(() => parsePercentStringToBp(text)).toThrow(RangeError);
    },
  );
});

describe('formatBpAsPercentString', () => {
  it('formatea con 2 decimales exactos', () => {
    expect(formatBpAsPercentString(4530)).toBe('45.30');
    expect(formatBpAsPercentString(0)).toBe('0.00');
    expect(formatBpAsPercentString(5)).toBe('0.05');
    expect(formatBpAsPercentString(10000)).toBe('100.00');
  });

  it('soporta desvíos con signo y no emite -0.00', () => {
    expect(formatBpAsPercentString(-320)).toBe('-3.20');
    expect(formatBpAsPercentString(-5)).toBe('-0.05');
    expect(formatBpAsPercentString(320)).toBe('3.20');
    expect(formatBpAsPercentString(-5, 1)).toBe('0.0');
    expect(formatBpAsPercentString(-150, 1)).toBe('-1.5');
  });

  it('trunca o completa según decimals', () => {
    expect(formatBpAsPercentString(4599, 0)).toBe('45');
    expect(formatBpAsPercentString(4599, 1)).toBe('45.9');
    expect(formatBpAsPercentString(4530, 4)).toBe('45.3000');
  });

  it('rechaza entradas inválidas', () => {
    expect(() => formatBpAsPercentString(1.5)).toThrow(RangeError);
    expect(() => formatBpAsPercentString(Number.NaN)).toThrow(RangeError);
    expect(() => formatBpAsPercentString(10, 5)).toThrow(RangeError);
    expect(() => formatBpAsPercentString(10, -1)).toThrow(RangeError);
  });
});

describe('propiedad: parse(format(bp)) === bp', () => {
  it('es la identidad para todo bp en 0..10000', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (bp) => {
        expect(parsePercentStringToBp(formatBpAsPercentString(bp))).toBe(bp);
      }),
    );
  });

  it('el texto siempre tiene exactamente 2 decimales con punto', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10000, max: 10000 }), (bp) => {
        expect(formatBpAsPercentString(bp)).toMatch(/^-?\d{1,3}\.\d{2}$/);
      }),
    );
  });
});
