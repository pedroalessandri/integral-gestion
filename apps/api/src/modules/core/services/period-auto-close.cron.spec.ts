import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PeriodAutoCloseCron } from './period-auto-close.cron.js';

const mockExpiredPeriods = [
  {
    id: 'period-1',
    code: '2026-Q1',
    organizationId: 'org-1',
  },
  {
    id: 'period-2',
    code: '2026-Q2',
    organizationId: 'org-2',
  },
];

const mockPrismaRaw = {
  period: {
    findMany: vi.fn(),
  },
};

const mockPrismaService = {
  raw: mockPrismaRaw,
};

const mockPeriodService = {
  closePeriod: vi.fn(),
};

describe('PeriodAutoCloseCron', () => {
  let cron: PeriodAutoCloseCron;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cron = new PeriodAutoCloseCron(mockPrismaService as any, mockPeriodService as any);
  });

  it('calls closePeriod for each expired open period', async () => {
    mockPrismaRaw.period.findMany.mockResolvedValue(mockExpiredPeriods);
    mockPeriodService.closePeriod.mockResolvedValue(undefined);

    await cron.handleAutoClose();

    expect(mockPeriodService.closePeriod).toHaveBeenCalledTimes(2);
    expect(mockPeriodService.closePeriod).toHaveBeenCalledWith(
      'period-1',
      expect.objectContaining({ userId: 'system' }),
      'automatic',
    );
    expect(mockPeriodService.closePeriod).toHaveBeenCalledWith(
      'period-2',
      expect.objectContaining({ userId: 'system' }),
      'automatic',
    );
  });

  it('does nothing when no expired open periods exist', async () => {
    mockPrismaRaw.period.findMany.mockResolvedValue([]);

    await cron.handleAutoClose();

    expect(mockPeriodService.closePeriod).not.toHaveBeenCalled();
  });

  it('continues after one close fails (fault isolation)', async () => {
    mockPrismaRaw.period.findMany.mockResolvedValue(mockExpiredPeriods);

    // First call throws, second succeeds
    mockPeriodService.closePeriod
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(undefined);

    // Should not throw
    await expect(cron.handleAutoClose()).resolves.toBeUndefined();

    // Both were attempted
    expect(mockPeriodService.closePeriod).toHaveBeenCalledTimes(2);
  });

  it('queries for open periods with endsAt <= now and deletedAt null', async () => {
    mockPrismaRaw.period.findMany.mockResolvedValue([]);

    await cron.handleAutoClose();

    expect(mockPrismaRaw.period.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'open',
          deletedAt: null,
          endsAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });
});
