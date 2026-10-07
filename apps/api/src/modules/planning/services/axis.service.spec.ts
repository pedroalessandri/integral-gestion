import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { AxisService } from './axis.service.js';

const mockTx = {
  strategicPlan: { findFirst: vi.fn() },
  axis: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const mockPrismaService = {
  scoped: { axis: { findMany: vi.fn(), findFirst: vi.fn() } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAudit = { emit: vi.fn().mockResolvedValue(undefined) };
const mockCounter = { countLiveObjectivesByAxis: vi.fn().mockResolvedValue(0) };
const mockUnassigner = { unassignAxisFromObjectives: vi.fn().mockResolvedValue([]) };

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
function axis(overrides: Record<string, unknown> = {}) {
  return {
    id: 'axis-1',
    strategicPlanId: 'plan-1',
    organizationId: 'org-1',
    name: 'Transformación Urbana',
    description: null,
    order: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AxisService', () => {
  let service: AxisService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    mockCounter.countLiveObjectivesByAxis.mockResolvedValue(0);
    mockUnassigner.unassignAxisFromObjectives.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AxisService(mockPrismaService as any, mockAudit as any, mockCounter, mockUnassigner);
  });

  describe('list / getById', () => {
    it('lista solo ejes vivos del plan activo de la org, ordenados', async () => {
      mockPrismaService.scoped.axis.findMany.mockResolvedValue([axis()]);
      mockCounter.countLiveObjectivesByAxis.mockResolvedValue(3);
      const items = await service.list('org-1');
      expect(items).toHaveLength(1);
      expect(items[0]?.objectiveCount).toBe(3);
      expect(mockCounter.countLiveObjectivesByAxis).toHaveBeenCalledWith('org-1', 'axis-1');
      expect(mockPrismaService.scoped.axis.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          deletedAt: null,
          strategicPlan: { organizationId: 'org-1', status: 'active' },
        },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      });
    });

    it('getById de un eje inexistente o de otra org -> 404', async () => {
      mockPrismaService.scoped.axis.findFirst.mockResolvedValue(null);
      await expect(service.getById('org-1', 'x')).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.scoped.axis.findFirst).toHaveBeenCalledWith({
        where: { id: 'x', organizationId: 'org-1', deletedAt: null },
      });
    });
  });

  describe('create', () => {
    it('crea el eje en el plan activo y audita axis.created', async () => {
      mockTx.strategicPlan.findFirst.mockResolvedValue({ id: 'plan-1' });
      mockTx.axis.create.mockResolvedValue(axis());

      const result = await service.create('org-1', { name: 'Transformación Urbana' }, ctx);

      expect(result.strategicPlanId).toBe('plan-1');
      expect(result.objectiveCount).toBe(0);
      expect(mockTx.strategicPlan.findFirst.mock.calls[0]?.[0].where).toEqual({
        organizationId: 'org-1',
        status: 'active',
      });
      expect(mockTx.axis.create.mock.calls[0]?.[0].data).toMatchObject({
        organizationId: 'org-1',
        strategicPlanId: 'plan-1',
        description: null,
        order: 0,
      });
      expect(mockAudit.emit.mock.calls[0]?.[0]).toMatchObject({
        action: 'axis.created',
        entityType: 'planning.axis',
        entityId: 'axis-1',
      });
    });

    it('sin plan activo -> 422 StrategicPlanRequired', async () => {
      mockTx.strategicPlan.findFirst.mockResolvedValue(null);
      const promise = service.create('org-1', { name: 'X' }, ctx);
      await expect(promise).rejects.toThrow(UnprocessableEntityException);
      await expect(promise).rejects.toThrow(/StrategicPlanRequired/);
      expect(mockTx.axis.create).not.toHaveBeenCalled();
      expect(mockAudit.emit).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('edita y audita solo los campos que cambiaron', async () => {
      mockTx.axis.findFirst.mockResolvedValue(axis());
      mockTx.axis.update.mockResolvedValue(axis({ name: 'Nuevo', order: 2 }));

      await service.update('org-1', 'axis-1', { name: 'Nuevo', order: 2, description: null }, ctx);

      expect(mockTx.axis.findFirst).toHaveBeenCalledWith({
        where: { id: 'axis-1', organizationId: 'org-1', deletedAt: null },
      });
      expect(mockAudit.emit.mock.calls[0]?.[0]).toMatchObject({
        action: 'axis.updated',
        diff: {
          before: { name: 'Transformación Urbana', order: 0 },
          after: { name: 'Nuevo', order: 2 },
        },
      });
    });

    it('sin cambios reales no emite evento', async () => {
      mockTx.axis.findFirst.mockResolvedValue(axis());
      mockTx.axis.update.mockResolvedValue(axis());
      await service.update('org-1', 'axis-1', { name: 'Transformación Urbana' }, ctx);
      expect(mockAudit.emit).not.toHaveBeenCalled();
    });

    it('eje inexistente o de otra org -> 404', async () => {
      mockTx.axis.findFirst.mockResolvedValue(null);
      await expect(service.update('org-1', 'x', { name: 'N' }, ctx)).rejects.toThrow(NotFoundException);
      expect(mockTx.axis.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('sin objetivos: marca deletedAt y audita axis.deleted con lista vacía', async () => {
      mockTx.axis.findFirst.mockResolvedValue(axis());
      mockTx.axis.update.mockResolvedValue(axis());

      const result = await service.softDelete('org-1', 'axis-1', ctx);

      expect(result).toEqual({ unassignedObjectiveCount: 0, unassignedObjectiveIds: [] });
      expect(mockUnassigner.unassignAxisFromObjectives).toHaveBeenCalledWith('org-1', 'axis-1');
      expect(mockTx.axis.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
      expect(mockAudit.emit.mock.calls[0]?.[0]).toMatchObject({
        action: 'axis.deleted',
        entityId: 'axis-1',
        diff: {
          before: { name: 'Transformación Urbana' },
          after: { unassignedObjectiveIds: [] },
        },
      });
    });

    it('con objetivos: los desasigna en la misma transacción, devuelve el conteo y audita los ids', async () => {
      mockTx.axis.findFirst.mockResolvedValue(axis());
      mockTx.axis.update.mockResolvedValue(axis());
      mockUnassigner.unassignAxisFromObjectives.mockResolvedValue(['obj-1', 'obj-2']);

      const result = await service.softDelete('org-1', 'axis-1', ctx);

      expect(result).toEqual({ unassignedObjectiveCount: 2, unassignedObjectiveIds: ['obj-1', 'obj-2'] });
      expect(mockPrismaService.runInTransaction).toHaveBeenCalledTimes(1);
      expect(mockAudit.emit.mock.calls[0]?.[0]).toMatchObject({
        action: 'axis.deleted',
        diff: { after: { unassignedObjectiveIds: ['obj-1', 'obj-2'] } },
      });
    });

    it('eje inexistente o de otra org -> 404 y no desasigna nada', async () => {
      mockTx.axis.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('org-1', 'x', ctx)).rejects.toThrow(NotFoundException);
      expect(mockUnassigner.unassignAxisFromObjectives).not.toHaveBeenCalled();
    });
  });
});
