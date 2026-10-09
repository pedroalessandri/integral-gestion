import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allowAllScope } from '../../../common/testing/org-unit-scope.stub.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { MetricService } from './metric.service.js';

const mockScoped = {
  metric: { findMany: vi.fn(), findFirst: vi.fn() },
  metricEntry: { findMany: vi.fn() },
  objectiveIndicator: { findMany: vi.fn().mockResolvedValue([]) },
  projectContribution: { count: vi.fn().mockResolvedValue(0) },
};
const mockObjectiveLookup = { filterLiveObjectiveIds: vi.fn().mockResolvedValue([]), findLiveObjectives: vi.fn().mockResolvedValue([]) };
const mockTx = {
  metric: { create: vi.fn(), update: vi.fn() },
};
const mockPrismaService = {
  scoped: mockScoped,
  raw: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockPeriodService = { getCurrentOpenPeriod: vi.fn() };
const mockAuditEmitter = { emit: vi.fn().mockResolvedValue(undefined) };

const authContext: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test User',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: ['metrics:write'],
  requestId: 'req-test',
};

const openPeriod = {
  id: 'period-1',
  code: 'Q2-2026',
  status: 'open',
  startsAt: new Date('2026-04-01T00:00:00Z'),
  endsAt: new Date('2026-06-30T00:00:00Z'),
};

const metricRow = {
  id: 'metric-1',
  organizationId: 'org-1',
  periodId: 'period-1',
  name: 'Trámites digitalizados',
  unit: 'number',
  direction: 'increasing',
  frequency: 'monthly',
  baselineValue: { toString: () => '0' },
  targetValue: { toString: () => '500' },
  deletedAt: null,
  createdAt: new Date('2026-04-02T00:00:00Z'),
  updatedAt: new Date('2026-04-02T00:00:00Z'),
  period: openPeriod,
};

describe('MetricService', () => {
  let service: MetricService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockScoped.objectiveIndicator.findMany.mockResolvedValue([]);
    mockObjectiveLookup.filterLiveObjectiveIds.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    service = new MetricService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrismaService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPeriodService as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockAuditEmitter as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockObjectiveLookup as any,
      allowAllScope(),
    );
  });

  describe('list', () => {
    it('computes lastValue and progressPct from entry increments', async () => {
      mockScoped.metric.findMany.mockResolvedValue([metricRow]);
      mockScoped.metricEntry.findMany.mockResolvedValue([
        { metricId: 'metric-1', incrementValue: { toString: () => '100' } },
        { metricId: 'metric-1', incrementValue: { toString: () => '150' } },
      ]);

      const [dto] = await service.list('org-1', {});
      expect(dto!.lastValue).toBe('250');
      expect(dto!.progressPct).toBe(50); // 250 / 500
    });

    it('returns baseline as lastValue when there are no entries', async () => {
      mockScoped.metric.findMany.mockResolvedValue([metricRow]);
      mockScoped.metricEntry.findMany.mockResolvedValue([]);

      const [dto] = await service.list('org-1', {});
      expect(dto!.lastValue).toBe('0');
      expect(dto!.progressPct).toBe(0);
    });
  });

  describe('create', () => {
    it('throws 422 when the organization has no open period (RN-M3)', async () => {
      mockPeriodService.getCurrentOpenPeriod.mockResolvedValue(null);
      await expect(
        service.create('org-1', {
          name: 'X',
          unit: 'number',
          direction: 'increasing',
          frequency: 'monthly',
          targetValue: '10',
        }, authContext),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 409 on case-insensitive duplicate name (RN-M1)', async () => {
      mockPeriodService.getCurrentOpenPeriod.mockResolvedValue({ id: 'period-1' });
      mockScoped.metric.findFirst.mockResolvedValue({ id: 'other-metric' });
      await expect(
        service.create('org-1', {
          name: 'TRÁMITES DIGITALIZADOS',
          unit: 'number',
          direction: 'increasing',
          frequency: 'monthly',
          targetValue: '10',
        }, authContext),
      ).rejects.toThrow(ConflictException);
    });

    it('creates with baseline default 0 and emits metric.created', async () => {
      mockPeriodService.getCurrentOpenPeriod.mockResolvedValue({ id: 'period-1' });
      mockScoped.metric.findFirst.mockResolvedValue(null);
      mockScoped.metricEntry.findMany.mockResolvedValue([]);
      mockTx.metric.create.mockResolvedValue(metricRow);

      const dto = await service.create('org-1', {
        name: 'Trámites digitalizados',
        unit: 'number',
        direction: 'increasing',
        frequency: 'monthly',
        targetValue: '500',
      }, authContext);

      expect(mockTx.metric.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ baselineValue: '0', organizationId: 'org-1' }),
        }),
      );
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'metric.created', entityType: 'metrics.metric' }),
      );
      expect(dto.buckets).toEqual([
        '2026-04-01T00:00:00.000Z',
        '2026-05-01T00:00:00.000Z',
        '2026-06-01T00:00:00.000Z',
      ]);
    });
  });

  describe('update', () => {
    it('throws 403 when the period is closed (RN-M4)', async () => {
      mockScoped.metric.findFirst.mockResolvedValue({
        ...metricRow,
        period: { ...openPeriod, status: 'closed' },
      });
      await expect(
        service.update('metric-1', 'org-1', { name: 'Nuevo' }, authContext),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates name/target and emits metric.updated with diff', async () => {
      mockScoped.metric.findFirst
        .mockResolvedValueOnce(metricRow) // findActiveOrThrow
        .mockResolvedValueOnce(null); // assertNameAvailable
      mockScoped.metricEntry.findMany.mockResolvedValue([]);
      mockTx.metric.update.mockResolvedValue({ ...metricRow, name: 'Nuevo' });

      await service.update('metric-1', 'org-1', { name: 'Nuevo', targetValue: '600' }, authContext);

      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'metric.updated',
          diff: expect.objectContaining({
            before: expect.objectContaining({ name: 'Trámites digitalizados', targetValue: '500' }),
            after: expect.objectContaining({ name: 'Nuevo', targetValue: '600' }),
          }),
        }),
      );
    });
  });

  describe('softDelete', () => {
    it('throws 404 for a missing or already deleted metric', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('nope', 'org-1', authContext)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('sets deletedAt and emits metric.deleted', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricRow);
      mockTx.metric.update.mockResolvedValue({ ...metricRow, deletedAt: new Date() });

      await service.softDelete('metric-1', 'org-1', authContext);

      expect(mockTx.metric.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
      );
      expect(mockAuditEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'metric.deleted' }),
      );
    });

    it('409 MetricInUseByObjective cuando mide un objetivo vivo; ignora indicadores de objetivos borrados', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricRow);
      mockScoped.objectiveIndicator.findMany.mockResolvedValue([
        { id: 'oi-1', objectiveId: 'obj-live', linkMode: 'independent' },
        { id: 'oi-2', objectiveId: 'obj-dead', linkMode: 'independent' },
      ]);
      mockObjectiveLookup.filterLiveObjectiveIds.mockResolvedValue(['obj-live']);

      await expect(service.softDelete('metric-1', 'org-1', authContext)).rejects.toThrow(/MetricInUseByObjective/);
      expect(mockScoped.objectiveIndicator.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1', deletedAt: null }) }),
      );

      mockObjectiveLookup.filterLiveObjectiveIds.mockResolvedValue([]);
      mockTx.metric.update.mockResolvedValue({ ...metricRow, deletedAt: new Date() });
      await expect(service.softDelete('metric-1', 'org-1', authContext)).resolves.toBeUndefined();
    });
  });

  describe('update — RN-P12 (kind output -> outcome)', () => {
    const outputMetric = { ...metricRow, kind: 'output' };

    it('422 si algún indicador de objetivo de la métrica es execution_feeds_indicator', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(outputMetric);
      mockScoped.objectiveIndicator.findMany.mockResolvedValue([
        { id: 'oi-1', objectiveId: 'obj-1', linkMode: 'independent' },
        { id: 'oi-2', objectiveId: 'obj-1', linkMode: 'execution_feeds_indicator' },
      ]);
      mockObjectiveLookup.filterLiveObjectiveIds.mockResolvedValue(['obj-1']);

      await expect(service.update('metric-1', 'org-1', { kind: 'outcome' }, authContext)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.update('metric-1', 'org-1', { kind: 'outcome' }, authContext)).rejects.toThrow(
        /MetricKindChangeBlocked/,
      );
      expect(mockTx.metric.update).not.toHaveBeenCalled();
    });

    it('422 si algún indicador de la métrica tiene aportes de proyectos (ProjectContribution), aunque no sea execution_feeds_indicator', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(outputMetric);
      mockScoped.objectiveIndicator.findMany.mockResolvedValue([
        { id: 'oi-1', objectiveId: 'obj-1', linkMode: 'independent' },
      ]);
      mockObjectiveLookup.filterLiveObjectiveIds.mockResolvedValue(['obj-1']);
      mockScoped.projectContribution.count.mockResolvedValueOnce(2);

      await expect(service.update('metric-1', 'org-1', { kind: 'outcome' }, authContext)).rejects.toThrow(
        /MetricKindChangeBlocked.*2 aporte\(s\) de proyectos/,
      );
      expect(mockScoped.projectContribution.count).toHaveBeenCalledWith({
        where: { objectiveIndicatorId: { in: ['oi-1'] }, organizationId: 'org-1' },
      });
      expect(mockTx.metric.update).not.toHaveBeenCalled();
    });

    it('permite el cambio si los indicadores son independent o indicator_feeds_execution', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(outputMetric);
      mockScoped.objectiveIndicator.findMany.mockResolvedValue([
        { id: 'oi-1', objectiveId: 'obj-1', linkMode: 'independent' },
        { id: 'oi-2', objectiveId: 'obj-1', linkMode: 'indicator_feeds_execution' },
      ]);
      mockObjectiveLookup.filterLiveObjectiveIds.mockResolvedValue(['obj-1']);
      mockScoped.metricEntry.findMany.mockResolvedValue([]);
      mockTx.metric.update.mockResolvedValue({ ...outputMetric, kind: 'outcome' });

      await service.update('metric-1', 'org-1', { kind: 'outcome' }, authContext);
      expect(mockTx.metric.update).toHaveBeenCalled();
    });

    it('ignora execution_feeds_indicator de un objetivo borrado', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(outputMetric);
      mockScoped.objectiveIndicator.findMany.mockResolvedValue([
        { id: 'oi-2', objectiveId: 'obj-dead', linkMode: 'execution_feeds_indicator' },
      ]);
      mockObjectiveLookup.filterLiveObjectiveIds.mockResolvedValue([]);
      mockScoped.metricEntry.findMany.mockResolvedValue([]);
      mockTx.metric.update.mockResolvedValue({ ...outputMetric, kind: 'outcome' });

      await service.update('metric-1', 'org-1', { kind: 'outcome' }, authContext);
      expect(mockTx.metric.update).toHaveBeenCalled();
    });

    it('no consulta indicadores si el kind no cambia de output a outcome', async () => {
      mockScoped.metric.findFirst.mockResolvedValue({ ...metricRow, kind: 'outcome' });
      mockScoped.metricEntry.findMany.mockResolvedValue([]);
      mockTx.metric.update.mockResolvedValue({ ...metricRow, kind: 'outcome' });

      // La única consulta es la del alcance (RN-P20); la de RN-P12 (indicadores con aportes) no ocurre.
      await service.update('metric-1', 'org-1', { kind: 'outcome' }, authContext);
      expect(mockScoped.objectiveIndicator.findMany).toHaveBeenCalledTimes(1);
      expect(mockScoped.projectContribution.count).not.toHaveBeenCalled();
    });
  });

  describe('getSeries', () => {
    it('builds expected (linear) and actual (cumulative) curves', async () => {
      mockScoped.metric.findFirst.mockResolvedValue(metricRow);
      mockScoped.metricEntry.findMany.mockResolvedValue([
        {
          bucketDate: new Date('2026-04-01T00:00:00Z'),
          incrementValue: { toString: () => '100' },
        },
        {
          bucketDate: new Date('2026-05-01T00:00:00Z'),
          incrementValue: { toString: () => '150' },
        },
      ]);

      const series = await service.getSeries('metric-1', 'org-1');

      expect(series.expected[0]).toEqual({ date: '2026-04-01T00:00:00.000Z', value: '0' });
      expect(series.expected[series.expected.length - 1]!.value).toBe('500');
      expect(series.actual).toEqual([
        { bucketDate: '2026-04-01T00:00:00.000Z', cumulativeValue: '100' },
        { bucketDate: '2026-05-01T00:00:00.000Z', cumulativeValue: '250' },
      ]);
      expect(series.summary.cumulative).toBe('250');
    });
  });
});
