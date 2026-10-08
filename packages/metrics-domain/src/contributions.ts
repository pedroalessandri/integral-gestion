import { formatDecimal4, parseDecimal4 } from './decimal';

/**
 * Resumen de los aportes de proyectos a un indicador (RN-P12, RN-P17). Todo exacto (bigint escalado), sin floats.
 * `coversTarget` responde: si todos los proyectos con aporte se completan, ¿el indicador llega a la meta?
 *  - meta > base (creciente): base + Σ aportes >= meta.
 *  - meta < base (decreciente): base + Σ aportes <= meta.
 */
export interface ContributionsSummary {
  count: number;
  /** Σ aportes (decimal string). */
  total: string;
  /** base + Σ aportes (decimal string). */
  projectedValue: string;
  coversTarget: boolean;
}

export function summarizeContributions(input: {
  baseline: string;
  target: string;
  contributionValues: ReadonlyArray<string>;
}): ContributionsSummary {
  const baseline = parseDecimal4(input.baseline);
  const target = parseDecimal4(input.target);
  let total = 0n;
  for (const value of input.contributionValues) total += parseDecimal4(value);
  const projected = baseline + total;
  const coversTarget = target >= baseline ? projected >= target : projected <= target;
  return {
    count: input.contributionValues.length,
    total: formatDecimal4(total),
    projectedValue: formatDecimal4(projected),
    coversTarget,
  };
}
