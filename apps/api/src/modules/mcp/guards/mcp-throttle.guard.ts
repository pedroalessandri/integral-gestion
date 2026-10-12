import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpRateLimiter, type HttpRateScope } from '../dispatch/mcp-rate-limiter.service.js';
import type { McpRequest } from './mcp-auth.guard.js';

function reject(response: Response, retryAfterSeconds: number): never {
  response.setHeader('Retry-After', String(retryAfterSeconds));
  throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'RateLimited' }, HttpStatus.TOO_MANY_REQUESTS);
}

/**
 * Tope por IP del endpoint MCP, ANTES de autenticar (fix C26b): acota el costo de requests sin token o con token
 * inválido (verificación de JWT, JWKS). `req.ip` respeta `trust proxy` de `main.ts`. El throttler global de
 * `@nestjs/throttler` está salteado en `/mcp`; el límite vive en `McpRateLimiter` (no se agregan throttlers
 * nombrados a `forRoot`, ver `throttler.config.ts`).
 */
@Injectable()
export class McpIpThrottleGuard implements CanActivate {
  constructor(private readonly limiter: McpRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const decision = this.limiter.checkHttp('ip' satisfies HttpRateScope, request.ip ?? 'unknown');
    if (!decision.allowed) reject(http.getResponse<Response>(), decision.retryAfterSeconds);
    return true;
  }
}

/** Tope HTTP por usuario, DESPUÉS de autenticar: cuenta todo request (también `initialize` y `tools/list`). */
@Injectable()
export class McpUserThrottleGuard implements CanActivate {
  constructor(private readonly limiter: McpRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const session = http.getRequest<McpRequest>().mcpSession;
    // Default deny: sin sesión no se llega acá (McpAuthGuard corre antes).
    if (!session) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    const decision = this.limiter.checkHttp('user', session.authContext.userId);
    if (!decision.allowed) reject(http.getResponse<Response>(), decision.retryAfterSeconds);
    return true;
  }
}
