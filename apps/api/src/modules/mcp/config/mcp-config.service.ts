import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROTECTED_RESOURCE_METADATA_PATH } from '../../../config/mcp-routes.js';

/** Scopes OAuth del conector (ADR-0010 D3). */
export const MCP_SCOPE_READ = 'plan:read';
export const MCP_SCOPE_WRITE = 'plan:write';

/**
 * Configuración tipada del conector, leída una sola vez de las variables ya validadas por `validateEnv`.
 */
@Injectable()
export class McpConfig {
  readonly enabled: boolean;
  /** URL EXACTA del endpoint MCP: identificador del recurso (RFC 9728). Vacía si el conector está apagado. */
  readonly resourceUrl: string;
  /** Audiencia que tiene que traer el access token. Por defecto, la URL del recurso. */
  readonly audience: string;
  readonly allowedOrigins: readonly string[];
  readonly rateReadPerMin: number;
  readonly rateWritePerMin: number;
  readonly rateWritePerDay: number;
  readonly maxResponseChars: number;
  /** Issuer de Auth0 con barra final: es el servidor de autorización que se anuncia en la metadata. */
  readonly authorizationServer: string;
  /** URL absoluta de la metadata RFC 9728 de este recurso (va en `WWW-Authenticate`). */
  readonly metadataUrl: string;

  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('MCP_ENABLED') === true;
    this.resourceUrl = config.get<string>('MCP_RESOURCE_URL') ?? '';
    this.audience = config.get<string>('MCP_AUTH0_AUDIENCE') || this.resourceUrl;
    this.allowedOrigins = (config.get<string>('MCP_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    this.rateReadPerMin = config.get<number>('MCP_RATE_READ_PER_MIN') ?? 60;
    this.rateWritePerMin = config.get<number>('MCP_RATE_WRITE_PER_MIN') ?? 10;
    this.rateWritePerDay = config.get<number>('MCP_RATE_WRITE_PER_DAY') ?? 300;
    this.maxResponseChars = config.get<number>('MCP_MAX_RESPONSE_CHARS') ?? 60_000;
    this.authorizationServer = `${config.getOrThrow<string>('AUTH0_ISSUER_BASE_URL').replace(/\/+$/, '')}/`;
    this.metadataUrl = this.resourceUrl ? buildMetadataUrl(this.resourceUrl) : '';
  }
}

/**
 * RFC 9728 §3.1: la ruta bien conocida se inserta entre el host y la ruta del recurso.
 * `https://api.example.org/mcp` -> `https://api.example.org/.well-known/oauth-protected-resource/mcp`.
 */
export function buildMetadataUrl(resourceUrl: string): string {
  const url = new URL(resourceUrl);
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  return `${url.origin}/${PROTECTED_RESOURCE_METADATA_PATH}${path}`;
}
