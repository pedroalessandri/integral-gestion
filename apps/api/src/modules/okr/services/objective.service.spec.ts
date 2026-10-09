/**
 * Unit tests for ObjectiveService.
 * Prisma is mocked; cascade math is not exercised here (see okr-domain tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { ObjectiveService } from './objective.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1';
const PERIOD_ID = 'period-1';
const USER_ID = 'user-requesting';
const OWNER_ID = 'user-owner';

/** Minimal period row used in fakes; dates are arbitrary. */
const basePeriod = {
  id: PERIOD_ID,
  code: '2026-Q1',
  status: 'open',
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-03-31T23:59:59.999Z'),
};

const openPeriod = {
  id: PERIOD_ID,
  code: '2026-Q1',
  status: 'open' as const,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  endsAt: new Date('2026-03-31T23:59:59.999Z'),
};

const closedPeriod = {
  id: 'period-closed',
  code: '2025-Q4',
  status: 'closed' as const,
  startsAt: new Date('2025-10-01T00:00:00.000Z'),
  endsAt: new Date('2025-12-31T23:59:59.999Z'),
};

/** Minimal AuthContext */
const authCtx = {
  userId: USER_ID,
  organizationId: ORG_ID,
  roles: [],
  permissions: [],
  isSuperadmin: false,
};

function makeObjective(overrides: {
  id: string;
  title?: string;
  ownerUserId?: string | null;
  owner?: { id: string; displayName: string; email: string } | null;
  period?: typeof basePeriod;
  orgUnitId?: string;
  axisId?: string | null;
}) {
  return {
    id: overrides.id,
    organizationId: ORG_ID,
    periodId: PERIOD_ID,
    title: overrides.title ?? `Objective ${overrides.id}`,
    description: null,
    ownerUserId: overrides.ownerUserId ?? null,
    orgUnitId: overrides.orgUnitId ?? 'unit-1',
    axisId: overrides.axisId ?? null,
    owner: overrides.owner ?? null,
    resultProgressCachedBp: 0,
    executionProgressCachedBp: 0,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    period: overrides.period ?? basePeriod,
    projects: [] as Array<{ startsAt: Date; endsAt: Date }>,
  };
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockObjectiveFindMany = vi.fn();
const mockObjectiveFindFirst = vi.fn();
const mockObjectiveCreate = vi.fn();
const mockObjectiveUpdate = vi.fn();
const mockObjectiveFindUnique = vi.fn();

const mockPrismaService = {
  scoped: {
    objective: {
      findMany: mockObjectiveFindMany,
      findFirst: mockObjectiveFindFirst,
    },
  },
  runInTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      objective: {
        create: mockObjectiveCreate,
        update: mockObjectiveUpdate,
        findUnique: mockObjectiveFindUnique,
      },
    };
    return fn(tx);
  }),
};

const mockGetCurrentOpenPeriod = vi.fn();
const mockPeriodService = {
  getCurrentOpenPeriod: mockGetCurrentOpenPeriod,
};

const mockAuditEmitter = { emit: vi.fn().mockResolvedValue(undefined) };

const mockIsMemberOf = vi.fn();
const mockMemberService = {
  isMemberOf: mockIsMemberOf,
};

import { allowAllScope } from '../../../common/testing/org-unit-scope.stub.js';

const mockFindLiveOrgUnit = vi.fn();
const mockOrgUnitLookup = { findLiveOrgUnit: mockFindLiveOrgUnit };

const mockIsAxisInActivePlan = vi.fn();
const mockAxisLookup = { isAxisInActivePlan: mockIsAxisInActivePlan };

function buildService(): ObjectiveService {
  return new ObjectiveService(
    mockPrismaService as never,
    mockPeriodService as never,
    mockAuditEmitter as never,
    mockMemberService as never,
    mockOrgUnitLookup,
    mockAxisLookup,
    allowAllScope(),
  );
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ObjectiveService — owner feature', () => {
  let service: ObjectiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = buildService();
    mockFindLiveOrgUnit.mockResolvedValue({ id: 'unit-1', kind: 'ministry' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 1: create with valid owner ──────────────────────────────────────

  it('create: assigns provided ownerUserId when user is a member of the org', async () => {
    mockGetCurrentOpenPeriod.mockResolvedValue(openPeriod);
    mockIsMemberOf.mockResolvedValue(true);

    const createdRow = makeObjective({
      id: 'obj-new',
      ownerUserId: OWNER_ID,
      owner: { id: OWNER_ID, displayName: 'Jane', email: 'jane@example.com' },
      period: basePeriod,
    });
    mockObjectiveCreate.mockResolvedValue(createdRow);

    const result = await service.create(ORG_ID, { title: 'Test', ownerUserId: OWNER_ID, orgUnitId: 'unit-1' }, authCtx);

    expect(mockIsMemberOf).toHaveBeenCalledWith(ORG_ID, OWNER_ID);
    expect(mockObjectiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: OWNER_ID }),
      }),
    );
    expect(result.owner).toEqual({ id: OWNER_ID, displayName: 'Jane', email: 'jane@example.com' });
  });

  // ── Test 2: create with non-member owner → UnprocessableEntityException ──

  it('create: throws UnprocessableEntityException with OwnerNotMember prefix when userId is not a member', async () => {
    mockGetCurrentOpenPeriod.mockResolvedValue(openPeriod);
    mockIsMemberOf.mockResolvedValue(false);

    await expect(
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'non-member-id', orgUnitId: 'unit-1' }, authCtx),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'non-member-id', orgUnitId: 'unit-1' }, authCtx),
    ).rejects.toThrow(/OwnerNotMember:/);
  });

  // ── Test 3: create omitting ownerUserId → defaults to requesting user ────

  it('create: defaults ownerUserId to requesting userId when omitted', async () => {
    mockGetCurrentOpenPeriod.mockResolvedValue(openPeriod);
    mockIsMemberOf.mockResolvedValue(true);

    const createdRow = makeObjective({
      id: 'obj-new',
      ownerUserId: USER_ID,
      owner: { id: USER_ID, displayName: 'Requesting', email: 'req@example.com' },
      period: basePeriod,
    });
    mockObjectiveCreate.mockResolvedValue(createdRow);

    await service.create(ORG_ID, { title: 'Test', orgUnitId: 'unit-1' }, authCtx);

    expect(mockIsMemberOf).toHaveBeenCalledWith(ORG_ID, USER_ID);
    expect(mockObjectiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerUserId: USER_ID }),
      }),
    );
  });

  // ── Test 4: update null → user emits objective.owner_assigned ────────────

  it('update: emits objective.owner_assigned when owner changes from null to a userId', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      ownerUserId: null,
      owner: null,
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockIsMemberOf.mockResolvedValue(true);

    const updatedRow = { ...existing, ownerUserId: OWNER_ID, owner: { id: OWNER_ID, displayName: 'Jane', email: 'jane@example.com' } };
    mockObjectiveUpdate.mockResolvedValue(updatedRow);

    await service.update('obj-1', ORG_ID, { ownerUserId: OWNER_ID }, authCtx);

    const emitCalls = mockAuditEmitter.emit.mock.calls;
    const ownerEvent = emitCalls.find((c) => (c[0] as { action: string }).action === 'objective.owner_assigned');
    expect(ownerEvent).toBeDefined();
    expect(ownerEvent![0]).toMatchObject({
      action: 'objective.owner_assigned',
      diff: { before: { ownerUserId: null }, after: { ownerUserId: OWNER_ID } },
    });
  });

  // ── Test 5: update user A → user B emits objective.owner_changed ─────────

  it('update: emits objective.owner_changed when owner changes from one user to another', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      ownerUserId: 'user-a',
      owner: { id: 'user-a', displayName: 'Alice', email: 'alice@example.com' },
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockIsMemberOf.mockResolvedValue(true);

    const updatedRow = { ...existing, ownerUserId: 'user-b', owner: { id: 'user-b', displayName: 'Bob', email: 'bob@example.com' } };
    mockObjectiveUpdate.mockResolvedValue(updatedRow);

    await service.update('obj-1', ORG_ID, { ownerUserId: 'user-b' }, authCtx);

    const emitCalls = mockAuditEmitter.emit.mock.calls;
    const ownerEvent = emitCalls.find((c) => (c[0] as { action: string }).action === 'objective.owner_changed');
    expect(ownerEvent).toBeDefined();
    expect(ownerEvent![0]).toMatchObject({
      action: 'objective.owner_changed',
      diff: { before: { ownerUserId: 'user-a' }, after: { ownerUserId: 'user-b' } },
    });
  });

  // ── Test 6: update user → null emits objective.owner_unassigned ──────────

  it('update: emits objective.owner_unassigned when owner changes from a userId to null', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      ownerUserId: OWNER_ID,
      owner: { id: OWNER_ID, displayName: 'Jane', email: 'jane@example.com' },
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);

    const updatedRow = { ...existing, ownerUserId: null, owner: null };
    mockObjectiveUpdate.mockResolvedValue(updatedRow);

    await service.update('obj-1', ORG_ID, { ownerUserId: null }, authCtx);

    const emitCalls = mockAuditEmitter.emit.mock.calls;
    const ownerEvent = emitCalls.find((c) => (c[0] as { action: string }).action === 'objective.owner_unassigned');
    expect(ownerEvent).toBeDefined();
    expect(ownerEvent![0]).toMatchObject({
      action: 'objective.owner_unassigned',
      diff: { before: { ownerUserId: OWNER_ID }, after: { ownerUserId: null } },
    });
  });

  // ── Test 7: update same owner → no owner event emitted (no-op) ───────────

  it('update: does NOT emit an owner event when ownerUserId does not change', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      ownerUserId: OWNER_ID,
      owner: { id: OWNER_ID, displayName: 'Jane', email: 'jane@example.com' },
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockIsMemberOf.mockResolvedValue(true);

    mockObjectiveUpdate.mockResolvedValue(existing);

    await service.update('obj-1', ORG_ID, { ownerUserId: OWNER_ID }, authCtx);

    const emitCalls = mockAuditEmitter.emit.mock.calls;
    const ownerEvents = emitCalls.filter((c) => {
      const action = (c[0] as { action: string }).action;
      return action === 'objective.owner_assigned' || action === 'objective.owner_changed' || action === 'objective.owner_unassigned';
    });
    expect(ownerEvents).toHaveLength(0);
  });

  // ── Test 8: update with non-member new owner → UnprocessableEntityException

  it('update: throws UnprocessableEntityException when new ownerUserId is not a member', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      ownerUserId: null,
      owner: null,
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockIsMemberOf.mockResolvedValue(false);

    await expect(
      service.update('obj-1', ORG_ID, { ownerUserId: 'non-member-id' }, authCtx),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.update('obj-1', ORG_ID, { ownerUserId: 'non-member-id' }, authCtx),
    ).rejects.toThrow(/OwnerNotMember:/);
  });

  // ── Test 9: update in closed period → ForbiddenException ─────────────────

  it('update: throws when attempting to update owner on a closed-period objective', async () => {
    const existing = makeObjective({
      id: 'obj-closed',
      ownerUserId: null,
      owner: null,
      period: closedPeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);

    // assertPeriodOpen should throw before membership check
    await expect(
      service.update('obj-closed', ORG_ID, { ownerUserId: OWNER_ID }, authCtx),
    ).rejects.toThrow();

    // Membership check should NOT have been called
    expect(mockIsMemberOf).not.toHaveBeenCalled();
  });

  // ── Test 10 (bonus): owner event is emitted BEFORE objective.updated ─────

  it('update: owner-specific event is emitted before objective.updated when both title and owner change', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      ownerUserId: null,
      owner: null,
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockIsMemberOf.mockResolvedValue(true);

    const updatedRow = {
      ...existing,
      title: 'New Title',
      ownerUserId: OWNER_ID,
      owner: { id: OWNER_ID, displayName: 'Jane', email: 'jane@example.com' },
    };
    mockObjectiveUpdate.mockResolvedValue(updatedRow);

    await service.update('obj-1', ORG_ID, { title: 'New Title', ownerUserId: OWNER_ID }, authCtx);

    const emitCalls = mockAuditEmitter.emit.mock.calls;
    const actions = emitCalls.map((c) => (c[0] as { action: string }).action);

    const ownerIdx = actions.indexOf('objective.owner_assigned');
    const updatedIdx = actions.indexOf('objective.updated');

    expect(ownerIdx).toBeGreaterThanOrEqual(0);
    expect(updatedIdx).toBeGreaterThanOrEqual(0);
    expect(ownerIdx).toBeLessThan(updatedIdx);
  });

  // ── Test 11 (bonus): superadmin without membership cannot be owner ────────

  it('create: superadmin user without a membership row cannot be set as owner', async () => {
    mockGetCurrentOpenPeriod.mockResolvedValue(openPeriod);
    mockIsMemberOf.mockResolvedValue(false); // superadmin but NOT a member

    const superadminCtx = { ...authCtx, isSuperadmin: true };

    await expect(
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'superadmin-id', orgUnitId: 'unit-1' }, superadminCtx),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'superadmin-id', orgUnitId: 'unit-1' }, superadminCtx),
    ).rejects.toThrow(/OwnerNotMember:/);
  });
});

// ─── Unidad y eje (C05, RN-P2 / RN-P3) ────────────────────────────────────────

describe('ObjectiveService — unidad y eje', () => {
  let service: ObjectiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = buildService();
    mockGetCurrentOpenPeriod.mockResolvedValue(openPeriod);
    mockIsMemberOf.mockResolvedValue(true);
    mockFindLiveOrgUnit.mockResolvedValue({ id: 'unit-1', kind: 'ministry' });
    mockIsAxisInActivePlan.mockResolvedValue(true);
    mockObjectiveCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      makeObjective({
        id: 'obj-new',
        ownerUserId: USER_ID,
        orgUnitId: data['orgUnitId'] as string,
        axisId: data['axisId'] as string | null,
        period: basePeriod,
      }),
    );
  });

  it('list: el resumen incluye la descripción actual del objetivo', async () => {
    mockObjectiveFindMany.mockResolvedValue([
      { ...makeObjective({ id: 'obj-1' }), description: 'Descripción vigente' },
      makeObjective({ id: 'obj-2' }),
    ]);
    const result = await service.list(ORG_ID);
    expect(result.map((o) => o.description)).toEqual(['Descripción vigente', null]);
  });

  it('create: persiste unidad y eje validados y los audita', async () => {
    const result = await service.create(ORG_ID, { title: 'T', orgUnitId: 'unit-1', axisId: 'axis-1' }, authCtx);

    expect(mockFindLiveOrgUnit).toHaveBeenCalledWith(ORG_ID, 'unit-1');
    expect(mockIsAxisInActivePlan).toHaveBeenCalledWith(ORG_ID, 'axis-1');
    expect(mockObjectiveCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgUnitId: 'unit-1', axisId: 'axis-1' }) }),
    );
    expect(result.orgUnitId).toBe('unit-1');
    expect(result.axisId).toBe('axis-1');
    expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'objective.created',
        diff: expect.objectContaining({
          after: expect.objectContaining({ orgUnitId: 'unit-1', axisId: 'axis-1' }),
        }),
      }),
    );
  });

  it('create: unidad inexistente o de otra org (el puerto devuelve null) -> 422 OrgUnitNotFound', async () => {
    mockFindLiveOrgUnit.mockResolvedValue(null);

    await expect(service.create(ORG_ID, { title: 'T', orgUnitId: 'otra-org' }, authCtx)).rejects.toThrow(
      /OrgUnitNotFound:/,
    );
    expect(mockObjectiveCreate).not.toHaveBeenCalled();
  });

  it('create: unidad central -> 422 OrgUnitKindInvalid (RN-P3)', async () => {
    mockFindLiveOrgUnit.mockResolvedValue({ id: 'root', kind: 'central' });

    const promise = service.create(ORG_ID, { title: 'T', orgUnitId: 'root' }, authCtx);
    await expect(promise).rejects.toThrow(UnprocessableEntityException);
    await expect(promise).rejects.toThrow(/OrgUnitKindInvalid:/);
    expect(mockObjectiveCreate).not.toHaveBeenCalled();
  });

  it.each(['ministry', 'area'] as const)('create: acepta unidad de kind %s', async (kind) => {
    mockFindLiveOrgUnit.mockResolvedValue({ id: 'unit-1', kind });

    await expect(service.create(ORG_ID, { title: 'T', orgUnitId: 'unit-1' }, authCtx)).resolves.toBeDefined();
  });

  it('create: eje fuera del plan activo -> 422 AxisNotInActivePlan', async () => {
    mockIsAxisInActivePlan.mockResolvedValue(false);

    await expect(service.create(ORG_ID, { title: 'T', orgUnitId: 'unit-1', axisId: 'axis-viejo' }, authCtx)).rejects.toThrow(
      /AxisNotInActivePlan:/,
    );
    expect(mockObjectiveCreate).not.toHaveBeenCalled();
  });

  it('update: cambia unidad y eje, valida y audita before/after', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      orgUnitId: 'unit-0',
      axisId: null,
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockObjectiveUpdate.mockResolvedValue({ ...existing, orgUnitId: 'unit-1', axisId: 'axis-1' });

    await service.update('obj-1', ORG_ID, { orgUnitId: 'unit-1', axisId: 'axis-1' }, authCtx);

    expect(mockFindLiveOrgUnit).toHaveBeenCalledWith(ORG_ID, 'unit-1');
    expect(mockIsAxisInActivePlan).toHaveBeenCalledWith(ORG_ID, 'axis-1');
    expect(mockObjectiveUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { orgUnitId: 'unit-1', axisId: 'axis-1' } }),
    );
    expect(mockAuditEmitter.emit).toHaveBeenCalledWith({
      action: 'objective.updated',
      entityType: 'okr.objective',
      entityId: 'obj-1',
      diff: {
        before: { orgUnitId: 'unit-0', axisId: null },
        after: { orgUnitId: 'unit-1', axisId: 'axis-1' },
      },
    });
  });

  it('update: axisId null quita el eje sin consultar el puerto', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      axisId: 'axis-1',
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockObjectiveUpdate.mockResolvedValue({ ...existing, axisId: null });

    await service.update('obj-1', ORG_ID, { axisId: null }, authCtx);

    expect(mockIsAxisInActivePlan).not.toHaveBeenCalled();
    expect(mockObjectiveUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { axisId: null } }));
    expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'objective.updated',
        diff: { before: { axisId: 'axis-1' }, after: { axisId: null } },
      }),
    );
  });

  it('update: reenviar el mismo eje no revalida ni audita (un eje de un plan reemplazado no bloquea otras ediciones)', async () => {
    const existing = makeObjective({
      id: 'obj-1',
      orgUnitId: 'unit-1',
      axisId: 'axis-1',
      period: basePeriod,
    });
    mockObjectiveFindFirst.mockResolvedValue(existing);
    mockObjectiveUpdate.mockResolvedValue(existing);
    mockIsAxisInActivePlan.mockResolvedValue(false);

    await service.update('obj-1', ORG_ID, { orgUnitId: 'unit-1', axisId: 'axis-1' }, authCtx);

    expect(mockIsAxisInActivePlan).not.toHaveBeenCalled();
    expect(mockFindLiveOrgUnit).not.toHaveBeenCalled();
    expect(mockAuditEmitter.emit).not.toHaveBeenCalled();
  });

  it('update: unidad central -> 422 y no escribe', async () => {
    mockObjectiveFindFirst.mockResolvedValue(
      makeObjective({ id: 'obj-1', period: basePeriod }),
    );
    mockFindLiveOrgUnit.mockResolvedValue({ id: 'root', kind: 'central' });

    await expect(service.update('obj-1', ORG_ID, { orgUnitId: 'root' }, authCtx)).rejects.toThrow(
      /OrgUnitKindInvalid:/,
    );
    expect(mockObjectiveUpdate).not.toHaveBeenCalled();
  });

  it('update: eje fuera del plan activo -> 422 y no escribe', async () => {
    mockObjectiveFindFirst.mockResolvedValue(
      makeObjective({ id: 'obj-1', period: basePeriod }),
    );
    mockIsAxisInActivePlan.mockResolvedValue(false);

    await expect(service.update('obj-1', ORG_ID, { axisId: 'axis-x' }, authCtx)).rejects.toThrow(
      /AxisNotInActivePlan:/,
    );
    expect(mockObjectiveUpdate).not.toHaveBeenCalled();
  });
});
