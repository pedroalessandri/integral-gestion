import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { hasPermission } from '@gestion-publica/shared-types/auth';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ModuleEnablementService } from '../../core/index.js';
import { TenantMembershipResolver, tenantContextStorage } from '../../auth/index.js';
import { requestContextStorage } from '../../audit/index.js';
import { McpConfig } from '../config/mcp-config.service.js';
import { scrubDeep } from '../presenters/text.presenter.js';
import { ToolCallRepository, type ToolCallRecord } from '../repositories/tool-call.repository.js';
import type { McpToolDefinition, ToolOrganization, ToolOutput } from '../tools/tool-types.js';
import type { McpSession } from './mcp-session.js';
import { McpToolError, toToolError } from './mcp-tool-error.js';
import { McpRateLimiter } from './mcp-rate-limiter.service.js';

interface ResolvedOrganization {
  auth: AuthContext;
  organization: ToolOrganization;
}

/**
 * Despachador de herramientas (ADR-0010 D4, D5, D7, D8, D10). Por cada llamada, en este orden:
 * scope OAuth -> límite por usuario -> organización (parámetro o única disponible, sin bypass de superadmin) ->
 * módulos (`mcp` + los del endpoint REST equivalente) -> permiso RBAC -> handler dentro de los ALS de tenant y de
 * request -> tope de respuesta -> registro en `mcp.tool_call`.
 *
 * No tiene lógica de negocio: los services dueños aplican alcance por unidad, período abierto y demás reglas.
 */
@Injectable()
export class ToolDispatcher {
  private readonly logger = new Logger(ToolDispatcher.name);

  constructor(
    private readonly config: McpConfig,
    private readonly rateLimiter: McpRateLimiter,
    private readonly toolCalls: ToolCallRepository,
    private readonly moduleEnablement: ModuleEnablementService,
    private readonly memberships: TenantMembershipResolver,
  ) {}

  async execute(
    tool: McpToolDefinition,
    args: Record<string, unknown>,
    session: McpSession,
  ): Promise<CallToolResult> {
    const startedAt = Date.now();
    // El requestId lo genera siempre el servidor (nunca X-Request-Id): 1 llamada a herramienta = 1 requestId.
    const requestId = randomUUID();
    const record: ToolCallRecord = {
      organizationId: null,
      userId: session.authContext.userId,
      clientId: session.clientId,
      toolName: tool.name,
      kind: tool.kind,
      outcome: 'ok',
      errorCode: null,
      latencyMs: 0,
      responseChars: 0,
      requestId,
    };

    let result: CallToolResult;
    try {
      this.assertScope(tool, session);
      this.assertRateLimit(tool, session);

      const resolved = await this.resolveContext(tool, args, session, requestId);
      record.organizationId = resolved.organization?.id ?? null;

      const output = await requestContextStorage.run({ requestId }, () =>
        tenantContextStorage.run(resolved.auth, () =>
          tool.handler(args, {
            auth: resolved.auth,
            organization: resolved.organization,
            now: new Date(),
            maxResponseChars: this.config.maxResponseChars,
          }),
        ),
      );
      result = this.buildSuccess(output);
    } catch (err) {
      const toolError = toToolError(err);
      if (toolError) {
        record.outcome = toolError.outcome;
        record.errorCode = toolError.code;
        result = this.buildError(toolError);
      } else {
        this.logger.error(
          `Falla inesperada en la herramienta ${tool.name} (requestId ${requestId})`,
          err instanceof Error ? err.stack : String(err),
        );
        record.outcome = 'error';
        record.errorCode = 'InternalError';
        result = this.buildError(new McpToolError('InternalError', 'Error interno al ejecutar la herramienta.'));
      }
    }

    // Una respuesta que superó el tope sin poder recortarse también cuenta como error.
    if (result.isError === true && record.outcome === 'ok') {
      record.outcome = 'error';
      record.errorCode = 'ResponseTooLarge';
    }
    record.responseChars = result.content.reduce((sum, c) => sum + (c.type === 'text' ? c.text.length : 0), 0);
    record.latencyMs = Date.now() - startedAt;
    await this.toolCalls.record(record);
    return result;
  }

  // ── pasos ───────────────────────────────────────────────────────────────────

  private assertScope(tool: McpToolDefinition, session: McpSession): void {
    if (session.scopes.has(tool.scope)) return;
    const message =
      tool.scope === 'plan:write'
        ? 'El conector se autorizó solo para lectura. Hay que volver a conectarlo y aceptar el permiso de escritura (plan:write).'
        : 'El token del conector no incluye el permiso de lectura (plan:read). Hay que volver a conectarlo.';
    throw new McpToolError('ScopeMissing', message, { scopeRequerido: tool.scope }, 'denied');
  }

  private assertRateLimit(tool: McpToolDefinition, session: McpSession): void {
    const decision = this.rateLimiter.check(session.authContext.userId, tool.kind);
    if (decision.allowed) return;
    throw new McpToolError(
      'RateLimited',
      `Se superó el límite de uso del conector. Reintentá en ${decision.retryAfterSeconds} segundos.`,
      { reintentarEnSegundos: decision.retryAfterSeconds },
      'rate_limited',
    );
  }

  private async resolveContext(
    tool: McpToolDefinition,
    args: Record<string, unknown>,
    session: McpSession,
    requestId: string,
  ): Promise<{ auth: AuthContext; organization: ToolOrganization | null }> {
    const base: AuthContext = { ...session.authContext, requestId };
    if (!tool.requiresOrganization) return { auth: base, organization: null };

    const resolved = await this.resolveOrganization(args, base);

    // Módulos: `mcp` siempre, más los que exige el endpoint REST equivalente. Sin cache: deshabilitar corta al instante.
    for (const moduleKey of ['mcp', ...tool.modules]) {
      if (!(await this.moduleEnablement.isEnabled(resolved.organization.id, moduleKey))) {
        throw new McpToolError(
          'ModuleDisabled',
          `El módulo "${moduleKey}" no está habilitado para la organización.`,
          { modulo: moduleKey },
          'denied',
        );
      }
    }

    // Permiso RBAC por herramienta (no hay PermissionsGuard acá). Sin bypass de superadmin.
    if (tool.permission !== null && !hasPermission(resolved.auth, tool.permission)) {
      throw new McpToolError(
        'PermissionDenied',
        'El rol del usuario en esa organización no tiene permiso para esta herramienta.',
        { permisoRequerido: tool.permission },
        'denied',
      );
    }
    return resolved;
  }

  /** Organización del parámetro (validada como `TenantGuard`) o la única con el conector habilitado. */
  private async resolveOrganization(args: Record<string, unknown>, base: AuthContext): Promise<ResolvedOrganization> {
    const memberships = await this.memberships.listMemberships(base.userId);
    const requested = typeof args['organizacionId'] === 'string' ? args['organizacionId'] : undefined;

    let organizationId: string;
    if (requested !== undefined) {
      organizationId = requested;
    } else {
      const candidates = [];
      for (const m of memberships) {
        if (await this.moduleEnablement.isEnabled(m.organizationId, 'mcp')) candidates.push(m);
      }
      if (candidates.length === 0) {
        throw new McpToolError(
          'NoOrganizationAvailable',
          'El usuario no tiene organizaciones con el conector habilitado.',
          undefined,
          'denied',
        );
      }
      if (candidates.length > 1) {
        throw new McpToolError(
          'OrganizationRequired',
          'El usuario tiene más de una organización: preguntale cuál usar y pasá organizacionId.',
          { organizaciones: candidates.map((m) => ({ id: m.organizationId, nombre: m.organizationName })) },
        );
      }
      organizationId = (candidates[0] as (typeof candidates)[number]).organizationId;
    }

    // Misma validación que TenantGuard (org activa y membresía), sin bypass de superadmin (ADR-0010 D4).
    const auth = await this.memberships.resolve(base, organizationId, { allowSuperadminBypass: false });
    const membership = memberships.find((m) => m.organizationId === organizationId);
    if (!membership) throw new McpToolError('TenantMembershipDenied', 'El usuario no es miembro de esa organización.', undefined, 'denied');
    return {
      auth,
      organization: { id: membership.organizationId, name: membership.organizationName, sector: membership.organizationSector },
    };
  }

  // ── resultados ──────────────────────────────────────────────────────────────

  private buildSuccess(output: ToolOutput): CallToolResult {
    const max = this.config.maxResponseChars;
    // Red de seguridad: toda cadena que sale hacia el modelo pasa por el saneamiento (D9).
    let data = scrubDeep(output.data);
    let text = JSON.stringify(data);

    if (text.length > max) {
      const shrunk = this.shrinkList(data, output.listKey, max);
      if (!shrunk) {
        return this.buildError(
          new McpToolError(
            'ResponseTooLarge',
            'La respuesta supera el tope de tamaño. Filtrá por unidad, eje o período y volvé a intentar.',
          ),
        );
      }
      data = shrunk;
      text = JSON.stringify(data);
    }
    return { content: [{ type: 'text', text }], structuredContent: data };
  }

  /** Recorta el arreglo `listKey` al mayor prefijo que entra bajo el tope; `null` si no hay forma de recortar. */
  private shrinkList(
    data: Record<string, unknown>,
    listKey: string | undefined,
    max: number,
  ): Record<string, unknown> | null {
    if (listKey === undefined) return null;
    const items = data[listKey];
    if (!Array.isArray(items)) return null;

    const withCount = (n: number): Record<string, unknown> => ({
      ...data,
      [listKey]: items.slice(0, n),
      truncado: true,
      hayMas: true,
      sugerencia:
        'La respuesta superaba el tope de tamaño y se recortó. Filtrá por unidad, eje o período, o paginá con limite y desplazamiento.',
    });
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (JSON.stringify(withCount(mid)).length <= max) lo = mid;
      else hi = mid - 1;
    }
    const candidate = withCount(lo);
    return JSON.stringify(candidate).length <= max ? candidate : null;
  }

  private buildError(error: McpToolError): CallToolResult {
    const body = { codigo: error.code, mensaje: error.message, ...(error.details ?? {}) };
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }] };
  }
}
