import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { OrganizationService } from './organization.service.js';

const now = new Date('2026-10-07T00:00:00Z');
const mockTx = {
  organization: {
    create: vi.fn(),
  },
  period: { create: vi.fn() },
};
const mockPrisma = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAudit = { emit: vi.fn().mockResolvedValue(undefined) };
const mockOrgUnits = { ensureCentralRoot: vi.fn().mockResolvedValue(true) };

const ctx: AuthContext = {
  userId: 'su',
  auth0Sub: 'auth0|su',
  email: 'su@x.com',
  displayName: 'SU',
  isSuperadmin: true,
  organizationId: null,
  permissions: [],
  requestId: 'req-1',
};

describe('OrganizationService.create — raíz central (RN-P1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    mockTx.organization.create.mockResolvedValue({
      id: 'org-1',
      slug: 's',
      name: 'Org',
      status: 'active',
      deactivatedAt: null,
      mission: null,
      vision: null,
      values: null,
      context: null,
      createdAt: now,
      updatedAt: now,
    });
    mockTx.period.create.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-1',
      code: '2026',
      status: 'open',
      startsAt: now,
      endsAt: now,
      closedAt: null,
      closedByUserId: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('crea la raíz central en la misma transacción que la organización', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new OrganizationService(mockPrisma as any, mockAudit as any, mockOrgUnits as any);
    await service.create(
      {
        slug: 's',
        name: 'Org',
        firstPeriod: { code: '2026', startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-12-31T00:00:00Z' },
      },
      ctx,
    );
    expect(mockOrgUnits.ensureCentralRoot).toHaveBeenCalledWith(mockTx, 'org-1');
    expect(mockPrisma.runInTransaction).toHaveBeenCalledTimes(1);
  });
});
