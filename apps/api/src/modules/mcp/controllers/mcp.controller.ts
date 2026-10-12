import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  MethodNotAllowedException,
  Post,
  Req,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../auth/index.js';
import { MCP_ENDPOINT_PATH } from '../../../config/mcp-routes.js';
import { McpAuthGuard, type McpRequest } from '../guards/mcp-auth.guard.js';
import { McpEnabledGuard } from '../guards/mcp-enabled.guard.js';
import { McpOriginGuard } from '../guards/mcp-origin.guard.js';
import { McpHttpHandler } from '../server/mcp-http-handler.service.js';

/**
 * Endpoint MCP (ADR-0010 D2). Fuera del prefijo `api` y del versionado. `@Public()` frente al `AuthGuard` global
 * (que valida la audiencia de la web): la autenticación la hace `McpAuthGuard` con la audiencia del conector.
 * Throttler global salteado: el límite es por usuario y por herramienta, dentro del dispatcher (D8).
 * Orden de guards: kill switch (404) -> Origin (403) -> token (401).
 */
@Controller({ path: MCP_ENDPOINT_PATH, version: VERSION_NEUTRAL })
@Public()
@SkipThrottle()
@UseGuards(McpEnabledGuard, McpOriginGuard, McpAuthGuard)
export class McpController {
  constructor(private readonly handler: McpHttpHandler) {}

  @Post()
  @HttpCode(200)
  async handle(@Req() request: McpRequest, @Res() response: Response): Promise<void> {
    await this.handler.handle(request, response);
  }

  /** Sin stream servidor -> cliente ni sesiones que cerrar (stateless): GET y DELETE no se soportan. */
  @Get()
  @Header('Allow', 'POST')
  getNotSupported(): never {
    throw new MethodNotAllowedException();
  }

  @Delete()
  @Header('Allow', 'POST')
  deleteNotSupported(): never {
    throw new MethodNotAllowedException();
  }
}
