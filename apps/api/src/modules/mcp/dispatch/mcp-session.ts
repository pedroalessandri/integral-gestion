import type { AuthContext } from '@gestion-publica/shared-types/auth';

/** Identidad verificada del request MCP, armada por `McpAuthGuard` a partir del access token. */
export interface McpSession {
  /** Contexto base del usuario (sin organización). */
  authContext: AuthContext;
  /** `azp` del token: client ID de OAuth del cliente MCP. Lo emite Auth0, es confiable. */
  clientId: string;
  /** Scopes del token (`plan:read`, `plan:write`). */
  scopes: ReadonlySet<string>;
}
