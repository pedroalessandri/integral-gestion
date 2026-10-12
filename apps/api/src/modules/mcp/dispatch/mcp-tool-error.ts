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
  const detail = prefixed?.[2]?.trim();
  const message = MESSAGES_ES[code] ?? (detail && detail.length > 0 ? detail : raw);
  const denied = status === 401 || status === 403;
  return new McpToolError(code, message.slice(0, 500), undefined, denied ? 'denied' : 'error');
}
