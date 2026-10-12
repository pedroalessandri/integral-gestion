import { Controller, Get, Header, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/index.js';
import { MCP_ENDPOINT_PATH, PROTECTED_RESOURCE_METADATA_PATH } from '../../../config/mcp-routes.js';
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE, McpConfig } from '../config/mcp-config.service.js';
import { McpEnabledGuard } from '../guards/mcp-enabled.guard.js';

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
  resource_name: string;
}

/**
 * Metadata de recurso protegido (RFC 9728, ADR-0010 D3). Pública y estática. Se sirve con y sin el sufijo `/mcp`
 * (RFC 9728 §3.1 usa la ruta del recurso; algunos clientes piden la ruta sin sufijo). La metadata del servidor de
 * autorización la sirve Auth0.
 */
@Controller({ version: VERSION_NEUTRAL })
@Public()
@SkipThrottle()
@UseGuards(McpEnabledGuard)
export class ProtectedResourceMetadataController {
  constructor(private readonly config: McpConfig) {}

  @Get([PROTECTED_RESOURCE_METADATA_PATH, `${PROTECTED_RESOURCE_METADATA_PATH}/${MCP_ENDPOINT_PATH}`])
  @Header('Cache-Control', 'public, max-age=300')
  @Header('Access-Control-Allow-Origin', '*')
  get(): ProtectedResourceMetadata {
    return {
      resource: this.config.resourceUrl,
      authorization_servers: [this.config.authorizationServer],
      scopes_supported: [MCP_SCOPE_READ, MCP_SCOPE_WRITE, 'offline_access'],
      bearer_methods_supported: ['header'],
      resource_name: 'Gestión Integral - Conector MCP',
    };
  }
}
