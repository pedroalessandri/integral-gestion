/**
 * Desvío contra lo esperado (RN-P9). Núcleo común de las dos lecturas de avance: lo usan resultado
 * (`metrics-domain`, valores decimales) y gestión (`okr-domain`, avance planificado por fechas) sin
 * depender de ninguno de los dos. Todo entero exacto (bigint / bp), nunca floats.
 */

/**
 * Desvío firmado, en bp del tramo base → meta: `(actual − esperado) / (meta − base) × 10000`, truncado
 * hacia cero y SIN acotar. Positivo = adelantado hacia la meta, negativo = atrasado. La dirección queda
 * implícita en el signo de (meta − base), así que sirve igual para metas crecientes y decrecientes.
 * Devuelve 0 si base === meta (tramo indefinido).
 *
 * Los cuatro valores deben estar en la MISMA escala entera (p. ej. decimal × 10^4); la escala se cancela.
 */
export function deviationBp(input: {
  actual: bigint;
  expected: bigint;
  baseline: bigint;
  target: bigint;
}): number {
  const span = input.target - input.baseline;
  if (span === 0n) return 0;
  return Number(((input.actual - input.expected) * 10_000n) / span);
}

/**
 * Desvío de gestión (RN-P9): avance real − avance planificado, ambos en bp (0..10000). El tramo es
 * 0 → 10000, así que es la resta directa. Positivo = adelantado.
 *
 * @throws RangeError si alguno no es entero.
 */
export function progressDeviationBp(actualBp: number, expectedBp: number): number {
  if (!Number.isInteger(actualBp) || !Number.isInteger(expectedBp)) {
    throw new RangeError('actualBp and expectedBp must be integers (bp)');
  }
  return actualBp - expectedBp;
}

export interface DeviationItem {
  /** Peso del hermano dentro de su grupo (RN-P6), o `null` si el grupo no pondera. */
  weightBp: number | null;
  /** Desvío del hermano en bp, o `null` si no se puede medir (p. ej. indicador sin datos). */
  deviationBp: number | null;
}

/**
 * Desvío agregado de un grupo de hermanos (indicadores de un objetivo): media ponderada si TODOS los
 * hermanos tienen peso, media simple si alguno no lo tiene (RN-P6 garantiza que es todo o nada). Los
 * hermanos sin desvío medible se excluyen y los pesos se re-normalizan entre los que quedan. Truncado
 * hacia cero. Devuelve `null` si ninguno es medible.
 */
export function aggregateDeviationBp(items: ReadonlyArray<DeviationItem>): number | null {
  const measurable = items.filter((i): i is DeviationItem & { deviationBp: number } => i.deviationBp !== null);
  if (measurable.length === 0) return null;
  for (const i of measurable) {
    if (!Number.isInteger(i.deviationBp)) throw new RangeError('deviationBp must be an integer (bp)');
  }

  const weighted = items.every((i) => i.weightBp !== null);
  if (weighted) {
    const totalWeight = measurable.reduce((acc, i) => acc + BigInt(i.weightBp as number), 0n);
    if (totalWeight > 0n) {
      const sum = measurable.reduce((acc, i) => acc + BigInt(i.weightBp as number) * BigInt(i.deviationBp), 0n);
      return Number(sum / totalWeight);
    }
  }
  const sum = measurable.reduce((acc, i) => acc + BigInt(i.deviationBp), 0n);
  return Number(sum / BigInt(measurable.length));
}
