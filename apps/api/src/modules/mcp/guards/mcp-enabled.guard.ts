import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { McpConfig } from '../config/mcp-config.service.js';

/** Kill switch global (ADR-0010 D1): con `MCP_ENABLED=false`, el endpoint y su metadata responden 404. */
@Injectable()
export class McpEnabledGuard implements CanActivate {
  constructor(private readonly config: McpConfig) {}

  canActivate(): boolean {
    if (!this.config.enabled) throw new NotFoundException();
    return true;
  }
}
