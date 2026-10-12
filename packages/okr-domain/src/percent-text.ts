/**
 * Texto decimal exacto de porcentajes en basis points (ADR-0010, matemática de avance).
 *
 * Todo con aritmética entera: nunca pasa por un `Number` de punto flotante intermedio. 1 bp = 0,01 %.
 */

const PERCENT_TEXT = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/**
 * Parsea un porcentaje en texto decimal ("45.5", "100", "0.05") a basis points enteros.
 *
 * Acepta punto decimal, hasta 2 decimales y valores entre 0 y 100. Rechaza signo, coma, exponente, espacios,
 * más de 2 decimales y valores fuera de rango.
 *
 * @throws RangeError si el texto no cumple el formato o está fuera de 0–100.
 */
export function parsePercentStringToBp(text: string): number {
  const match = PERCENT_TEXT.exec(text);
  if (!match) {
    throw new RangeError(`parsePercentStringToBp: formato inválido "${text}" (se espera 0–100 con hasta 2 decimales)`);
  }
  const whole = Number.parseInt(match[1] as string, 10);
  const fraction = Number.parseInt(((match[2] ?? '') + '00').slice(0, 2), 10);
  const bp = whole * 100 + fraction;
  if (bp > 10000) {
    throw new RangeError(`parsePercentStringToBp: ${text} excede 100`);
  }
  return bp;
}

/**
 * Formatea basis points como texto decimal exacto con punto: `4530` -> `"45.30"`. Sirve también para desvíos
 * con signo: `-320` -> `"-3.20"` (los positivos no llevan "+").
 *
 * Con `decimals` < 2 trunca hacia cero (no redondea); con `decimals` > 2 completa con ceros.
 *
 * @param bp       Entero (puede ser negativo).
 * @param decimals Entero entre 0 y 4. Por defecto 2.
 * @throws RangeError si `bp` no es entero o `decimals` está fuera de 0–4.
 */
export function formatBpAsPercentString(bp: number, decimals = 2): string {
  if (!Number.isInteger(bp)) {
    throw new RangeError(`formatBpAsPercentString: bp debe ser entero, recibió ${bp}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
    throw new RangeError(`formatBpAsPercentString: decimals debe estar entre 0 y 4, recibió ${decimals}`);
  }
  const abs = Math.abs(bp);
  const whole = Math.trunc(abs / 100);
  const fractionDigits = (String(abs % 100).padStart(2, '0') + '00').slice(0, decimals);
  const body = decimals === 0 ? String(whole) : `${whole}.${fractionDigits}`;
  // "-0.00" no existe: un valor que trunca a cero no lleva signo.
  const isZero = /^0(\.0*)?$/.test(body);
  return bp < 0 && !isZero ? `-${body}` : body;
}
