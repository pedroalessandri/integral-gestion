import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpRequest } from '../guards/mcp-auth.guard.js';
import { McpServerFactory } from './mcp-server.factory.js';

/** Transporte Streamable HTTP sin sesiones: un mensaje JSON-RPC por request, respuesta JSON (sin SSE). */
@Injectable()
export class McpHttpHandler {
  constructor(private readonly factory: McpServerFactory) {}

  async handle(request: McpRequest, response: Response): Promise<void> {
    const session = request.mcpSession;
    if (!session) {
      // Inalcanzable: McpAuthGuard siempre deja la sesión. Default deny por si cambia el orden de guards.
      response.status(401).json(jsonRpcError(-32001, 'No autenticado.'));
      return;
    }
    // Un mensaje por request: una llamada a herramienta = un request HTTP = un requestId.
    if (Array.isArray(request.body)) {
      response.status(400).json(jsonRpcError(-32600, 'Los lotes JSON-RPC no están soportados: enviá un mensaje por request.'));
      return;
    }

    const server = this.factory.create(session);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }
}

function jsonRpcError(code: number, message: string): { jsonrpc: '2.0'; error: { code: number; message: string }; id: null } {
  return { jsonrpc: '2.0', error: { code, message }, id: null };
}
