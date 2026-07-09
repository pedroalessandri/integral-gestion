import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { MetricLinkService } from './metric-link.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

const authCtx: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|t',
  email: 't@e.com',
  displayName: 'T',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: ['metrics:write'],
  requestId: 'req-1',
};

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockScoped = {
  keyResult: { findFirst: vi.fn() },
  metric: { findFirst: vi.fn() },
  metricEntry: { findMany: vi.fn() },
  metricKrLink: { findFirst: vi.fn(), findMany: vi.fn() },
  objective: { findFirst: vi.fn() },
  metricObjectiveContext: { findFirst: vi.fn(), findMany: vi.fn() },
};
const mockTx = {
  metricKrLink: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  metricObjectiveContext: { create: vi.fn(), delete: vi.fn() },
};
const mockPrisma = {
  scoped: mockScoped,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAudit = { emit: vi.fn().mockResolvedValue(undefined) };
const mockKrService = {
  attachAutomaticKr: vi.fn().mockResolvedValue(undefined),
  detachAutomaticKr: vi.fn().mockResolvedValue(undefined),
  applyAutomaticKrProgress: vi.fn().mockResolvedValue(undefined),
};

/** KR that exists, period open, in period 'p1'. */
function krOpenP1() {
  return {
    id: 'kr-1',
    objective: { periodId: 'p1', period: { id: 'p1', code: '2026-Q3', status: 'open' } },
  };
}
/** Metric in period 'p1', increasing, baseline 0. */
function metricP1() {
  return { id: 'm-1', name: 'Trámites', direction: 'increasing', periodId: 'p1', baselineValue: '0' };
}

let service: MetricLinkService;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.runInTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockTx),
  );
  mockKrService.attachAutomaticKr.mockResolvedValue(undefined);
  mockKrService.detachAutomaticKr.mockResolvedValue(undefined);
  mockAudit.emit.mockResolvedValue(undefined);
  vi.spyOn(tenantContextStorage, 'run').mockImplementation((_ctx, fn) => fn());
  service = new MetricLinkService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockKrService as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockAudit as any,
  );
});

describe('MetricLinkService.upsert', () => {
  it('creates the link, flips the KR to automatic and interpolates progress', async () => {
    mockScoped.keyResult.findFirst.mockResolvedValue(krOpenP1());
    mockScoped.metric.findFirst.mockResolvedValue(metricP1());
    // one entry of +50 → cumulative 50 over baseline 0
    mockScoped.metricEntry.findMany.mockResolvedValue([{ incrementValue: '50' }]);
    mockScoped.metricKrLink.findFirst.mockResolvedValue(null);
    mockTx.metricKrLink.create.mockResolvedValue({
      id: 'link-1',
      metricId: 'm-1',
      keyResultId: 'kr-1',
      baselineValue: '0',
      targetValue: '100',
      direction: 'increasing',
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-07-01'),
    });

    // Explicit baseline '0' (default would be the current cumulative = 50, RN-O2).
    const dto = await service.upsert(
      'kr-1',
      'org-1',
      { metricId: 'm-1', baselineValue: '0', targetValue: '100' },
      authCtx,
    );

    // (50 - 0) / (100 - 0) = 0.5 → 5000 bp
    expect(dto.computedProgressBp).toBe(5000);
    expect(dto.estado).toBe('ok');
    expect(dto.baselineValue).toBe('0');
    expect(mockKrService.attachAutomaticKr).toHaveBeenCalledWith('kr-1', 5000, authCtx);
    expect(mockAudit.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kr.metric_linked' }),
    );
  });

  it('RN-O3: rejects (422) when metric and KR are in different periods', async () => {
    mockScoped.keyResult.findFirst.mockResolvedValue(krOpenP1());
    mockScoped.metric.findFirst.mockResolvedValue({ ...metricP1(), periodId: 'p2' });

    await expect(
      service.upsert('kr-1', 'org-1', { metricId: 'm-1', targetValue: '100' }, authCtx),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(mockTx.metricKrLink.create).not.toHaveBeenCalled();
  });

  it('§3: rejects (422) when baseline equals target', async () => {
    mockScoped.keyResult.findFirst.mockResolvedValue(krOpenP1());
    mockScoped.metric.findFirst.mockResolvedValue(metricP1());
    mockScoped.metricEntry.findMany.mockResolvedValue([]); // no data → actual = baseline 0
    mockScoped.metricKrLink.findFirst.mockResolvedValue(null);

    await expect(
      service.upsert('kr-1', 'org-1', { metricId: 'm-1', targetValue: '0' }, authCtx),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('RN-O6: a metric with no data yields progress 0 and estado "sin-datos"', async () => {
    mockScoped.keyResult.findFirst.mockResolvedValue(krOpenP1());
    mockScoped.metric.findFirst.mockResolvedValue(metricP1());
    mockScoped.metricEntry.findMany.mockResolvedValue([]); // no entries
    mockScoped.metricKrLink.findFirst.mockResolvedValue(null);
    mockTx.metricKrLink.create.mockResolvedValue({
      id: 'link-1',
      metricId: 'm-1',
      keyResultId: 'kr-1',
      baselineValue: '0',
      targetValue: '100',
      direction: 'increasing',
      createdAt: new Date('2026-07-01'),
      updatedAt: new Date('2026-07-01'),
    });

    const dto = await service.upsert('kr-1', 'org-1', { metricId: 'm-1', targetValue: '100' }, authCtx);

    expect(dto.computedProgressBp).toBe(0);
    expect(dto.estado).toBe('sin-datos');
    expect(mockKrService.attachAutomaticKr).toHaveBeenCalledWith('kr-1', 0, authCtx);
  });
});

describe('MetricLinkService.remove', () => {
  it('RN-O5: hard-deletes the link, audits it, and reverts the KR to manual', async () => {
    mockScoped.keyResult.findFirst.mockResolvedValue(krOpenP1());
    mockScoped.metricKrLink.findFirst.mockResolvedValue({
      id: 'link-1',
      metricId: 'm-1',
      keyResultId: 'kr-1',
      baselineValue: '0',
      targetValue: '100',
      direction: 'increasing',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.remove('kr-1', 'org-1', authCtx);

    expect(mockTx.metricKrLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
    expect(mockAudit.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'kr.metric_unlinked' }),
    );
    expect(mockKrService.detachAutomaticKr).toHaveBeenCalledWith('kr-1', authCtx);
  });

  it('throws 404 when the KR has no link', async () => {
    mockScoped.keyResult.findFirst.mockResolvedValue(krOpenP1());
    mockScoped.metricKrLink.findFirst.mockResolvedValue(null);

    await expect(service.remove('kr-1', 'org-1', authCtx)).rejects.toThrow(NotFoundException);
  });
});

describe('MetricLinkService.update', () => {
  it('rejects an empty patch (422)', async () => {
    await expect(service.update('kr-1', 'org-1', {}, authCtx)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});

describe('MetricLinkService.recalcLinkedKrs', () => {
  it('pushes interpolated progress to every linked KR', async () => {
    mockScoped.metricKrLink.findMany.mockResolvedValue([
      { keyResultId: 'kr-1', baselineValue: '0', targetValue: '100' },
    ]);
    mockScoped.metric.findFirst.mockResolvedValue(metricP1());
    mockScoped.metricEntry.findMany.mockResolvedValue([{ incrementValue: '25' }]);

    await service.recalcLinkedKrs('m-1', 'org-1', authCtx);

    // (25 - 0) / (100 - 0) = 2500 bp
    expect(mockKrService.applyAutomaticKrProgress).toHaveBeenCalledWith('kr-1', 2500, authCtx);
  });

  it('is a no-op when the metric has no links', async () => {
    mockScoped.metricKrLink.findMany.mockResolvedValue([]);

    await service.recalcLinkedKrs('m-1', 'org-1', authCtx);

    expect(mockKrService.applyAutomaticKrProgress).not.toHaveBeenCalled();
  });
});
