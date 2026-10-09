import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ObjectiveService } from './objective.service.js';

/** RN-P20: el service corta con 403 antes de tocar la DB cuando el alcance no cubre la unidad del objetivo. */
const ctx: AuthContext = {
  userId: 'u1',
  auth0Sub: 'a',
  email: 'a@x.test',
  displayName: 'A',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: ['okr:write'],
  orgUnitId: 'unit-a',
  requestId: 'r',
};

const objective = {
  id: 'obj-1',
  orgUnitId: 'unit-b',
  deletedAt: null,
  period: { id: 'p', code: 'P', status: 'open', startsAt: new Date(), endsAt: new Date() },
  _count: { projects: 0 },
};
const runInTransaction = vi.fn();
const prisma = { scoped: { objective: { findFirst: vi.fn().mockResolvedValue(objective) } }, runInTransaction };
const forbid = vi.fn().mockRejectedValue(new ForbiddenException('OrgUnitScopeForbidden: unit "unit-b" is outside the member scope.'));
const scope = { assertCanWriteInUnit: forbid, assertCentralScope: vi.fn(), assertCanWriteInAllUnits: vi.fn() };
const periodService = { getCurrentOpenPeriod: vi.fn().mockResolvedValue({ id: 'p' }) };

function build() {
  return new ObjectiveService(
    prisma as never,
    periodService as never,
    { emit: vi.fn() } as never,
    { isMemberOf: vi.fn() } as never,
    { findLiveOrgUnit: vi.fn() },
    { isAxisInActivePlan: vi.fn() },
    scope,
  );
}

describe('ObjectiveService — alcance de unidad', () => {
  it('update / softDelete de un objetivo de otra unidad → 403 sin escribir', async () => {
    const service = build();
    await expect(service.update('obj-1', 'org-1', { title: 'x' }, ctx)).rejects.toThrow(/OrgUnitScopeForbidden/);
    await expect(service.softDelete('obj-1', 'org-1', ctx)).rejects.toThrow(/OrgUnitScopeForbidden/);
    expect(forbid).toHaveBeenCalledWith(ctx, 'unit-b');
    expect(runInTransaction).not.toHaveBeenCalled();
  });

  it('create en una unidad fuera del alcance → 403 antes de resolver el período', async () => {
    const service = build();
    await expect(service.create('org-1', { title: 'x', orgUnitId: 'unit-b' } as never, ctx)).rejects.toThrow(
      /OrgUnitScopeForbidden/,
    );
    expect(forbid).toHaveBeenLastCalledWith(ctx, 'unit-b');
    expect(periodService.getCurrentOpenPeriod).not.toHaveBeenCalled();
  });
});
