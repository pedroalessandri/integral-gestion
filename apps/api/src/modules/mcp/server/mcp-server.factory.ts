import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import { ToolDispatcher } from '../dispatch/tool-dispatcher.service.js';
import type { McpSession } from '../dispatch/mcp-session.js';
import { McpToolRegistry } from '../tools/tool-registry.js';
import { MCP_SERVER_INSTRUCTIONS } from './mcp-instructions.js';

/**
 * Arma un `McpServer` por request (stateless, ADR-0010 D2): sin sesiones, sobrevive a redeploys y no necesita
 * afinidad. Cada herramienta queda atada a la sesión verificada del request.
 */
@Injectable()
export class McpServerFactory {
  constructor(
    private readonly registry: McpToolRegistry,
    private readonly dispatcher: ToolDispatcher,
  ) {}

  create(session: McpSession): McpServer {
    const server = new McpServer(
      { name: 'gestion-integral', version: '1.0.0' },
      { instructions: MCP_SERVER_INSTRUCTIONS, capabilities: { tools: {} } },
    );
    // Firma acotada: los genéricos de `registerTool` con esquemas dinámicos exceden la profundidad de tipos de TS.
    const register = server.registerTool.bind(server) as unknown as (
      name: string,
      config: {
        title: string;
        description: string;
        inputSchema: z.ZodRawShape;
        outputSchema: z.AnyZodObject;
        annotations: ToolAnnotations;
      },
      callback: (args: Record<string, unknown>) => Promise<CallToolResult>,
    ) => unknown;
    for (const tool of this.registry.tools) {
      register(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
        },
        (args: Record<string, unknown>) => this.dispatcher.execute(tool, args, session),
      );
    }
    return server;
  }
}
