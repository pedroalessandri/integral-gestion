import { describe, it, expect, vi, beforeEach } from 'vitest';
import { allowAllScope } from '../../../common/testing/org-unit-scope.stub.js';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { OrgUnitService } from './org-unit.service.js';

const mockTx = {
  orgUnit: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  userOrganizationRole: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
};
const mockPrismaService = {
  raw: { orgUnit: { findMany: vi.fn(), findFirst: vi.fn() } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAudit = { emit: vi.fn().mockResolvedValue(undefined) };
const mockCounter = { countLiveObjectivesByOrgUnit: vi.fn().mockResolvedValue(0) };

const ctx: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|t',
  email: 't@example.com',
  displayName: 'T',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: [],
  requestId: 'req-1',
};

const now = new Date('2026-10-07T00:00:00Z');
function row(id: string, parentId: string | null, kind = 'ministry') {
  return {
    id,
    organizationId: 'org-1',
    parentId,
    kind,
    name: id,
    vision: null,
    mission: null,
    order: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// root -> m1 -> a1 -> a2 (profundidad 4);  root -> m2
const live = [
  { id: 'root', parentId: null, kind: 'central' },
  { id: 'm1', parentId: 'root', kind: 'ministry' },
  { id: 'a1', parentId: 'm1', kind: 'area' },
  { id: 'a2', parentId: 'a1', kind: 'area' },
  { id: 'm2', parentId: 'root', kind: 'ministry' },
];

describe('OrgUnitService', () => {
  let service: OrgUnitService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrismaService.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    mockCounter.countLiveObjectivesByOrgUnit.mockResolvedValue(0);
    mockTx.orgUnit.findMany.mockResolvedValue(live);
    mockTx.orgUnit.count.mockResolvedValue(0);
    mockTx.userOrganizationRole.findMany.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new OrgUnitService(mockPrismaService as any, mockAudit as any, mockCounter, allowAllScope());
  });

  describe('create', () => {
    it('crea bajo un padre válido y audita', async () => {
      mockTx.orgUnit.create.mockResolvedValue(row('new', 'm2', 'area'));
      const result = await service.create('org-1', { parentId: 'm2', kind: 'area', name: 'new' }, ctx);
      expect(result.id).toBe('new');
      expect(mockTx.orgUnit.create.mock.calls[0]?.[0].data).toMatchObject({
        organizationId: 'org-1',
        parentId: 'm2',
        kind: 'area',
      });
      expect(mockAudit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'org_unit.created' }));
    });

    it('rechaza 422 si supera la profundidad 4', async () => {
      await expect(
        service.create('org-1', { parentId: 'a2', kind: 'area', name: 'x' }, ctx),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(mockTx.orgUnit.create).not.toHaveBeenCalled();
      expect(mockAudit.emit).not.toHaveBeenCalled();
    });

    it('422 OrgUnitInvalidParentKind: ministry bajo area', async () => {
      await expect(
        service.create('org-1', { parentId: 'a1', kind: 'ministry', name: 'x' }, ctx),
      ).rejects.toThrow(/OrgUnitInvalidParentKind/);
      expect(mockTx.orgUnit.create).not.toHaveBeenCalled();
    });

    it('permite ministry bajo ministry y area bajo area', async () => {
      mockTx.orgUnit.findMany.mockResolvedValue([
        { id: 'root', parentId: null, kind: 'central' },
        { id: 'm1', parentId: 'root', kind: 'ministry' },
        { id: 'a1', parentId: 'root', kind: 'area' },
      ]);
      mockTx.orgUnit.create.mockResolvedValue(row('n', 'm1'));
      await expect(
        service.create('org-1', { parentId: 'm1', kind: 'ministry', name: 'x' }, ctx),
      ).resolves.toBeDefined();
      await expect(
        service.create('org-1', { parentId: 'a1', kind: 'area', name: 'x' }, ctx),
      ).resolves.toBeDefined();
    });

    it('404 si el padre no existe en la org', async () => {
      await expect(
        service.create('org-1', { parentId: 'ghost', kind: 'area', name: 'x' }, ctx),
      ).rejects.toThrow(NotFoundException);
    });

    it('filtra las unidades por organizationId', async () => {
      mockTx.orgUnit.create.mockResolvedValue(row('new', 'm2', 'area'));
      await service.create('org-1', { parentId: 'm2', kind: 'area', name: 'x' }, ctx);
      expect(mockTx.orgUnit.findMany.mock.calls[0]?.[0].where).toMatchObject({
        organizationId: 'org-1',
        deletedAt: null,
      });
    });
  });

  describe('update (mover)', () => {
    it('rechaza 422 mover bajo un descendiente (ciclo)', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('m1', 'root'));
      await expect(service.update('org-1', 'm1', { parentId: 'a2' }, ctx)).rejects.toThrow(
        /OrgUnitCycle/,
      );
    });

    it('rechaza 422 mover bajo sí misma', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('m1', 'root'));
      await expect(service.update('org-1', 'm1', { parentId: 'm1' }, ctx)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('rechaza 422 si el subárbol movido excede la profundidad', async () => {
      // m1 (altura 3) bajo m2 (nivel 2) => 5 niveles
      mockTx.orgUnit.findFirst.mockResolvedValue(row('m1', 'root'));
      await expect(service.update('org-1', 'm1', { parentId: 'm2' }, ctx)).rejects.toThrow(
        /OrgUnitMaxDepthExceeded/,
      );
    });

    it('permite mover un subárbol que entra justo en 4 niveles y audita', async () => {
      // a1 (altura 2) bajo root (nivel 1) => 3 niveles
      mockTx.orgUnit.findFirst.mockResolvedValue(row('a1', 'm1', 'area'));
      mockTx.orgUnit.update.mockResolvedValue(row('a1', 'root', 'area'));
      const result = await service.update('org-1', 'a1', { parentId: 'root' }, ctx);
      expect(result.parentId).toBe('root');
      expect(mockAudit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'org_unit.updated' }));
    });

    it('422 OrgUnitInvalidParentKind al mover un ministry bajo un area', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('m2', 'root'));
      await expect(service.update('org-1', 'm2', { parentId: 'a1' }, ctx)).rejects.toThrow(
        /OrgUnitInvalidParentKind/,
      );
    });

    it('422 al cambiar kind a area si tiene hijos ministry', async () => {
      mockTx.orgUnit.findMany.mockResolvedValue([
        { id: 'root', parentId: null, kind: 'central' },
        { id: 'm1', parentId: 'root', kind: 'ministry' },
        { id: 'm1c', parentId: 'm1', kind: 'ministry' },
      ]);
      mockTx.orgUnit.findFirst.mockResolvedValue(row('m1', 'root'));
      await expect(service.update('org-1', 'm1', { kind: 'area' }, ctx)).rejects.toThrow(
        /OrgUnitInvalidParentKind/,
      );
    });

    it('permite cambiar kind a area si los hijos son area', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('a1', 'm1', 'area'));
      mockTx.orgUnit.update.mockResolvedValue(row('a1', 'm1', 'ministry'));
      // a1 (area) -> ministry: padre m1 (ministry) admite ministry; su hijo a2 (area) también.
      await expect(service.update('org-1', 'a1', { kind: 'ministry' }, ctx)).resolves.toBeDefined();
    });

    it('422 al cambiar kind a ministry bajo un padre area', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('a2', 'a1', 'area'));
      await expect(service.update('org-1', 'a2', { kind: 'ministry' }, ctx)).rejects.toThrow(
        /OrgUnitInvalidParentKind/,
      );
    });

    it('la raíz central no cambia de padre ni de kind (409)', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('root', null, 'central'));
      await expect(service.update('org-1', 'root', { parentId: 'm1' }, ctx)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.update('org-1', 'root', { kind: 'area' }, ctx)).rejects.toThrow(
        ConflictException,
      );
    });

    it('la raíz sí puede editar visión y misión', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('root', null, 'central'));
      mockTx.orgUnit.update.mockResolvedValue({ ...row('root', null, 'central'), vision: 'v' });
      const result = await service.update('org-1', 'root', { vision: 'v' }, ctx);
      expect(result.vision).toBe('v');
    });
  });

  describe('softDelete', () => {
    beforeEach(() => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('m2', 'root'));
    });

    it('hace soft delete y audita', async () => {
      mockTx.orgUnit.update.mockResolvedValue(row('m2', 'root'));
      await service.softDelete('org-1', 'm2', ctx);
      expect(mockTx.orgUnit.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
      expect(mockAudit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'org_unit.deleted' }));
    });

    it('409 con hijos vivos', async () => {
      mockTx.orgUnit.count.mockResolvedValue(2);
      await expect(service.softDelete('org-1', 'm2', ctx)).rejects.toThrow(/OrgUnitHasChildren/);
      expect(mockTx.orgUnit.update).not.toHaveBeenCalled();
    });

    it('409 con objetivos asignados (vía puerto)', async () => {
      mockCounter.countLiveObjectivesByOrgUnit.mockResolvedValue(3);
      await expect(service.softDelete('org-1', 'm2', ctx)).rejects.toThrow(/OrgUnitHasObjectives/);
      expect(mockCounter.countLiveObjectivesByOrgUnit).toHaveBeenCalledWith('org-1', 'm2');
    });

    it('409 con miembros cuyo alcance es la unidad, e incluye la lista', async () => {
      mockTx.userOrganizationRole.findMany.mockResolvedValue([
        { userId: 'u1', user: { displayName: 'Ana' } },
        { userId: 'u2', user: { displayName: 'Beto' } },
      ]);
      const err = await service.softDelete('org-1', 'm2', ctx).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      const body = (err as ConflictException).getResponse() as { members: unknown[]; message: string };
      expect(body.message).toMatch(/OrgUnitHasMembers/);
      expect(body.members).toEqual([
        { userId: 'u1', displayName: 'Ana' },
        { userId: 'u2', displayName: 'Beto' },
      ]);
      expect(mockTx.orgUnit.update).not.toHaveBeenCalled();
    });

    it('409 al borrar la raíz central', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(row('root', null, 'central'));
      await expect(service.softDelete('org-1', 'root', ctx)).rejects.toThrow(ConflictException);
    });

    it('404 si no existe', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('org-1', 'zzz', ctx)).rejects.toThrow(NotFoundException);
    });
  });

  describe('ensureCentralRoot', () => {
    it('crea la raíz con el nombre de la org y audita', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue(null);
      mockTx.organization.findUnique.mockResolvedValue({ name: 'Municipalidad' });
      mockTx.orgUnit.create.mockResolvedValue({ ...row('root', null, 'central'), name: 'Municipalidad' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await service.ensureCentralRoot(mockTx as any, 'org-1');
      expect(created).toBe(true);
      expect(mockTx.orgUnit.create.mock.calls[0]?.[0].data).toMatchObject({
        organizationId: 'org-1',
        parentId: null,
        kind: 'central',
        name: 'Municipalidad',
      });
      expect(mockAudit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'org_unit.created' }));
    });

    it('es idempotente: si ya existe no crea ni audita', async () => {
      mockTx.orgUnit.findFirst.mockResolvedValue({ id: 'root' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = await service.ensureCentralRoot(mockTx as any, 'org-1');
      expect(created).toBe(false);
      expect(mockTx.orgUnit.create).not.toHaveBeenCalled();
      expect(mockAudit.emit).not.toHaveBeenCalled();
    });
  });
});
