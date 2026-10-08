/** Decimal con hasta 4 decimales, como lo valida la API (NUMERIC(18,4)). */
export const DECIMAL_RE = /^-?\d{1,14}(\.\d{1,4})?$/;


const SCALE = 4;

/** Decimal string -> entero escalado 10^4, sin pasar por floats. `null` si no es un decimal válido. */
export function scaleDecimal(input: string): bigint | null {
  const value = input.trim();
  if (!DECIMAL_RE.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole = '0', frac = ''] = value.replace('-', '').split('.');
  const scaled = BigInt(whole + frac.padEnd(SCALE, '0'));
  return negative ? -scaled : scaled;
}
