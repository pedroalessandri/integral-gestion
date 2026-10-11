/**
 * Texto del error con el vocabulario del sector (ADR-0011 D3): si el diccionario del sector tiene un mensaje para
 * `code`, gana; si no, queda el texto que armó la server action (neutro para los códigos con vocabulario de sector).
 */
export function resolveSectorError(
  errors: Readonly<Record<string, string>>,
  code: string | null,
  fallback: string,
): string {
  if (code === null) return fallback;
  return errors[code] ?? fallback;
}
