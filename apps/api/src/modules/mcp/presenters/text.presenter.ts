/**
 * Saneamiento de texto para el modelo (ADR-0010 D9). Los textos libres los escriben personas de la organización
 * y vuelven al modelo: se eliminan caracteres de control, se recorta y se neutraliza la sintaxis de imagen
 * Markdown (vector típico de exfiltración por URL). No se reescribe el resto del texto.
 */

/** Controles C0 y C1 salvo salto de línea y tabulación; más caracteres de formato bidi y de ancho cero. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]/g;

export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_LIST_CHARS = 500;
export const MAX_DESCRIPTION_DETAIL_CHARS = 2000;

/** Quita controles y neutraliza `![` (imagen Markdown) sin recortar. */
export function cleanText(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(/!\[/g, '! [');
}

/** `cleanText` + recorte a `maxChars` (con "…" si se cortó). */
export function safeText(value: string, maxChars: number): string {
  const cleaned = cleanText(value).trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, Math.max(0, maxChars - 1))}…` : cleaned;
}

export function safeTextOrNull(value: string | null | undefined, maxChars: number): string | null {
  if (value === null || value === undefined) return null;
  const out = safeText(value, maxChars);
  return out.length > 0 ? out : null;
}

/**
 * Red de seguridad final: recorre un valor JSON y aplica `cleanText` a TODA cadena (también ids y fechas, que no
 * se ven afectados). Los recortes de longitud los hacen los presenters.
 */
export function scrubDeep<T>(value: T): T {
  if (typeof value === 'string') return cleanText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDeep(v);
    return out as T;
  }
  return value;
}
