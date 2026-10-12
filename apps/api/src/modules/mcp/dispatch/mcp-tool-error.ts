import { HttpException } from '@nestjs/common';

/**
 * Error de herramienta con código estable. El dispatcher lo traduce a un resultado `isError: true`; nunca viaja
 * como stack trace ni como error de protocolo JSON-RPC (ADR-0010 D5).
 */
export class McpToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    /** `denied` = no autorizado (alcance, módulo, permiso, membresía); `error` = falla de negocio. */
    readonly outcome: 'denied' | 'error' | 'rate_limited' = 'error',
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

const MESSAGES_ES: Record<string, string> = {
  TenantMembershipDenied: 'El usuario no es miembro de esa organización.',
  OrganizationNotFound: 'La organización indicada no existe.',
  OrganizationInactive: 'La organización indicada está inactiva.',
  ModuleDisabled: 'El módulo necesario no está habilitado para esa organización.',
  PermissionDenied: 'El rol del usuario en esa organización no tiene permiso para esta herramienta.',
  OrgUnitScopeForbidden: 'La unidad queda fuera del alcance del usuario.',
  PeriodClosed: 'El período está cerrado y no admite cambios.',
  OpenPeriodNotFound: 'La organización no tiene un período abierto: indicá un período con periodoId.',
};

const STATUS_CODES: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
  422: 'UnprocessableEntity',
};

/** Mensaje genérico por status para códigos fuera de la lista blanca: nunca se reenvía texto libre de un service. */
const STATUS_MESSAGES: Record<number, string> = {
  400: 'La solicitud no es válida.',
  401: 'No autenticado.',
  403: 'No tenés permiso para esta operación.',
  404: 'No se encontró el recurso pedido.',
  409: 'La operación entra en conflicto con el estado actual.',
  422: 'Los datos no cumplen las reglas del dominio.',
};

/** Traduce una excepción de un service a un error de herramienta; `null` si no es una `HttpException`. */
export function toToolError(err: unknown): McpToolError | null {
  if (err instanceof McpToolError) return err;
  if (!(err instanceof HttpException)) return null;

  const status = err.getStatus();
  const response = err.getResponse();
  const raw =
    typeof response === 'string'
      ? response
      : typeof (response as { message?: unknown }).message === 'string'
        ? (response as { message: string }).message
        : err.message;

  const prefixed = /^([A-Z][A-Za-z0-9]+)(?::\s*([\s\S]*))?$/.exec(raw);
  const code = prefixed?.[1] ?? STATUS_CODES[status] ?? 'Error';
  // Lista blanca: solo los códigos conocidos llevan su texto; el resto, un mensaje genérico por status. El texto
  // libre de un service (ids, nombres, SQL, rutas) no llega al modelo (hallazgo #4 de la revisión de C26).
  const message = MESSAGES_ES[code] ?? STATUS_MESSAGES[status] ?? 'No se pudo completar la operación.';
  const denied = status === 401 || status === 403;
  return new McpToolError(code, message.slice(0, 500), undefined, denied ? 'denied' : 'error');
}
