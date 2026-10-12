import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../auth/index.js';

export interface ToolCallRecord {
  organizationId: string | null;
  userId: string;
  clientId: string;
  toolName: string;
  kind: 'read' | 'write';
  outcome: 'ok' | 'error' | 'denied' | 'rate_limited';
  errorCode: string | null;
  latencyMs: number;
  responseChars: number;
  requestId: string;
}

/** Retención del log operativo (ADR-0010 D10, Pregunta abierta 9). */
export const TOOL_CALL_RETENTION_DAYS = 180;

/**
 * Log operativo `mcp.tool_call` (ADR-0010 D10). NO es audit: es purgable. Sin argumentos ni contenido de
 * respuestas. Es la única tabla que el módulo `mcp` toca directamente.
 */
@Injectable()
export class ToolCallRepository {
  private readonly logger = new Logger(ToolCallRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Mejor esfuerzo: un fallo del log no puede romper la herramienta. */
  async record(entry: ToolCallRecord): Promise<void> {
    try {
      await this.prisma.raw.mcpToolCall.create({
        data: {
          organizationId: entry.organizationId,
          userId: entry.userId,
          clientId: entry.clientId.slice(0, 128),
          toolName: entry.toolName.slice(0, 64),
          kind: entry.kind,
          outcome: entry.outcome,
          errorCode: entry.errorCode?.slice(0, 64) ?? null,
          latencyMs: Math.max(0, Math.round(entry.latencyMs)),
          responseChars: Math.max(0, entry.responseChars),
          requestId: entry.requestId,
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo registrar mcp.tool_call (${entry.toolName}): ${String(err)}`);
    }
  }

  /** Purga diaria por retención. `mcp.tool_call` no tiene trigger append-only por diseño. */
  @Cron('0 4 * * *')
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - TOOL_CALL_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.raw.mcpToolCall.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (count > 0) this.logger.log(`Purgadas ${count} filas de mcp.tool_call anteriores a ${cutoff.toISOString()}`);
      return count;
    } catch (err) {
      this.logger.warn(`Falló la purga de mcp.tool_call: ${String(err)}`);
      return 0;
    }
  }
}
