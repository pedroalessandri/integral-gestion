import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { AccessTokenVerifier } from '../../auth/index.js';
import { requestContextStorage } from '../../audit/index.js';
import { UserSyncService } from '../../core/index.js';
import { McpConfig, MCP_SCOPE_READ } from '../config/mcp-config.service.js';
import type { McpSession } from '../dispatch/mcp-session.js';

export type McpRequest = Request & { mcpSession?: McpSession; authContext?: AuthContext };

/**
 * Autenticación del endpoint MCP (ADR-0010 D3). Verifica el access token contra la AUDIENCIA DEL CONECTOR
 * (`MCP_AUTH0_AUDIENCE`): un token de la web (otra audiencia) se rechaza acá, y un token del conector se rechaza
 * en `/api/v1/*` porque `AuthGuard` solo acepta `AUTH0_AUDIENCE`.
 *
 * Sin token o con token inválido responde 401 con `WWW-Authenticate: Bearer resource_metadata="<URL>"`, que es
 * lo que dispara el flujo OAuth en el cliente. El token nunca se reenvía a otro servicio (sin token passthrough).
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);

  constructor(
    private readonly config: McpConfig,
    private readonly verifier: AccessTokenVerifier,
    private readonly userSync: UserSyncService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<McpRequest>();
    const response = http.getResponse<Response>();

    const header = request.headers['authorization'];
    const token = typeof header === 'string' && /^Bearer\s+\S+$/i.test(header) ? header.replace(/^Bearer\s+/i, '') : null;
    if (token === null) this.reject(response, 'JwtMissing', false);

    let payload;
    try {
      payload = await this.verifier.verify(token as string, { audience: this.config.audience });
    } catch (err) {
      const code = err instanceof UnauthorizedException ? String(err.message) : 'JwtMalformed';
      return this.reject(response, code, true);
    }

    const sub = payload['sub'];
    const email = payload['email'];
    if (typeof sub !== 'string' || sub.length === 0 || typeof email !== 'string' || email.length === 0) {
      // Sin `sub` o `email` no se puede resolver al usuario local (la Action de Auth0 agrega `email`).
      this.logger.warn('Access token del conector sin sub o email');
      return this.reject(response, 'JwtClaimsMissing', true);
    }
    const name = typeof payload['name'] === 'string' ? payload['name'] : email;

    // El guard corre antes de los interceptores: se da un contexto de request para el audit del alta de usuario.
    const user = await requestContextStorage.run({ requestId: randomUUID() }, () =>
      this.userSync.upsertFromJwt({ auth0_sub: sub, email, name }),
    );

    const authContext: AuthContext = {
      userId: user.id,
      auth0Sub: sub,
      email: user.email,
      displayName: user.displayName,
      isSuperadmin: user.isSuperadmin,
      organizationId: null,
      permissions: [],
      requestId: 'unknown',
    };
    const scopes = new Set(typeof payload['scope'] === 'string' ? payload['scope'].split(/\s+/).filter(Boolean) : []);
    const clientId = (typeof payload['azp'] === 'string' && payload['azp']) || (typeof payload['client_id'] === 'string' && payload['client_id']) || 'unknown';

    request.mcpSession = { authContext, clientId, scopes };
    // Lo lee TenantContextInterceptor para armar el ALS; la organización se resuelve luego, por herramienta.
    request.authContext = authContext;
    return true;
  }

  private reject(response: Response, code: string, withError: boolean): never {
    const params = [`resource_metadata="${this.config.metadataUrl}"`, `scope="${MCP_SCOPE_READ}"`];
    if (withError) params.push('error="invalid_token"');
    response.setHeader('WWW-Authenticate', `Bearer ${params.join(', ')}`);
    throw new UnauthorizedException(code);
  }
}
