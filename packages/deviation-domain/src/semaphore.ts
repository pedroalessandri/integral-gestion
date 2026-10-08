export type SemaphoreColor = 'green' | 'yellow' | 'red';

/** Umbrales en bp (100 bp = 1 punto). Ambos son magnitudes de atraso, `yellowBp <= redBp`. */
export interface SemaphoreThresholds {
  yellowBp: number;
  redBp: number;
}

/** RN-P9 / PA-4: 10 y 25 puntos por defecto (configurables por org en una fase posterior). */
export const DEFAULT_SEMAPHORE_THRESHOLDS: SemaphoreThresholds = { yellowBp: 1_000, redBp: 2_500 };

/**
 * Semáforo por desvío (RN-P9). Solo el atraso penaliza: adelantado es verde.
 *  - verde:    dev >= −yellowBp
 *  - amarillo: −redBp <= dev < −yellowBp
 *  - rojo:     dev < −redBp
 * Los bordes caen del lado benigno (exactamente −10 puntos es verde, −25 exacto es amarillo).
 *
 * @throws RangeError si el desvío no es entero o los umbrales no cumplen 0 <= yellowBp <= redBp.
 */
export function semaphore(
  deviationBpValue: number,
  thresholds: SemaphoreThresholds = DEFAULT_SEMAPHORE_THRESHOLDS,
): SemaphoreColor {
  const { yellowBp, redBp } = thresholds;
  if (!Number.isInteger(deviationBpValue)) throw new RangeError('deviation must be an integer (bp)');
  if (!Number.isInteger(yellowBp) || !Number.isInteger(redBp) || yellowBp < 0 || yellowBp > redBp) {
    throw new RangeError('thresholds must be integers with 0 <= yellowBp <= redBp');
  }
  if (deviationBpValue >= -yellowBp) return 'green';
  if (deviationBpValue >= -redBp) return 'yellow';
  return 'red';
}
