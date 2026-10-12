import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { McpConfig } from '../config/mcp-config.service.js';

/**
 * Coincidencia de un `Origin` con un patrón de la allow-list. Exacto, salvo que el patrón termine en `:*`, que
 * admite cualquier puerto numérico (`http://localhost:*`, solo para MCP Inspector en desarrollo).
 */
export function originMatches(origin: string, pattern: string): boolean {
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1); // conserva los dos puntos
    return origin.toLowerCase().startsWith(prefix.toLowerCase()) && /^\d+$/.test(origin.slice(prefix.length));
  }
  return origin.toLowerCase() === pattern.toLowerCase();
}

/**
 * Protección contra DNS rebinding (spec MCP, ADR-0010 D2): si el request trae `Origin`, tiene que estar en
 * `MCP_ALLOWED_ORIGINS`. Los backends de Anthropic/OpenAI no mandan `Origin`.
 */
@Injectable()
export class McpOriginGuard implements CanActivate {
  constructor(private readonly config: McpConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<Request>().headers['origin'];
    if (origin === undefined) return true;
    if (typeof origin === 'string' && this.config.allowedOrigins.some((p) => originMatches(origin, p))) return true;
    throw new ForbiddenException('OriginNotAllowed');
  }
}
