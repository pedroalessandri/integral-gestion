/**
 * Unit tests for TaskService — focused on date validation logic.
 * Prisma is mocked; cascade math is not exercised here (see okr-domain tests).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { TaskService } from './task.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const PERIOD_STARTS = new Date('2026-04-01T00:00:00.000Z');
const PERIOD_ENDS = new Date('2026-06-30T23:59:59.999Z');

const baseKr = {
  id: 'kr-1',
  objectiveId: 'obj-1',
  organizationId: 'org-1',
  title: 'KR 1',
  description: null,
  ownerUserId: null,
  weightBp: 10000,
  progressCachedBp: 0,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  objective: {
    id: 'obj-1',
    period: {
      id: 'period-1',
      code: '2026-Q2',
      status: 'open',
      startsAt: PERIOD_STARTS,
      endsAt: PERIOD_ENDS,
    },
  },
};

const baseTask = {
  id: 'task-1',
  keyResultId: 'kr-1',
  organizationId: 'org-1',
  title: 'Task 1',
  description: null,
  ownerUserId: null,
  weightBp: 10000,
  progressBp: 0,
  startsAt: PERIOD_STARTS,
  endsAt: PERIOD_ENDS,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTaskCreate = vi.fn();
const mockTaskFindMany = vi.fn().mockResolvedValue([]);
const mockTaskFindFirst = vi.fn();
const mockTaskUpdate = vi.fn();
const mockKrFindFirst = vi.fn();
const mockKeyResultFindFirst = vi.fn();
const mockKeyResultUpdate = vi.fn();
const mockObjectiveUpdate = vi.fn();

const mockTx = {
  task: {
    findMany: mockTaskFindMany,
    create: mockTaskCreate,
    update: mockTaskUpdate,
    findFirst: mockTaskFindFirst,
  },
  keyResult: {
    findMany: vi.fn().mockResolvedValue([]),
    update: mockKeyResultUpdate,
  },
  objective: {
    update: mockObjectiveUpdate,
  },
};

const mockPrismaService = {
  scoped: {
    keyResult: { findFirst: mockKrFindFirst },
    task: { findFirst: mockTaskFindFirst },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};

const mockAuditEmitter = { emit: vi.fn().mockResolvedValue(undefined) };

const authCtx: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: ['okr:write'],
  requestId: 'req-1',
};

// ─── Helpers for recompute tests ─────────────────────────────────────────────

/** Build a mock KR findFirst result (includes period via objective). */
function makeTaskWithKr(overrides: Partial<typeof baseTask> = {}) {
  return {
    ...baseTask,
    ...overrides,
    keyResult: {
      ...baseKr,
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TaskService — date validation', () => {
  let service: TaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TaskService(mockPrismaService as any, mockAuditEmitter as any);
  });

  it('creates a task when dates are within period bounds', async () => {
    mockKrFindFirst.mockResolvedValue(baseKr);
    mockTaskFindMany.mockResolvedValue([]);
    mockTaskCreate.mockResolvedValue({
      ...baseTask,
      startsAt: new Date('2026-04-01T00:00:00.000Z'),
      endsAt: new Date('2026-05-31T00:00:00.000Z'),
    });
    mockKeyResultUpdate.mockResolvedValue({ objectiveId: 'obj-1', progressCachedBp: 0 });
    mockObjectiveUpdate.mockResolvedValue({});

    vi.spyOn(tenantContextStorage, 'run').mockImplementation((_ctx, fn) => fn());

    const result = await service.create('kr-1', 'org-1', {
      title: 'T',
      weightBp: 5000,
      startsAt: '2026-04-01T00:00:00.000Z',
      endsAt: '2026-05-31T00:00:00.000Z',
    }, authCtx);

    expect(result.startsAt).toBe(baseTask.startsAt.toISOString());
  });

  it('rejects when startsAt is before period.startsAt', async () => {
    mockKrFindFirst.mockResolvedValue(baseKr);

    vi.spyOn(tenantContextStorage, 'run').mockImplementation((_ctx, fn) => fn());

    await expect(
      service.create('kr-1', 'org-1', {
        title: 'T',
        weightBp: 5000,
        startsAt: '2026-03-31T00:00:00.000Z', // before period start
        endsAt: '2026-05-31T00:00:00.000Z',
      }, authCtx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when endsAt is after period.endsAt', async () => {
    mockKrFindFirst.mockResolvedValue(baseKr);

    vi.spyOn(tenantContextStorage, 'run').mockImplementation((_ctx, fn) => fn());

    await expect(
      service.create('kr-1', 'org-1', {
        title: 'T',
        weightBp: 5000,
        startsAt: '2026-04-01T00:00:00.000Z',
        endsAt: '2026-07-15T00:00:00.000Z', // after period end
      }, authCtx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when startsAt > endsAt', async () => {
    mockKrFindFirst.mockResolvedValue(baseKr);

    vi.spyOn(tenantContextStorage, 'run').mockImplementation((_ctx, fn) => fn());

    await expect(
      service.create('kr-1', 'org-1', {
        title: 'T',
        weightBp: 5000,
        startsAt: '2026-05-31T00:00:00.000Z',
        endsAt: '2026-04-01T00:00:00.000Z', // end before start
      }, authCtx),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when key result not found', async () => {
    mockKrFindFirst.mockResolvedValue(null);

    await expect(
      service.create('kr-missing', 'org-1', {
        title: 'T',
        weightBp: 5000,
        startsAt: '2026-04-01T00:00:00.000Z',
        endsAt: '2026-05-31T00:00:00.000Z',
      }, authCtx),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts dates exactly on the period boundary', async () => {
    mockKrFindFirst.mockResolvedValue(baseKr);
    mockTaskFindMany.mockResolvedValue([]);
    mockTaskCreate.mockResolvedValue({
      ...baseTask,
      startsAt: PERIOD_STARTS,
      endsAt: PERIOD_ENDS,
    });
    mockKeyResultUpdate.mockResolvedValue({ objectiveId: 'obj-1', progressCachedBp: 0 });
    mockObjectiveUpdate.mockResolvedValue({});

    vi.spyOn(tenantContextStorage, 'run').mockImplementation((_ctx, fn) => fn());

    // Should not throw
    await expect(
      service.create('kr-1', 'org-1', {
        title: 'T',
        weightBp: 5000,
        startsAt: PERIOD_STARTS.toISOString(),
        endsAt: PERIOD_ENDS.toISOString(),
      }, authCtx),
    ).resolves.toBeDefined();
  });
});

// ─── Cache recompute tests ────────────────────────────────────────────────────

describe('TaskService — KR+Objective cache recomputation', () => {
  let service: TaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new TaskService(mockPrismaService as any, mockAuditEmitter as any);
    vi.spyOn(tenantContextStorage, 'run').mockImplementation((_ctx, fn) => fn());
  });

  it('setProgress: recomputes KR cache to correct weighted average when tasks sum to 10000bp', async () => {
    const taskWithKr = makeTaskWithKr({ progressBp: 0 });
    mockTaskFindFirst.mockResolvedValue(taskWithKr);

    // After update: two tasks each 50% weight, one at 100%, one at 60%
    mockTaskFindMany.mockResolvedValue([
      { weightBp: 5000, progressBp: 10000 },
      { weightBp: 5000, progressBp: 6000 },
    ]);
    // Expected KR progress: (5000*10000 + 5000*6000) / 10000 = 8000
    mockKeyResultUpdate.mockResolvedValue({ objectiveId: 'obj-1', progressCachedBp: 8000 });
    // Single KR with weight 10000
    mockTx.keyResult.findMany.mockResolvedValue([{ weightBp: 10000, progressCachedBp: 8000 }]);
    mockObjectiveUpdate.mockResolvedValue({});
    mockTaskUpdate.mockResolvedValue({ ...baseTask, progressBp: 10000 });

    await service.setProgress('task-1', 'org-1', 10000, authCtx);

    // KR update called with computed value 8000
    expect(mockKeyResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'kr-1' },
        data: { progressCachedBp: 8000 },
      }),
    );
    // Objective update called (cascaded)
    expect(mockObjectiveUpdate).toHaveBeenCalled();
  });

  it('setProgress: KR cache set to 0 when task weights do not sum to 10000bp', async () => {
    const taskWithKr = makeTaskWithKr({ progressBp: 0 });
    mockTaskFindFirst.mockResolvedValue(taskWithKr);

    // Imbalanced tasks: 3000 + 3000 = 6000, not 10000
    mockTaskFindMany.mockResolvedValue([
      { weightBp: 3000, progressBp: 10000 },
      { weightBp: 3000, progressBp: 10000 },
    ]);
    mockKeyResultUpdate.mockResolvedValue({ objectiveId: 'obj-1', progressCachedBp: 0 });
    mockTx.keyResult.findMany.mockResolvedValue([{ weightBp: 10000, progressCachedBp: 0 }]);
    mockObjectiveUpdate.mockResolvedValue({});
    mockTaskUpdate.mockResolvedValue({ ...baseTask, progressBp: 10000 });

    await service.setProgress('task-1', 'org-1', 10000, authCtx);

    // KR update must be called with 0 (imbalanced)
    expect(mockKeyResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { progressCachedBp: 0 },
      }),
    );
  });

  it('softDelete: recomputes KR+Objective after task deletion', async () => {
    const taskWithKr = makeTaskWithKr();
    mockTaskFindFirst.mockResolvedValue(taskWithKr);

    // After deletion, only one remaining task with full weight
    mockTaskFindMany.mockResolvedValue([
      { weightBp: 10000, progressBp: 5000 },
    ]);
    mockKeyResultUpdate.mockResolvedValue({ objectiveId: 'obj-1', progressCachedBp: 5000 });
    mockTx.keyResult.findMany.mockResolvedValue([{ weightBp: 10000, progressCachedBp: 5000 }]);
    mockObjectiveUpdate.mockResolvedValue({});
    mockTaskUpdate.mockResolvedValue({ ...baseTask, deletedAt: new Date() });

    await service.softDelete('task-1', 'org-1', authCtx);

    expect(mockKeyResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { progressCachedBp: 5000 },
      }),
    );
    expect(mockObjectiveUpdate).toHaveBeenCalled();
  });
});
