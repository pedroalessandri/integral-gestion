import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { OrgUnitScopeService } from './org-unit-scope.service.js';

function ctx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'u1',
    auth0Sub: 'auth0|u1',
    email: 'u1@x.test',
    displayName: 'U1',
    isSuperadmin: false,
    organizationId: 'org-1',
    permissions: ['okr:write'],
    requestId: 'req-1',
    ...overrides,
  };
}

function build(rows: string[] = ['unit-a', 'unit-a1'], membership: { orgUnitId: string | null } | null = null) {
  const queryRaw = vi.fn().mockResolvedValue(rows.map((id) => ({ id })));
  const findUnique = vi.fn().mockResolvedValue(membership);
  const service = new OrgUnitScopeService({ raw: { $queryRaw: queryRaw, userOrganizationRole: { findUnique } } } as never);
  return { service, queryRaw, findUnique };
}

describe('OrgUnitScopeService', () => {
  it('alcance null: escribe en cualquier unidad, en entidades sin unidad y en N1/N2, sin consultar descendientes', async () => {
    const { service, queryRaw } = build();
    const c = ctx({ orgUnitId: null });
    await expect(service.assertCanWriteInUnit(c, 'cualquiera')).resolves.toBeUndefined();
    await expect(service.assertCanWriteInUnit(c, null)).resolves.toBeUndefined();
    await expect(service.assertCentralScope(c)).resolves.toBeUndefined();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('superadmin: siempre alcance total', async () => {
    const { service, findUnique } = build();
    const c = ctx({ isSuperadmin: true, organizationId: 'org-1' });
    await expect(service.assertCentralScope(c)).resolves.toBeUndefined();
    await expect(service.assertCanWriteInUnit(c, 'x')).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('alcance en una unidad: la propia y sus descendientes sí; hermana, ancestro y sin unidad no (403 tipado)', async () => {
    const { service } = build();
    const c = ctx({ orgUnitId: 'unit-a' });
    await expect(service.assertCanWriteInUnit(c, 'unit-a')).resolves.toBeUndefined();
    await expect(service.assertCanWriteInUnit(c, 'unit-a1')).resolves.toBeUndefined();
    for (const target of ['unit-b', 'unit-ministry', null]) {
      const err = await service.assertCanWriteInUnit(c, target).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).message).toMatch(/OrgUnitScopeForbidden/);
    }
  });

  it('alcance en una unidad: N1/N2/árbol (alcance central) está prohibido', async () => {
    const { service } = build();
    await expect(service.assertCentralScope(ctx({ orgUnitId: 'unit-a' }))).rejects.toThrow(/OrgUnitScopeForbidden/);
  });

  it('cachea la CTE por request (mismo AuthContext) y no entre requests', async () => {
    const { service, queryRaw } = build();
    const c = ctx({ orgUnitId: 'unit-a' });
    await service.assertCanWriteInUnit(c, 'unit-a');
    await service.assertCanWriteInUnit(c, 'unit-a1');
    await service.assertCanWriteInAllUnits(c, ['unit-a', 'unit-a1']);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    await service.assertCanWriteInUnit(ctx({ orgUnitId: 'unit-a' }), 'unit-a');
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('assertCanWriteInAllUnits: todas deben pasar; lista vacía exige alcance central', async () => {
    const { service } = build();
    const c = ctx({ orgUnitId: 'unit-a' });
    await expect(service.assertCanWriteInAllUnits(c, ['unit-a', 'unit-b'])).rejects.toThrow(/OrgUnitScopeForbidden/);
    await expect(service.assertCanWriteInAllUnits(c, [])).rejects.toThrow(/OrgUnitScopeForbidden/);
    await expect(service.assertCanWriteInAllUnits(ctx({ orgUnitId: null }), [])).resolves.toBeUndefined();
  });

  it('si el contexto no trae orgUnitId lo consulta a la DB (nunca asume central)', async () => {
    const { service, findUnique } = build(['unit-a'], { orgUnitId: 'unit-a' });
    const c = ctx();
    await expect(service.assertCanWriteInUnit(c, 'unit-a')).resolves.toBeUndefined();
    await expect(service.assertCanWriteInUnit(c, 'unit-b')).rejects.toThrow(/OrgUnitScopeForbidden/);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_organizationId: { userId: 'u1', organizationId: 'org-1' } } }));
  });

  it('default deny: sin membresía o sin organización → 403', async () => {
    await expect(build([], null).service.assertCanWriteInUnit(ctx(), 'x')).rejects.toThrow(/OrgUnitScopeForbidden/);
    await expect(build().service.assertCanWriteInUnit(ctx({ organizationId: null }), 'x')).rejects.toThrow(/OrgUnitScopeForbidden/);
  });

  it('la CTE filtra por organizationId de la membresía', async () => {
    const { service, queryRaw } = build();
    await service.assertCanWriteInUnit(ctx({ orgUnitId: 'unit-a' }), 'unit-a');
    const values = (queryRaw.mock.calls[0] as unknown[]).slice(1);
    expect(values).toContain('org-1');
    expect(values).toContain('unit-a');
  });
});
