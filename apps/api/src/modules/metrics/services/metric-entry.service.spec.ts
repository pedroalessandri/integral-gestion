import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { MetricEntryService } from './metric-entry.service.js';

const mockScoped = {
  metric: { findFirst: vi.fn() },
  metricEntry: { findFirst: vi.fn(), findMany: vi.fn() },
};
const mockRaw = {
  user: { findMany: vi.fn() },
};
const mockTx = {
  metricEntry: { create: vi.fn(), update: vi.fn() },
};
const mockPrismaService = {
  scoped: mockScoped,
  raw: mockRaw,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAuditEmitter = { emit: vi.fn().mockResolvedValue(undefined) };

const authContext: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test User',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: ['metrics:entry:write'],
  requestId: 'req-test',
};

const openPeriod = {
  id: 'period-1',
  code: 'Q2-2026',
  status: 'open',
  startsAt: new Date('2026-04-01T00:00:00Z'),
  endsAt: new Date('2026-06-30T00:00:00Z'),
};

const metricWithPeriod = {
  id: 'metric-1',
  organizationId: 'org-1',
  frequency: 'monthly',
  baselineValue: { toString: () => '0' },
  period: openPeriod,
};

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    metricId: 'metric-1',
    organizationId: 'org-1',
    bucketDate: new Date('2026-04-01T00:00:00Z'),
    incrementValue: { toString: () => '100' },
    comment: null,
    createdByUserId: 'user-1',
    deletedAt: null,
    createdAt: new Date('2026-04-02T00:00:00Z'),
    updatedAt: new Date('2026-04-02T00:00:00Z'),
    ...overrides,
  };
}

describe('MetricEntryService', () => {
  let service: MetricEntryService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    mockRaw.user.findMany.mockResolvedValue([{ id: 'user-1', displayName: 'Test User' }]);
    service = new MetricEntryService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrismaService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockAuditEmitter as any,
    );
  });

  describe('list', () => {
    it('returns entries with running cumulative and author', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricWithPeriod);
      mockScoped.metricEntry.findMany.mockResolvedValue([
        entryRow(),
        entryRow({
          id: 'entry-2',
          bucketDate: new Date('2026-05-01T00:00:00Z'),
          incrementValue: { toString: () => '50.5' },
        }),
      ]);

      const items = await service.list('metric-1', 'org-1');
      expect(items[0]!.cumulativeAfter).toBe('100');
      expect(items[1]!.cumulativeAfter).toBe('150.5');
      expect(items[0]!.createdBy).toEqual({ id: 'user-1', displayName: 'Test User' });
    });
  });

  describe('create', () => {
    it('throws 404 when the metric does not exist', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(null);
      await expect(
        service.create('nope', 'org-1', { bucketDate: '2026-04-01', incrementValue: '10' }, authContext),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 403 when the period is closed (RN-M4)', async () => {
      mockScoped.metric.findFirst.mockResolvedValue({
        ...metricWithPeriod,
        period: { ...openPeriod, status: 'closed' },
      });
      await expect(
        service.create('metric-1', 'org-1', { bucketDate: '2026-04-01', incrementValue: '10' }, authContext),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 422 for a non-boundary bucket date (RN-M5)', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricWithPeriod);
      await expect(
        service.create('metric-1', 'org-1', { bucketDate: '2026-04-15', incrementValue: '10' }, authContext),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('accepts a retroactive valid bucket, stamps the author and audits', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricWithPeriod);
      const created = entryRow();
      mockTx.metricEntry.create.mockResolvedValue(created);
      mockScoped.metricEntry.findMany.mockResolvedValue([created]);

      const dto = await service.create(
        'metric-1',
        'org-1',
        { bucketDate: '2026-04-01', incrementValue: '100' },
        authContext,
      );

      expect(mockTx.metricEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdByUserId: 'user-1', organizationId: 'org-1' }),
        }),
      );
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'metric.entry.created', entityType: 'metrics.metric_entry' }),
      );
      expect(dto.cumulativeAfter).toBe('100');
    });
  });

  describe('update', () => {
    it('audits the diff of an edited past entry (RN-M6)', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricWithPeriod);
      mockScoped.metricEntry.findFirst.mockResolvedValue(entryRow());
      const updated = entryRow({ incrementValue: { toString: () => '80' } });
      mockTx.metricEntry.update.mockResolvedValue(updated);
      mockScoped.metricEntry.findMany.mockResolvedValue([updated]);

      await service.update('metric-1', 'entry-1', 'org-1', { incrementValue: '80' }, authContext);

      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'metric.entry.updated',
          diff: {
            before: { incrementValue: '100' },
            after: { incrementValue: '80' },
          },
        }),
      );
    });

    it('throws 404 for an entry of another metric', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricWithPeriod);
      mockScoped.metricEntry.findFirst.mockResolvedValue(null);
      await expect(
        service.update('metric-1', 'foreign-entry', 'org-1', { incrementValue: '80' }, authContext),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt and emits metric.entry.deleted', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricWithPeriod);
      mockScoped.metricEntry.findFirst.mockResolvedValue(entryRow());
      mockTx.metricEntry.update.mockResolvedValue(entryRow({ deletedAt: new Date() }));

      await service.softDelete('metric-1', 'entry-1', 'org-1', authContext);

      expect(mockTx.metricEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
      );
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'metric.entry.deleted' }),
      );
    });

    it('throws 403 when the period is closed', async () => {
      mockScoped.metric.findFirst.mockResolvedValue({
        ...metricWithPeriod,
        period: { ...openPeriod, status: 'closed' },
      });
      await expect(
        service.softDelete('metric-1', 'entry-1', 'org-1', authContext),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
