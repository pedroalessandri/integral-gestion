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

function makeTask(overrides: {
  id: string;
  title?: string;
  progressBp: number;
  startsAt: Date;
  endsAt: Date;
  weightBp?: number;
}) {
  return {
    id: overrides.id,
    keyResultId: 'kr-x',
    organizationId: ORG_ID,
    title: overrides.title ?? `Task ${overrides.id}`,
    description: null,
    ownerUserId: null,
    owner: null,
    weightBp: overrides.weightBp ?? 10000,
    progressBp: overrides.progressBp,
    startsAt: overrides.startsAt,
    endsAt: overrides.endsAt,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function makeKr(overrides: {
  id: string;
  objectiveId?: string;
  title?: string;
  progressCachedBp: number;
  tasks: ReturnType<typeof makeTask>[];
}) {
  return {
    id: overrides.id,
    objectiveId: overrides.objectiveId ?? 'obj-x',
    organizationId: ORG_ID,
    title: overrides.title ?? `KR ${overrides.id}`,
    description: null,
    ownerUserId: null,
    owner: null,
    weightBp: 10000,
    progressCachedBp: overrides.progressCachedBp,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    tasks: overrides.tasks,
  };
}

function makeObjective(overrides: {
  id: string;
  title?: string;
  progressCachedBp: number;
  keyResults: ReturnType<typeof makeKr>[];
  ownerUserId?: string | null;
  owner?: { id: string; displayName: string; email: string } | null;
  period?: typeof basePeriod;
}) {
  return {
    id: overrides.id,
    organizationId: ORG_ID,
    periodId: PERIOD_ID,
    title: overrides.title ?? `Objective ${overrides.id}`,
    description: null,
    ownerUserId: overrides.ownerUserId ?? null,
    owner: overrides.owner ?? null,
    progressCachedBp: overrides.progressCachedBp,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    period: overrides.period ?? basePeriod,
    _count: { keyResults: overrides.keyResults.length },
    keyResults: overrides.keyResults,
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
      keyResult: { update: vi.fn() },
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

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ObjectiveService.listGantt', () => {
  let service: ObjectiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ObjectiveService(mockPrismaService as any, mockPeriodService as any, mockAuditEmitter as any, mockMemberService as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Case 1: empty period ─────────────────────────────────────────────────

  it('returns [] when the period has no objectives', async () => {
    mockObjectiveFindMany.mockResolvedValue([]);

    const result = await service.listGantt(ORG_ID, PERIOD_ID);

    expect(result).toEqual([]);
    expect(mockObjectiveFindMany).toHaveBeenCalledOnce();
  });

  // ── Case 2: full tree with two objectives ────────────────────────────────

  it('returns full tree with derived dates for two objectives with KRs and tasks', async () => {
    const task1 = makeTask({
      id: 'task-1',
      progressBp: 10000,
      startsAt: new Date('2026-01-06T00:00:00.000Z'),
      endsAt: new Date('2026-01-31T00:00:00.000Z'),
    });
    const task2 = makeTask({
      id: 'task-2',
      progressBp: 5000,
      startsAt: new Date('2026-02-01T00:00:00.000Z'),
      endsAt: new Date('2026-02-28T00:00:00.000Z'),
    });
    const kr1 = makeKr({ id: 'kr-1', objectiveId: 'obj-1', progressCachedBp: 7500, tasks: [task1, task2] });

    const task3 = makeTask({
      id: 'task-3',
      progressBp: 3000,
      startsAt: new Date('2026-03-01T00:00:00.000Z'),
      endsAt: new Date('2026-03-31T00:00:00.000Z'),
    });
    const kr2 = makeKr({ id: 'kr-2', objectiveId: 'obj-2', progressCachedBp: 3000, tasks: [task3] });

    const obj1 = makeObjective({ id: 'obj-1', progressCachedBp: 7500, keyResults: [kr1] });
    const obj2 = makeObjective({ id: 'obj-2', progressCachedBp: 3000, keyResults: [kr2] });

    mockObjectiveFindMany.mockResolvedValue([obj1, obj2]);

    const result = await service.listGantt(ORG_ID, PERIOD_ID);

    expect(result).toHaveLength(2);

    // Objective 1
    const r0 = result[0]!;
    expect(r0.id).toBe('obj-1');
    expect(r0.progressCachedBp).toBe(7500);
    expect(r0.status).toBe('in_progress');
    // KR dates derived from min(task1.startsAt, task2.startsAt) → task1.startsAt
    expect(r0.keyResults[0]!.startsAt).toBe('2026-01-06T00:00:00.000Z');
    // max(task1.endsAt, task2.endsAt) → task2.endsAt
    expect(r0.keyResults[0]!.endsAt).toBe('2026-02-28T00:00:00.000Z');
    // Objective dates derived from its single KR
    expect(r0.startsAt).toBe('2026-01-06T00:00:00.000Z');
    expect(r0.endsAt).toBe('2026-02-28T00:00:00.000Z');

    // Objective 2
    const r1 = result[1]!;
    expect(r1.id).toBe('obj-2');
    expect(r1.keyResults[0]!.startsAt).toBe('2026-03-01T00:00:00.000Z');
    expect(r1.keyResults[0]!.endsAt).toBe('2026-03-31T00:00:00.000Z');
    expect(r1.startsAt).toBe('2026-03-01T00:00:00.000Z');
    expect(r1.endsAt).toBe('2026-03-31T00:00:00.000Z');
  });

  // ── Case 3: KR with no tasks → null dates ────────────────────────────────

  it('sets KR startsAt/endsAt to null when it has no tasks', async () => {
    const kr = makeKr({ id: 'kr-1', objectiveId: 'obj-1', progressCachedBp: 0, tasks: [] });
    const obj = makeObjective({ id: 'obj-1', progressCachedBp: 0, keyResults: [kr] });
    mockObjectiveFindMany.mockResolvedValue([obj]);

    const [result] = await service.listGantt(ORG_ID, PERIOD_ID);

    expect(result!.keyResults[0]!.startsAt).toBeNull();
    expect(result!.keyResults[0]!.endsAt).toBeNull();
    expect(result!.keyResults[0]!.tasks).toEqual([]);
  });

  // ── Case 4: Objective with no KRs → null dates ───────────────────────────

  it('sets Objective startsAt/endsAt to null when it has no KRs', async () => {
    const obj = makeObjective({ id: 'obj-1', progressCachedBp: 0, keyResults: [] });
    mockObjectiveFindMany.mockResolvedValue([obj]);

    const [result] = await service.listGantt(ORG_ID, PERIOD_ID);

    expect(result!.startsAt).toBeNull();
    expect(result!.endsAt).toBeNull();
    expect(result!.keyResults).toEqual([]);
  });

  // ── Case 5: soft-deleted items are filtered out ──────────────────────────

  it('applies deletedAt: null filter in Prisma query and the mock returns only active rows', async () => {
    // The service delegates filtering to Prisma via where: { deletedAt: null }.
    // Here we verify: (a) the call args contain the filter, (b) the mock returns
    // only active rows and they are projected correctly.

    const activeTask = makeTask({
      id: 'task-active',
      progressBp: 5000,
      startsAt: new Date('2026-01-10T00:00:00.000Z'),
      endsAt: new Date('2026-01-20T00:00:00.000Z'),
    });
    const kr = makeKr({ id: 'kr-1', objectiveId: 'obj-1', progressCachedBp: 5000, tasks: [activeTask] });
    const obj = makeObjective({ id: 'obj-1', progressCachedBp: 5000, keyResults: [kr] });

    mockObjectiveFindMany.mockResolvedValue([obj]);

    await service.listGantt(ORG_ID, PERIOD_ID);

    // Assert the Prisma call uses the correct where clause including deletedAt
    expect(mockObjectiveFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          periodId: PERIOD_ID,
          deletedAt: null,
        }),
        include: expect.objectContaining({
          keyResults: expect.objectContaining({
            where: expect.objectContaining({ deletedAt: null }),
            include: expect.objectContaining({
              tasks: expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
            }),
          }),
        }),
      }),
    );

    // And only the active task appears in the result
    const result = await service.listGantt(ORG_ID, PERIOD_ID);
    expect(result[0]!.keyResults[0]!.tasks).toHaveLength(1);
    expect(result[0]!.keyResults[0]!.tasks[0]!.id).toBe('task-active');
  });

  // ── Case 6: Task status branches ────────────────────────────────────────

  it('computes correct task statuses for pending / in_progress / done / overdue', async () => {
    // Fix "now" so past/future dates are deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    const futureEnd = new Date('2026-03-31T00:00:00.000Z');
    const pastEnd = new Date('2026-01-31T00:00:00.000Z');

    const taskPending = makeTask({
      id: 'task-pending',
      progressBp: 0,
      startsAt: new Date('2026-02-10T00:00:00.000Z'),
      endsAt: futureEnd, // future
    });
    const taskInProgress = makeTask({
      id: 'task-in-progress',
      progressBp: 5000,
      startsAt: new Date('2026-02-10T00:00:00.000Z'),
      endsAt: futureEnd, // future
    });
    const taskDone = makeTask({
      id: 'task-done',
      progressBp: 10000,
      startsAt: new Date('2026-01-05T00:00:00.000Z'),
      endsAt: pastEnd, // past, but done
    });
    const taskOverdue = makeTask({
      id: 'task-overdue',
      progressBp: 3000, // < 10000
      startsAt: new Date('2026-01-05T00:00:00.000Z'),
      endsAt: pastEnd, // past and not done
    });

    const kr = makeKr({
      id: 'kr-1',
      objectiveId: 'obj-1',
      progressCachedBp: 4000,
      tasks: [taskPending, taskInProgress, taskDone, taskOverdue],
    });
    const obj = makeObjective({ id: 'obj-1', progressCachedBp: 4000, keyResults: [kr] });
    mockObjectiveFindMany.mockResolvedValue([obj]);

    const [result] = await service.listGantt(ORG_ID, PERIOD_ID);
    const tasks = result!.keyResults[0]!.tasks;

    const byId = (id: string) => tasks.find((t) => t.id === id)!;
    expect(byId('task-pending').status).toBe('pending');
    expect(byId('task-in-progress').status).toBe('in_progress');
    expect(byId('task-done').status).toBe('done');
    expect(byId('task-overdue').status).toBe('overdue');
  });

  // ── Case 7: Objective status from progressCachedBp ──────────────────────

  it('derives Objective status from progressCachedBp (0 → pending, 5000 → in_progress, 10000 → done)', async () => {
    const futureEnd = new Date('2026-03-31T00:00:00.000Z');
    const futureStart = new Date('2026-02-01T00:00:00.000Z');

    function makeSimpleObjective(id: string, progress: number) {
      const task = makeTask({ id: `${id}-t`, progressBp: progress, startsAt: futureStart, endsAt: futureEnd });
      const kr = makeKr({ id: `${id}-kr`, objectiveId: id, progressCachedBp: progress, tasks: [task] });
      return makeObjective({ id, progressCachedBp: progress, keyResults: [kr] });
    }

    mockObjectiveFindMany.mockResolvedValue([
      makeSimpleObjective('obj-pending', 0),
      makeSimpleObjective('obj-in-progress', 5000),
      makeSimpleObjective('obj-done', 10000),
    ]);

    const result = await service.listGantt(ORG_ID, PERIOD_ID);

    expect(result.find((o) => o.id === 'obj-pending')!.status).toBe('pending');
    expect(result.find((o) => o.id === 'obj-in-progress')!.status).toBe('in_progress');
    expect(result.find((o) => o.id === 'obj-done')!.status).toBe('done');
  });
});

// ─── Owner feature tests ──────────────────────────────────────────────────────

describe('ObjectiveService — owner feature', () => {
  let service: ObjectiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ObjectiveService(mockPrismaService as any, mockPeriodService as any, mockAuditEmitter as any, mockMemberService as any);
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
      progressCachedBp: 0,
      keyResults: [],
      ownerUserId: OWNER_ID,
      owner: { id: OWNER_ID, displayName: 'Jane', email: 'jane@example.com' },
      period: basePeriod,
    });
    mockObjectiveCreate.mockResolvedValue(createdRow);

    const result = await service.create(ORG_ID, { title: 'Test', ownerUserId: OWNER_ID }, authCtx);

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
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'non-member-id' }, authCtx),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'non-member-id' }, authCtx),
    ).rejects.toThrow(/OwnerNotMember:/);
  });

  // ── Test 3: create omitting ownerUserId → defaults to requesting user ────

  it('create: defaults ownerUserId to requesting userId when omitted', async () => {
    mockGetCurrentOpenPeriod.mockResolvedValue(openPeriod);
    mockIsMemberOf.mockResolvedValue(true);

    const createdRow = makeObjective({
      id: 'obj-new',
      progressCachedBp: 0,
      keyResults: [],
      ownerUserId: USER_ID,
      owner: { id: USER_ID, displayName: 'Requesting', email: 'req@example.com' },
      period: basePeriod,
    });
    mockObjectiveCreate.mockResolvedValue(createdRow);

    await service.create(ORG_ID, { title: 'Test' }, authCtx);

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
      progressCachedBp: 0,
      keyResults: [],
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
      progressCachedBp: 0,
      keyResults: [],
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
      progressCachedBp: 0,
      keyResults: [],
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
      progressCachedBp: 0,
      keyResults: [],
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
      progressCachedBp: 0,
      keyResults: [],
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
      progressCachedBp: 0,
      keyResults: [],
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
      progressCachedBp: 0,
      keyResults: [],
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
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'superadmin-id' }, superadminCtx),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.create(ORG_ID, { title: 'Test', ownerUserId: 'superadmin-id' }, superadminCtx),
    ).rejects.toThrow(/OwnerNotMember:/);
  });
});
