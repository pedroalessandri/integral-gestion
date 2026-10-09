import { describe, it, expect } from 'vitest';
import { progressBp, objectiveIndicatorProgressBp, deviationBp } from './progress';

describe('progressBp — interpolation edge cases', () => {
  it('increasing metric: linear midpoint → 5000bp', () => {
    expect(progressBp({ actual: '50', baseline: '0', target: '100' })).toBe(5_000);
  });

  it('increasing metric: clamps below baseline to 0 and beyond target to 10000', () => {
    expect(progressBp({ actual: '-10', baseline: '0', target: '100' })).toBe(0);
    expect(progressBp({ actual: '250', baseline: '0', target: '100' })).toBe(10_000);
  });

  it('decreasing metric (target < baseline): same formula via the span sign', () => {
    // baseline 100 → target 20; actual 60 is halfway → 5000bp.
    expect(progressBp({ actual: '60', baseline: '100', target: '20' })).toBe(5_000);
    // Getting worse (above baseline) clamps to 0.
    expect(progressBp({ actual: '120', baseline: '100', target: '20' })).toBe(0);
    // Beating the target clamps to 10000.
    expect(progressBp({ actual: '10', baseline: '100', target: '20' })).toBe(10_000);
  });

  it('respects 4-decimal precision without floating error', () => {
    expect(progressBp({ actual: '0.3333', baseline: '0', target: '1' })).toBe(3_333);
  });

  it('baseline === target: 10000 iff actual reached the target, else 0', () => {
    expect(progressBp({ actual: '50', baseline: '50', target: '50' })).toBe(10_000);
    expect(progressBp({ actual: '49.9999', baseline: '50', target: '50' })).toBe(0);
    expect(progressBp({ actual: '50.0001', baseline: '50', target: '50' })).toBe(0);
  });
});

describe('objectiveIndicatorProgressBp', () => {
  it('sin cargas -> 0, aunque el indicador sea decreciente y la base de la métrica ya esté en la meta', () => {
    expect(
      objectiveIndicatorProgressBp({ metricBaseline: '0', increments: [], baseline: '100', target: '0' }),
    ).toBe(0);
  });

  it('usa base y meta del indicador y el acumulado de la métrica (base de la métrica + incrementos)', () => {
    // métrica: base 0, +30 +20 -> acumulado 50; indicador: 0 -> 100
    expect(
      objectiveIndicatorProgressBp({ metricBaseline: '0', increments: ['30', '20'], baseline: '0', target: '100' }),
    ).toBe(5_000);
    // misma serie, pero el indicador tiene otra base/meta: 50 sobre 40 -> 80
    expect(
      objectiveIndicatorProgressBp({ metricBaseline: '0', increments: ['30', '20'], baseline: '40', target: '80' }),
    ).toBe(2_500);
  });

  it('indicador decreciente: la dirección sale del signo de (meta - base)', () => {
    expect(
      objectiveIndicatorProgressBp({ metricBaseline: '100', increments: ['-40'], baseline: '100', target: '20' }),
    ).toBe(5_000);
  });

  it('acota a 0..10000 y respeta incrementos negativos (compensatorios)', () => {
    expect(
      objectiveIndicatorProgressBp({ metricBaseline: '0', increments: ['500'], baseline: '0', target: '100' }),
    ).toBe(10_000);
    expect(
      objectiveIndicatorProgressBp({ metricBaseline: '0', increments: ['50', '-80'], baseline: '0', target: '100' }),
    ).toBe(0);
  });
});

describe('deviationBp (adaptador de decimales sobre deviation-domain)', () => {
  it('parsea los strings y delega el cálculo', () => {
    expect(deviationBp({ actual: '60', expected: '50', baseline: '0', target: '100' })).toBe(1000);
    expect(deviationBp({ actual: '40', expected: '50', baseline: '100', target: '0' })).toBe(1000);
    expect(deviationBp({ actual: '3.5', expected: '2', baseline: '5', target: '5' })).toBe(0);
  });
});
