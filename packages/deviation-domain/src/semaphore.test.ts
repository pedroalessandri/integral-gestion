import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { semaphore, DEFAULT_SEMAPHORE_THRESHOLDS } from './semaphore';

describe('semaphore', () => {
  it('umbrales por defecto 10 y 25 puntos, bordes del lado benigno', () => {
    expect(DEFAULT_SEMAPHORE_THRESHOLDS).toEqual({ yellowBp: 1000, redBp: 2500 });
    expect(semaphore(5000)).toBe('green');
    expect(semaphore(0)).toBe('green');
    expect(semaphore(-1000)).toBe('green');
    expect(semaphore(-1001)).toBe('yellow');
    expect(semaphore(-2500)).toBe('yellow');
    expect(semaphore(-2501)).toBe('red');
  });
  it('acepta umbrales propios', () => {
    expect(semaphore(-600, { yellowBp: 500, redBp: 800 })).toBe('yellow');
  });
  it('rechaza entradas inválidas', () => {
    expect(() => semaphore(1.5)).toThrow(RangeError);
    expect(() => semaphore(0, { yellowBp: 300, redBp: 200 })).toThrow(RangeError);
    expect(() => semaphore(0, { yellowBp: -1, redBp: 200 })).toThrow(RangeError);
  });
  it('es monótono: más atraso nunca mejora el color (property)', () => {
    const rank = { green: 0, yellow: 1, red: 2 } as const;
    fc.assert(
      fc.property(fc.integer({ min: -20_000, max: 20_000 }), fc.integer({ min: 0, max: 5_000 }), (dev, extra) => {
        expect(rank[semaphore(dev - extra)]).toBeGreaterThanOrEqual(rank[semaphore(dev)]);
      }),
    );
  });
});
