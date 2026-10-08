/**
 * Helpers de UI para pesos en basis points (RN-P6/RN-P7). Aritmética entera: nunca `parseFloat`.
 * La validez real del grupo la decide la API (422 `WeightSumInvalid` / `MixedWeightGroup`).
 */
export const TOTAL_WEIGHT_BP = 10000;

export type WeightGroupMode = 'empty' | 'weighted' | 'unweighted' | 'mixed';

export function weightGroupMode(items: ReadonlyArray<{ weightBp: number | null }>): WeightGroupMode {
  if (items.length === 0) return 'empty';
  const withWeight = items.filter((i) => i.weightBp !== null).length;
  if (withWeight === 0) return 'unweighted';
  return withWeight === items.length ? 'weighted' : 'mixed';
}

/** Reparto equitativo que suma exactamente 10000: el resto se reparte de a 1 bp desde el primero. */
export function equalSplitBp(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(TOTAL_WEIGHT_BP / count);
  const remainder = TOTAL_WEIGHT_BP - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** "33,33" | "33.3" | "40 %" -> bp entero (máx. 2 decimales). `null` si no es válido o excede 100. */
export function parsePercentToBp(input: string): number | null {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*%?\s*$/.exec(input);
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp <= TOTAL_WEIGHT_BP ? bp : null;
}

/** bp -> texto editable en porcentaje, sin pasar por floats ("3333" -> "33,33", "2500" -> "25"). */
export function bpToPercentInput(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return String(whole);
  return `${whole},${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** Redondeo solo de presentación. */
export function formatBpPercent(bp: number, decimals = 1): string {
  return `${(bp / 100).toFixed(decimals)}%`;
}

/** Suma de los pesos del borrador; `null` si alguna fila no se puede interpretar. */
export function sumDraftBp(drafts: ReadonlyArray<string>): number | null {
  let total = 0;
  for (const d of drafts) {
    const bp = parsePercentToBp(d);
    if (bp === null) return null;
    total += bp;
  }
  return total;
}
