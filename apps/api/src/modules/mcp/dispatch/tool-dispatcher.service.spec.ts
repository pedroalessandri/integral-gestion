import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ToolDispatcher } from './tool-dispatcher.service.js';
import { McpRateLimiter } from './mcp-rate-limiter.service.js';
import type { McpConfig } from '../config/mcp-config.service.js';
import type { ToolCallRepository, ToolCallRecord } from '../repositories/tool-call.repository.js';
import { defineTool, type McpToolDefinition } from '../tools/tool-types.js';
import type { McpSession } from './mcp-session.js';

const baseAuth: AuthContext = {
  userId: 'u1',
  auth0Sub: 'auth0|u1',
  email: 'u1@example.org',
  displayName: 'U1',
  isSuperadmin: false,
  organizationId: null,
  permissions: [],
  requestId: 'unknown',
};
const session = (scopes: string[] = ['plan:read']): McpSession => ({
  authContext: baseAuth,
  clientId: 'client-1',
  scopes: new Set(scopes),
});

const membership = (orgId: string) => ({
  organizationId: orgId,
  organizationName: `Org ${orgId}`,
  organizationSlug: orgId,
  organizationSector: 'private',
  roleKey: 'org-reader',
  roleName: 'Org Reader',
  orgUnitId: null,
  orgUnitName: null,
});

function setup(options: { maxChars?: number; memberships?: string[]; enabled?: (org: string, key: string) => boolean } = {}) {
  const config = { maxResponseChars: options.maxChars ?? 60_000, rateReadPerMin: 100, rateWritePerMin: 10, rateWritePerDay: 300 } as McpConfig;
  const records: ToolCallRecord[] = [];
  const toolCalls = { record: vi.fn(async (r: ToolCallRecord) => void records.push(r)) } as unknown as ToolCallRepository;
  const enabled = options.enabled ?? (() => true);
  const moduleEnablement = { isEnabled: vi.fn(async (org: string, key: string) => enabled(org, key)) };
  const memberships = {
    listMemberships: vi.fn(async () => (options.memberships ?? ['org-1']).map(membership)),
    resolve: vi.fn(async (ctx: AuthContext, orgId: string) => {
      if (!(options.memberships ?? ['org-1']).includes(orgId)) throw new ForbiddenException('TenantMembershipDenied');
      return { ...ctx, organizationId: orgId, permissions: ['okr:read'], orgUnitId: null };
    }),
  };
  const dispatcher = new ToolDispatcher(
    config,
    new McpRateLimiter(config),
    toolCalls,
    moduleEnablement as never,
    memberships as never,
  );
  return { dispatcher, records, moduleEnablement, memberships };
}

const listTool = (items: unknown[], extra: Partial<Parameters<typeof defineTool>[0]> = {}): McpToolDefinition =>
  defineTool({
    name: 'listar_cosas',
    title: 'Listar cosas',
    description: 'Lista de cosas para probar el tope de tamaño de las respuestas del conector.',
    kind: 'read',
    permission: 'okr:read',
    modules: ['okr'],
    listKey: 'cosas',
    inputSchema: { organizacionId: z.string().optional() },
    outputSchema: z.object({ cosas: z.array(z.unknown()), total: z.number() }),
    handler: async () => ({ cosas: items, total: items.length }),
    ...extra,
  });

describe('ToolDispatcher', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('camino feliz: structuredContent + el mismo JSON en un bloque de texto, y una fila en el log', async () => {
    const res = await ctx.dispatcher.execute(listTool([{ a: 1 }]), {}, session());
    expect(res.isError).toBeUndefined();
    expect(res.structuredContent).toEqual({ cosas: [{ a: 1 }], total: 1 });
    expect(JSON.parse((res.content[0] as { text: string }).text)).toEqual(res.structuredContent);
    expect(ctx.records).toHaveLength(1);
    expect(ctx.records[0]).toMatchObject({ toolName: 'listar_cosas', kind: 'read', outcome: 'ok', organizationId: 'org-1', clientId: 'client-1' });
    expect(ctx.records[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('saneamiento final: ninguna cadena de salida lleva sintaxis de imagen ni controles', async () => {
    const res = await ctx.dispatcher.execute(listTool([{ t: '![x](http://e) \u0000ok' }]), {}, session());
    expect(JSON.stringify(res.structuredContent)).not.toContain('![');
    expect(JSON.stringify(res.structuredContent)).not.toContain('\\u0000');
  });

  it('scope faltante: ScopeMissing (denied) y no ejecuta el handler', async () => {
    const handler = vi.fn(async () => ({ cosas: [], total: 0 }));
    const res = await ctx.dispatcher.execute(listTool([], { handler }), {}, session(['plan:write']));
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content[0] as { text: string }).text).codigo).toBe('ScopeMissing');
    expect(handler).not.toHaveBeenCalled();
    expect(ctx.records[0]).toMatchObject({ outcome: 'denied', errorCode: 'ScopeMissing' });
  });

  it('módulo mcp deshabilitado: ModuleDisabled y no ejecuta el handler', async () => {
    const c = setup({ enabled: (_o, key) => key !== 'mcp' });
    const handler = vi.fn(async () => ({ cosas: [], total: 0 }));
    const res = await c.dispatcher.execute(listTool([], { handler }), { organizacionId: 'org-1' }, session());
    expect(JSON.parse((res.content[0] as { text: string }).text)).toMatchObject({ codigo: 'ModuleDisabled', modulo: 'mcp' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('sin organizacionId y sin ninguna org con mcp habilitado: NoOrganizationAvailable', async () => {
    const c = setup({ enabled: (_o, key) => key !== 'mcp' });
    const res = await c.dispatcher.execute(listTool([]), {}, session());
    expect(JSON.parse((res.content[0] as { text: string }).text).codigo).toBe('NoOrganizationAvailable');
  });

  it('módulo extra del endpoint REST deshabilitado: ModuleDisabled con ese módulo', async () => {
    const c = setup({ enabled: (_o, key) => key !== 'okr' });
    const res = await c.dispatcher.execute(listTool([]), {}, session());
    expect(JSON.parse((res.content[0] as { text: string }).text)).toMatchObject({ codigo: 'ModuleDisabled', modulo: 'okr' });
  });

  it('permiso RBAC faltante: PermissionDenied', async () => {
    const res = await ctx.dispatcher.execute(listTool([], { permission: 'okr:write' }), {}, session());
    expect(JSON.parse((res.content[0] as { text: string }).text)).toMatchObject({ codigo: 'PermissionDenied', permisoRequerido: 'okr:write' });
  });

  it('con más de una organización exige elegir y lista las opciones', async () => {
    const c = setup({ memberships: ['org-1', 'org-2'] });
    const res = await c.dispatcher.execute(listTool([]), {}, session());
    const body = JSON.parse((res.content[0] as { text: string }).text);
    expect(body.codigo).toBe('OrganizationRequired');
    expect(body.organizaciones).toHaveLength(2);
  });

  it('organizacionId de una org sin membresía: TenantMembershipDenied', async () => {
    const res = await ctx.dispatcher.execute(listTool([]), { organizacionId: 'otra' }, session());
    expect(JSON.parse((res.content[0] as { text: string }).text).codigo).toBe('TenantMembershipDenied');
    expect(ctx.records[0]?.outcome).toBe('denied');
  });

  it('el contexto que ve el handler no es superadmin y trae la org resuelta', async () => {
    let seen: AuthContext | undefined;
    const tool = listTool([], {
      handler: async (_a, rt) => {
        seen = rt.auth;
        return { cosas: [], total: 0 };
      },
    });
    const superSession: McpSession = { ...session(), authContext: { ...baseAuth, isSuperadmin: true } };
    await ctx.dispatcher.execute(tool, {}, superSession);
    expect(seen?.organizationId).toBe('org-1');
    expect(ctx.memberships.resolve).toHaveBeenCalledWith(expect.anything(), 'org-1', { allowSuperadminBypass: false });
  });

  it('errores HTTP de los services pasan a isError con código tipado; los inesperados no filtran detalles', async () => {
    const notFound = await ctx.dispatcher.execute(
      listTool([], { handler: async () => Promise.reject(new NotFoundException('Objective x not found')) }),
      {},
      session(),
    );
    expect(JSON.parse((notFound.content[0] as { text: string }).text).codigo).toBe('NotFound');
    expect(ctx.records[0]).toMatchObject({ outcome: 'error', errorCode: 'NotFound' });

    const boom = await ctx.dispatcher.execute(
      listTool([], { handler: async () => Promise.reject(new Error('password=secreto en la conexión')) }),
      {},
      session(),
    );
    const text = (boom.content[0] as { text: string }).text;
    expect(JSON.parse(text).codigo).toBe('InternalError');
    expect(text).not.toContain('secreto');
    expect(ctx.records[1]).toMatchObject({ outcome: 'error', errorCode: 'InternalError' });
  });

  it('tope de respuesta: recorta el listado, marca truncado y sugiere filtrar', async () => {
    const c = setup({ maxChars: 1_500 });
    const items = Array.from({ length: 200 }, (_, i) => ({ id: `id-${i}`, nombre: 'x'.repeat(40) }));
    const res = await c.dispatcher.execute(listTool(items), {}, session());
    expect(res.isError).toBeUndefined();
    const data = res.structuredContent as { cosas: unknown[]; total: number; truncado: boolean; hayMas: boolean; sugerencia: string };
    expect(data.truncado).toBe(true);
    expect(data.hayMas).toBe(true);
    expect(data.total).toBe(200);
    expect(data.cosas.length).toBeGreaterThan(0);
    expect(data.cosas.length).toBeLessThan(200);
    expect(data.sugerencia).toMatch(/filtr/i);
    expect((res.content[0] as { text: string }).text.length).toBeLessThanOrEqual(1_500);
  });

  it('sin listKey y por encima del tope: ResponseTooLarge', async () => {
    const c = setup({ maxChars: 1_000 });
    const tool = listTool([], {
      listKey: undefined,
      handler: async () => ({ cosas: ['x'.repeat(2_000)], total: 1 }),
    });
    const res = await c.dispatcher.execute(tool, {}, session());
    expect(res.isError).toBe(true);
    expect(JSON.parse((res.content[0] as { text: string }).text).codigo).toBe('ResponseTooLarge');
    expect(c.records[0]).toMatchObject({ outcome: 'error', errorCode: 'ResponseTooLarge' });
  });

  it('límite por usuario: RateLimited con reintentarEnSegundos y outcome rate_limited', async () => {
    const c = setup();
    // Cupo de lectura de la config del test: 100/min; se consume con un limitador más chico.
    const config = { maxResponseChars: 60_000, rateReadPerMin: 2, rateWritePerMin: 1, rateWritePerDay: 1 } as McpConfig;
    const records: ToolCallRecord[] = [];
    const d = new ToolDispatcher(
      config,
      new McpRateLimiter(config),
      { record: async (r: ToolCallRecord) => void records.push(r) } as unknown as ToolCallRepository,
      c.moduleEnablement as never,
      c.memberships as never,
    );
    expect((await d.execute(listTool([]), {}, session())).isError).toBeUndefined();
    expect((await d.execute(listTool([]), {}, session())).isError).toBeUndefined();
    const limited = await d.execute(listTool([]), {}, session());
    const body = JSON.parse((limited.content[0] as { text: string }).text);
    expect(body.codigo).toBe('RateLimited');
    expect(body.reintentarEnSegundos).toBeGreaterThan(0);
    expect(records.at(-1)).toMatchObject({ outcome: 'rate_limited' });
  });

  it('herramienta sin organización (listar_organizaciones): no resuelve org ni exige módulos', async () => {
    const tool = listTool([], { requiresOrganization: false, permission: null, modules: [] });
    const res = await ctx.dispatcher.execute(tool, {}, session());
    expect(res.isError).toBeUndefined();
    expect(ctx.memberships.listMemberships).not.toHaveBeenCalled();
    expect(ctx.records[0]?.organizationId).toBeNull();
  });
});
