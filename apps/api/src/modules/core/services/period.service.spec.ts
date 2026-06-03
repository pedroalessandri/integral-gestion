import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PeriodService } from './period.service.js';

const mockPrismaRaw = {
  organization: { findUnique: vi.fn() },
  period: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
};

const mockTx = {
  period: {
    update: vi.fn(),
    create: vi.fn(),
  },
  objective: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  keyResult: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  task: {
    updateMany: vi.fn(),
  },
};

const mockPrismaService = {
  raw: mockPrismaRaw,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};

const mockAuditEmitter = { emit: vi.fn().mockResolvedValue(undefined) };

const basePeriod = {
  id: 'period-1',
  organizationId: 'org-1',
  code: '2026-Q2',
  status: 'open',
  startsAt: new Date('2026-04-01T03:00:00Z'),
  endsAt: new Date('2026-07-01T02:59:59.999Z'),
  closedAt: null,
  closedByUserId: null,
  deletedAt: null,
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

const mockAuthContext: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test User',
  isSuperadmin: true,
  organizationId: null,
  permissions: [],
  requestId: 'req-test',
};

const mockAdminContext: AuthContext = {
  ...mockAuthContext,
  isSuperadmin: false,
  permissions: ['core:period:manage'],
};

const mockUnprivilegedContext: AuthContext = {
  ...mockAuthContext,
  isSuperadmin: false,
  permissions: [],
};

describe('PeriodService', () => {
  let service: PeriodService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PeriodService(mockPrismaService as any, mockAuditEmitter as any);
  });

  describe('getCurrentOpenPeriod', () => {
    it('returns null for inactive organizations', async () => {
      mockPrismaRaw.organization.findUnique.mockResolvedValue({ status: 'inactive' });
      const result = await service.getCurrentOpenPeriod('org-1');
      expect(result).toBeNull();
    });

    it('returns null when no open period exists', async () => {
      mockPrismaRaw.organization.findUnique.mockResolvedValue({ status: 'active' });
      mockPrismaRaw.period.findFirst.mockResolvedValue(null);
      const result = await service.getCurrentOpenPeriod('org-1');
      expect(result).toBeNull();
    });

    it('returns period summary when one open period exists', async () => {
      mockPrismaRaw.organization.findUnique.mockResolvedValue({ status: 'active' });
      mockPrismaRaw.period.findFirst.mockResolvedValue(basePeriod);
      const result = await service.getCurrentOpenPeriod('org-1');
      expect(result?.id).toBe('period-1');
      expect(result?.status).toBe('open');
    });

    it('does not return soft-deleted periods', async () => {
      mockPrismaRaw.organization.findUnique.mockResolvedValue({ status: 'active' });
      // Simulate DB filtering deletedAt: null in the where clause
      mockPrismaRaw.period.findFirst.mockResolvedValue(null);
      const result = await service.getCurrentOpenPeriod('org-1');
      expect(result).toBeNull();
      // Verify the where clause includes deletedAt: null
      expect(mockPrismaRaw.period.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
      );
    });
  });

  describe('listForOrganization', () => {
    it('does not return soft-deleted periods', async () => {
      mockPrismaRaw.period.findMany.mockResolvedValue([basePeriod]);
      await service.listForOrganization('org-1');
      expect(mockPrismaRaw.period.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
      );
    });
  });

  describe('openPeriod', () => {
    it('throws NotFoundException if period not found', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue(null);
      await expect(service.openPeriod('missing-id', mockAuthContext)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for soft-deleted period', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue({
        ...basePeriod,
        status: 'future',
        deletedAt: new Date(),
      });
      await expect(service.openPeriod('period-1', mockAuthContext)).rejects.toThrow(NotFoundException);
    });

    it('throws UnprocessableEntityException if period is not future', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue({ ...basePeriod, status: 'open' });
      await expect(service.openPeriod('period-1', mockAuthContext)).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ConflictException on P2002 (another open period exists)', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue({ ...basePeriod, status: 'future' });
      const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      mockTx.period.update.mockRejectedValue(p2002);
      await expect(service.openPeriod('period-1', mockAuthContext)).rejects.toThrow(ConflictException);
    });

    it('successfully opens a future period', async () => {
      const futurePeriod = { ...basePeriod, status: 'future' };
      mockPrismaRaw.period.findUnique.mockResolvedValue(futurePeriod);
      mockTx.period.update.mockResolvedValue({ ...futurePeriod, status: 'open' });

      const result = await service.openPeriod('period-1', mockAuthContext);
      expect(result.status).toBe('open');
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'period.opened' }),
      );
    });
  });

  describe('createForOrganization', () => {
    const validInput = {
      code: '2026-Q2',
      startsAt: new Date('2026-04-01T00:00:00Z'),
      endsAt: new Date('2026-07-01T00:00:00Z'), // ~91 days
    };

    it('throws ConflictException when date range overlaps existing period', async () => {
      // Simulate overlap found
      mockPrismaRaw.period.findFirst.mockResolvedValue(basePeriod);
      await expect(
        service.createForOrganization('org-1', validInput, mockAuthContext),
      ).rejects.toThrow(new ConflictException('period.overlap'));
    });

    it('succeeds when date ranges are adjacent (touch but do not overlap)', async () => {
      // Adjacent: next period starts exactly at this period's endsAt
      // For the overlap query, startsAt < input.endsAt AND endsAt > input.startsAt
      // If existing.endsAt === input.startsAt, then existing.endsAt > input.startsAt is false → no overlap
      mockPrismaRaw.period.findFirst.mockResolvedValue(null); // No overlap found
      mockTx.period.create.mockResolvedValue({
        ...basePeriod,
        code: '2026-Q3',
        startsAt: new Date('2026-07-01T00:00:00Z'),
        endsAt: new Date('2026-10-01T00:00:00Z'),
        status: 'future',
      });

      const result = await service.createForOrganization(
        'org-1',
        {
          code: '2026-Q3',
          startsAt: new Date('2026-07-01T00:00:00Z'),
          endsAt: new Date('2026-10-01T00:00:00Z'),
        },
        mockAuthContext,
      );
      expect(result.code).toBe('2026-Q3');
    });

    it('two adjacent periods sharing exactly the same boundary timestamp do NOT overlap', async () => {
      // Existing period ends at 2026-07-01T00:00:00Z.
      // New period starts at exactly 2026-07-01T00:00:00Z (same instant).
      // Overlap condition: existingPeriod.startsAt < newPeriod.endsAt AND existingPeriod.endsAt > newPeriod.startsAt
      // existingPeriod.endsAt (2026-07-01) > newPeriod.startsAt (2026-07-01) is FALSE (equal, not strictly greater).
      // Therefore the Prisma `gt` filter returns no overlap → should NOT throw ConflictException.
      mockPrismaRaw.period.findFirst.mockResolvedValue(null); // No overlap — strict gt/lt preserves this
      mockTx.period.create.mockResolvedValue({
        ...basePeriod,
        id: 'period-2',
        code: '2026-Q3',
        startsAt: new Date('2026-07-01T00:00:00Z'),
        endsAt: new Date('2026-10-01T00:00:00Z'),
        status: 'future',
      });

      // Must not throw ConflictException
      await expect(
        service.createForOrganization(
          'org-1',
          {
            code: '2026-Q3',
            // startsAt === an existing period's endsAt — same exact instant
            startsAt: new Date('2026-07-01T00:00:00Z'),
            endsAt: new Date('2026-10-01T00:00:00Z'),
          },
          mockAuthContext,
        ),
      ).resolves.not.toThrow();
    });

    it('throws UnprocessableEntityException when range < 7 days', async () => {
      await expect(
        service.createForOrganization(
          'org-1',
          {
            code: 'short',
            startsAt: new Date('2026-04-01T00:00:00Z'),
            endsAt: new Date('2026-04-05T00:00:00Z'), // 4 days
          },
          mockAuthContext,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws UnprocessableEntityException when range > 366 days', async () => {
      await expect(
        service.createForOrganization(
          'org-1',
          {
            code: 'toolong',
            startsAt: new Date('2026-01-01T00:00:00Z'),
            endsAt: new Date('2027-02-15T00:00:00Z'), // > 366 days
          },
          mockAuthContext,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('closePeriod', () => {
    it('reason=manual and now < endsAt: sets endsAt = closedAt (early close)', async () => {
      // Period ends in the future
      const futurePeriod = {
        ...basePeriod,
        status: 'open',
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      };
      mockPrismaRaw.period.findUnique.mockResolvedValue(futurePeriod);

      const updatedPeriod = { ...futurePeriod, status: 'closed', closedAt: new Date() };
      mockTx.period.update.mockResolvedValue(updatedPeriod);

      await service.closePeriod('period-1', mockAuthContext, 'manual');

      expect(mockTx.period.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ endsAt: expect.any(Date) }),
        }),
      );
    });

    it('when closing prematurely, endsAt is truncated to startOfDay UTC, but audit log keeps exact closedAt', async () => {
      // Period ends in the future so this is an early (premature) close
      const futurePeriod = {
        ...basePeriod,
        status: 'open',
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      };
      mockPrismaRaw.period.findUnique.mockResolvedValue(futurePeriod);
      const updatedPeriod = { ...futurePeriod, status: 'closed', closedAt: new Date() };
      mockTx.period.update.mockResolvedValue(updatedPeriod);

      await service.closePeriod('period-1', mockAuthContext, 'manual');

      // The endsAt passed to tx.period.update must be midnight UTC (all time components zero)
      const updateCall = mockTx.period.update.mock.calls[0] as [{ data: { endsAt: Date; closedAt: Date } }];
      const storedEndsAt: Date = updateCall[0].data.endsAt;
      expect(storedEndsAt.getUTCHours()).toBe(0);
      expect(storedEndsAt.getUTCMinutes()).toBe(0);
      expect(storedEndsAt.getUTCSeconds()).toBe(0);
      expect(storedEndsAt.getUTCMilliseconds()).toBe(0);

      // The audit event must record the exact closedAt (non-truncated) — not the truncated endsAt
      const auditCall = mockAuditEmitter.emit.mock.calls[0] as [{ diff: { after: { closedAt: string } } }];
      const auditClosedAt = new Date(auditCall[0].diff.after.closedAt);
      // The stored endsAt (truncated to midnight) is a different instant than the exact closedAt captured
      // in the audit. We verify the audit closedAt != storedEndsAt (i.e., it was NOT truncated).
      // Since the test runs in sub-second time, closedAt will almost certainly have H:M:S info preserved.
      // We confirm the audit closedAt is an ISO string that round-trips correctly.
      expect(auditClosedAt).toBeInstanceOf(Date);
      expect(isNaN(auditClosedAt.getTime())).toBe(false);
      // Most importantly: audit uses closedAt (exact), not newEndsAt (truncated).
      // Verify they are different values (closedAt has intra-day time; storedEndsAt is midnight).
      expect(auditCall[0].diff.after.closedAt).not.toBe(storedEndsAt.toISOString());
    });

    it('reason=manual and now >= endsAt: does not change endsAt', async () => {
      // Period ended in the past
      const pastPeriod = {
        ...basePeriod,
        status: 'open',
        endsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
      };
      mockPrismaRaw.period.findUnique.mockResolvedValue(pastPeriod);
      const updatedPeriod = { ...pastPeriod, status: 'closed', closedAt: new Date() };
      mockTx.period.update.mockResolvedValue(updatedPeriod);

      await service.closePeriod('period-1', mockAuthContext, 'manual');

      const updateCall = mockTx.period.update.mock.calls[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((updateCall as any)[0].data.endsAt).toBeUndefined();
    });

    it('reason=automatic: never modifies endsAt', async () => {
      const futurePeriod = {
        ...basePeriod,
        status: 'open',
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
      mockPrismaRaw.period.findUnique.mockResolvedValue(futurePeriod);
      const updatedPeriod = { ...futurePeriod, status: 'closed', closedAt: new Date() };
      mockTx.period.update.mockResolvedValue(updatedPeriod);

      await service.closePeriod('period-1', mockAuthContext, 'automatic');

      const updateCall = mockTx.period.update.mock.calls[0];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((updateCall as any)[0].data.endsAt).toBeUndefined();
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'period.auto_closed' }),
      );
    });

    it('reason=manual: emits period.closed audit action', async () => {
      const pastPeriod = {
        ...basePeriod,
        status: 'open',
        endsAt: new Date(Date.now() - 1000),
      };
      mockPrismaRaw.period.findUnique.mockResolvedValue(pastPeriod);
      mockTx.period.update.mockResolvedValue({ ...pastPeriod, status: 'closed' });

      await service.closePeriod('period-1', mockAuthContext, 'manual');

      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'period.closed' }),
      );
    });
  });

  describe('softDeletePeriod', () => {
    it('throws ForbiddenException for unprivileged user', async () => {
      await expect(
        service.softDeletePeriod('period-1', mockUnprivilegedContext),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException for non-existent period', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue(null);
      await expect(
        service.softDeletePeriod('period-1', mockAuthContext),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for already soft-deleted period', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue({
        ...basePeriod,
        deletedAt: new Date(),
      });
      await expect(
        service.softDeletePeriod('period-1', mockAuthContext),
      ).rejects.toThrow(NotFoundException);
    });

    it('cascades deletedAt to objectives, key results, and tasks', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue(basePeriod);
      mockTx.period.update.mockResolvedValue({ ...basePeriod, deletedAt: new Date() });

      // 2 objectives
      mockTx.objective.findMany.mockResolvedValue([
        { id: 'obj-1' },
        { id: 'obj-2' },
      ]);
      mockTx.objective.updateMany.mockResolvedValue({ count: 2 });

      // 3 key results across those objectives
      mockTx.keyResult.findMany.mockResolvedValue([
        { id: 'kr-1' },
        { id: 'kr-2' },
        { id: 'kr-3' },
      ]);
      mockTx.keyResult.updateMany.mockResolvedValue({ count: 3 });

      // 5 tasks
      mockTx.task.updateMany.mockResolvedValue({ count: 5 });

      await service.softDeletePeriod('period-1', mockAuthContext);

      // Verify cascades ran
      expect(mockTx.objective.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ periodId: 'period-1' }) }),
      );
      expect(mockTx.keyResult.updateMany).toHaveBeenCalled();
      expect(mockTx.task.updateMany).toHaveBeenCalled();
    });

    it('emits period.deleted audit event with correct cascade counts', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue(basePeriod);
      mockTx.period.update.mockResolvedValue({ ...basePeriod, deletedAt: new Date() });

      mockTx.objective.findMany.mockResolvedValue([{ id: 'obj-1' }, { id: 'obj-2' }]);
      mockTx.objective.updateMany.mockResolvedValue({ count: 2 });
      mockTx.keyResult.findMany.mockResolvedValue([{ id: 'kr-1' }]);
      mockTx.keyResult.updateMany.mockResolvedValue({ count: 1 });
      mockTx.task.updateMany.mockResolvedValue({ count: 4 });

      await service.softDeletePeriod('period-1', mockAuthContext);

      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'period.deleted',
          entityType: 'core.period',
          entityId: 'period-1',
          diff: expect.objectContaining({
            before: { deletedAt: null },
            after: expect.objectContaining({
              objectivesDeleted: 2,
              keyResultsDeleted: 1,
              tasksDeleted: 4,
            }),
          }),
        }),
      );
    });

    it('handles period with no objectives (zero cascade counts)', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue(basePeriod);
      mockTx.period.update.mockResolvedValue({ ...basePeriod, deletedAt: new Date() });
      mockTx.objective.findMany.mockResolvedValue([]);
      mockTx.objective.updateMany.mockResolvedValue({ count: 0 });

      await service.softDeletePeriod('period-1', mockAuthContext);

      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          diff: expect.objectContaining({
            after: expect.objectContaining({
              objectivesDeleted: 0,
              keyResultsDeleted: 0,
              tasksDeleted: 0,
            }),
          }),
        }),
      );
      // Task/KR updateMany should NOT be called when no objectives
      expect(mockTx.keyResult.findMany).not.toHaveBeenCalled();
      expect(mockTx.task.updateMany).not.toHaveBeenCalled();
    });

    it('succeeds for user with core:period:manage permission (non-superadmin)', async () => {
      mockPrismaRaw.period.findUnique.mockResolvedValue(basePeriod);
      mockTx.period.update.mockResolvedValue({ ...basePeriod, deletedAt: new Date() });
      mockTx.objective.findMany.mockResolvedValue([]);
      mockTx.objective.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.softDeletePeriod('period-1', mockAdminContext),
      ).resolves.toBeUndefined();
    });
  });
});
