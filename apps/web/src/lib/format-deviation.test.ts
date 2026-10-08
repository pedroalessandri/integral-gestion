import { describe, expect, it } from 'vitest';
import { formatDeviationPoints } from './format-deviation';

describe('formatDeviationPoints', () => {
  it('muestra el signo, una decimal con coma y "pts"', () => {
    expect(formatDeviationPoints(1250)).toBe('+12,5 pts');
    expect(formatDeviationPoints(-3040)).toBe('-30,4 pts');
    expect(formatDeviationPoints(-2000)).toBe('-20,0 pts');
  });
  it('el cero y lo que redondea a cero no llevan signo', () => {
    expect(formatDeviationPoints(0)).toBe('0,0 pts');
    expect(formatDeviationPoints(-4)).toBe('0,0 pts');
  });
  it('soporta desvíos de más de 100 puntos', () => {
    expect(formatDeviationPoints(12345)).toBe('+123,5 pts');
  });
});
