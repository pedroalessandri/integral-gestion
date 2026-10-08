import { describe, it, expect } from 'vitest';
import { summarizeContributions } from './contributions';

describe('summarizeContributions (RN-P12/P17)', () => {
  it('creciente: base + Σ aportes >= meta cubre la meta', () => {
    expect(summarizeContributions({ baseline: '5', target: '35', contributionValues: ['10', '20'] })).toEqual({
      count: 2,
      total: '30',
      projectedValue: '35',
      coversTarget: true,
    });
  });

  it('creciente: si no alcanza, coversTarget es false', () => {
    const s = summarizeContributions({ baseline: '5', target: '35', contributionValues: ['4', '10.5'] });
    expect(s).toMatchObject({ total: '14.5', projectedValue: '19.5', coversTarget: false });
  });

  it('decreciente: base + Σ aportes (negativos) <= meta cubre la meta', () => {
    expect(summarizeContributions({ baseline: '100', target: '70', contributionValues: ['-20', '-10'] }).coversTarget).toBe(true);
    expect(summarizeContributions({ baseline: '100', target: '70', contributionValues: ['-20'] }).coversTarget).toBe(false);
  });

  it('sin aportes: total 0 y no cubre la meta', () => {
    expect(summarizeContributions({ baseline: '0', target: '10', contributionValues: [] })).toEqual({
      count: 0,
      total: '0',
      projectedValue: '0',
      coversTarget: false,
    });
  });

  it('es exacto con 4 decimales (sin errores de punto flotante)', () => {
    const s = summarizeContributions({ baseline: '0', target: '0.3', contributionValues: ['0.1', '0.2'] });
    expect(s).toMatchObject({ total: '0.3', coversTarget: true });
  });
});
