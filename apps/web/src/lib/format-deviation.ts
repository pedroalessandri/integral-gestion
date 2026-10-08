/**
 * Desvío en puntos porcentuales a partir de bp enteros (100 bp = 1 punto). Redondeo solo de presentación y con
 * aritmética entera: nada de floats para porcentajes. Positivo = adelantado, negativo = atrasado.
 * Ej: 1250 -> "+12,5 pts"; -3040 -> "-30,4 pts"; 0 -> "0,0 pts".
 */
export function formatDeviationPoints(deviationBp: number): string {
  const tenths = Math.round(Math.abs(deviationBp) / 10);
  const sign = deviationBp === 0 || tenths === 0 ? '' : deviationBp > 0 ? '+' : '-';
  return `${sign}${Math.floor(tenths / 10)},${tenths % 10} pts`;
}
