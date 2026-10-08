import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allowAllScope } from '../../../common/testing/org-unit-scope.stub.js';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { StrategicPlanService } from './strategic-plan.service.js';

const mockTx = {
  strategicPlan: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const mockPrismaService = {
  scoped: { strategicPlan: { findFirst: vi.fn() } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAudit = { emit: vi.fn().mockResolvedValue(undefined) };

const ctx: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|t',
  email: 't@example.com',
  displayName: 'T',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: ['planning:plan:manage'],
  requestId: 'req-1',
};

const now = new Date('2026-10-07T00:00:00Z');
function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    organizationId: 'org-1',
    title: 'Plan 2027-2031',
    vision: 'Una ciudad más verde',
    mandateStartsAt: new Date('2027-01-01T00:00:00Z'),
    mandateEndsAt: new Date('2031-01-01T00:00:00Z'),
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const input = {
  title: 'Plan 2027-2031',
  vision: 'Una ciudad más verde',
  mandateStartsAt: '2027-01-01T00:00:00.000Z',
  mandateEndsAt: '2031-01-01T00:00:00.000Z',
};

describe('StrategicPlanService', () => {
  let service: StrategicPlanService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new StrategicPlanService(mockPrismaService as any, mockAudit as any, allowAllScope());
  });

  describe('getActive', () => {
    it('devuelve el plan activo filtrando por organización', async () => {
      mockPrismaService.scoped.strategicPlan.findFirst.mockResolvedValue(plan());
      const result = await service.getActive('org-1');
      expect(result.id).toBe('plan-1');
      expect(result.mandateStartsAt).toBe('2027-01-01T00:00:00.000Z');
      expect(mockPrismaService.scoped.strategicPlan.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', status: 'active' },
      });
    });

    it('sin plan activo -> 404 (nunca null)', async () => {
      mockPrismaService.scoped.strategicPlan.findFirst.mockResolvedValue(null);
      await expect(service.getActive('org-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertActive', () => {
    it('crea el plan si no hay uno activo y audita strategic_plan.created', async () => {
      mockTx.strategicPlan.findFirst.mockResolvedValue(null);
      mockTx.strategicPlan.create.mockResolvedValue(plan());

      const result = await service.upsertActive('org-1', input, ctx);

      expect(result.status).toBe('active');
      expect(mockTx.strategicPlan.create.mock.calls[0]?.[0].data).toMatchObject({
        organizationId: 'org-1',
        status: 'active',
        title: 'Plan 2027-2031',
      });
      expect(mockAudit.emit).toHaveBeenCalledTimes(1);
      expect(mockAudit.emit.mock.calls[0]?.[0]).toMatchObject({
        action: 'strategic_plan.created',
        entityType: 'planning.strategic_plan',
        entityId: 'plan-1',
        diff: { before: null },
      });
    });

    it('edita el plan activo y audita solo los campos que cambiaron', async () => {
      mockTx.strategicPlan.findFirst.mockResolvedValue(plan());
      mockTx.strategicPlan.update.mockResolvedValue(plan({ title: 'Plan nuevo' }));

      await service.upsertActive('org-1', { ...input, title: 'Plan nuevo' }, ctx);

      expect(mockTx.strategicPlan.create).not.toHaveBeenCalled();
      expect(mockTx.strategicPlan.update.mock.calls[0]?.[0].where).toEqual({ id: 'plan-1' });
      expect(mockAudit.emit.mock.calls[0]?.[0]).toMatchObject({
        action: 'strategic_plan.updated',
        diff: { before: { title: 'Plan 2027-2031' }, after: { title: 'Plan nuevo' } },
      });
    });

    it('upsert sin cambios no emite evento', async () => {
      mockTx.strategicPlan.findFirst.mockResolvedValue(plan());
      mockTx.strategicPlan.update.mockResolvedValue(plan());

      await service.upsertActive('org-1', input, ctx);

      expect(mockAudit.emit).not.toHaveBeenCalled();
    });

    it('mandato con fin <= inicio -> 422 MandateRangeInvalid y no abre transacción', async () => {
      const promise = service.upsertActive('org-1', { ...input, mandateEndsAt: input.mandateStartsAt }, ctx);
      await expect(promise).rejects.toThrow(UnprocessableEntityException);
      await expect(promise).rejects.toThrow(/MandateRangeInvalid/);
      expect(mockPrismaService.runInTransaction).not.toHaveBeenCalled();
    });

    it('carrera con otro create (unique parcial) -> 409', async () => {
      mockTx.strategicPlan.findFirst.mockResolvedValue(null);
      mockTx.strategicPlan.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(service.upsertActive('org-1', input, ctx)).rejects.toThrow(ConflictException);
    });
  });
});
