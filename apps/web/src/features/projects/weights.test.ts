import { describe, expect, it } from 'vitest';
import {
  TOTAL_WEIGHT_BP,
  bpToPercentInput,
  equalSplitBp,
  parsePercentToBp,
  sumDraftBp,
  weightGroupMode,
} from './weights';

describe('weightGroupMode', () => {
  it('distingue vacío, sin pesos, ponderado y mixto', () => {
    expect(weightGroupMode([])).toBe('empty');
    expect(weightGroupMode([{ weightBp: null }, { weightBp: null }])).toBe('unweighted');
    expect(weightGroupMode([{ weightBp: 5000 }, { weightBp: 5000 }])).toBe('weighted');
    expect(weightGroupMode([{ weightBp: 5000 }, { weightBp: null }])).toBe('mixed');
  });
});

describe('equalSplitBp', () => {
  it.each([1, 2, 3, 7, 9])('suma exactamente 10000 con %i elementos', (n) => {
    expect(equalSplitBp(n).reduce((a, b) => a + b, 0)).toBe(TOTAL_WEIGHT_BP);
  });
  it('reparte el resto de a 1 bp desde el primero', () => {
    expect(equalSplitBp(3)).toEqual([3334, 3333, 3333]);
  });
});

describe('porcentaje <-> bp', () => {
  it('parsea con coma o punto, hasta 2 decimales, sin floats', () => {
    expect(parsePercentToBp('33,33')).toBe(3333);
    expect(parsePercentToBp('40 %')).toBe(4000);
    expect(parsePercentToBp('100')).toBe(10000);
    expect(parsePercentToBp('100,01')).toBeNull();
    expect(parsePercentToBp('abc')).toBeNull();
  });
  it('ida y vuelta', () => {
    expect(bpToPercentInput(3333)).toBe('33,33');
    expect(bpToPercentInput(2500)).toBe('25');
    expect(bpToPercentInput(2550)).toBe('25,5');
  });
  it('suma el borrador o devuelve null si alguna fila es inválida', () => {
    expect(sumDraftBp(['50', '50'])).toBe(10000);
    expect(sumDraftBp(['50', 'x'])).toBeNull();
  });
});
