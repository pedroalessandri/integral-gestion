/**
 * Error de la API normalizado. El filtro global devuelve `{ statusCode, message, error }`
 * donde `error` es el nombre de la clase de excepción (p. ej. `ConflictException`); el código
 * de dominio (`OrgUnitHasChildren`, `MandateRangeInvalid`, ...) viaja como prefijo del `message`
 * ("Codigo: detalle").
 */
export interface ApiErrorInfo {
  status: number;
  /** Código de dominio extraído del prefijo del mensaje, o null si no hay. */
  code: string | null;
  message: string;
}

const CODE_PREFIX = /^([A-Z][A-Za-z0-9]+):\s*/;

export function parseApiErrorBody(status: number, body: unknown): ApiErrorInfo {
  const raw =
    typeof body === 'object' && body !== null && 'message' in body
      ? (body as { message: unknown }).message
      : undefined;
  const message = Array.isArray(raw) ? raw.map(String).join('. ') : typeof raw === 'string' ? raw : '';
  const match = CODE_PREFIX.exec(message);
  return {
    status,
    code: match?.[1] ?? null,
    message: match ? message.slice(match[0].length) : message,
  };
}

export async function readApiError(res: Response): Promise<ApiErrorInfo> {
  const body: unknown = await res.json().catch(() => ({}));
  return parseApiErrorBody(res.status, body);
}
