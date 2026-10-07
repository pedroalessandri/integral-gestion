import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { MemberService } from './member.service.js';

const membership = {
  userId: 'u1',
  organizationId: 'org-1',
  roleId: 'r1',
  orgUnitId: null as string | null,
  assignedAt: new Date('2026-10-07T00:00:00Z'),
  user: { id: 'u1', email: 'u@x.com', displayName: 'U', auth0Sub: 'auth0|1' },
  role: { id: 'r1', key: 'org-user', name: 'User' },
};

const mockTx = { userOrganizationRole: { update: vi.fn() } };
const mockPrisma = {
  raw: {
    userOrganizationRole: { findUnique: vi.fn() },
    orgUnit: { findFirst: vi.fn() },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInTransaction: vi.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};
const mockAudit = { emit: vi.fn().mockResolvedValue(undefined) };

const ctx: AuthContext = {
  userId: 'admin',
  auth0Sub: 'auth0|a',
  email: 'a@x.com',
  displayName: 'A',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions: [],
  requestId: 'req-1',
};

describe('MemberService.setScope', () => {
  let service: MemberService;

  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.runInTransaction.mockImplementation((fn: (tx: any) => Promise<any>) => fn(mockTx));
    mockPrisma.raw.userOrganizationRole.findUnique.mockResolvedValue({ ...membership });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new MemberService(mockPrisma as any, mockAudit as any);
  });

  it('asigna una unidad de la misma org y audita scope_changed', async () => {
    mockPrisma.raw.orgUnit.findFirst.mockResolvedValue({ id: 'unit-1' });
    mockTx.userOrganizationRole.update.mockResolvedValue({ ...membership, orgUnitId: 'unit-1' });

    const result = await service.setScope(ctx, 'org-1', 'u1', 'unit-1');

    expect(result.orgUnitId).toBe('unit-1');
    expect(result.changed).toBe(true);
    expect(mockPrisma.raw.orgUnit.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      id: 'unit-1',
      organizationId: 'org-1',
      deletedAt: null,
    });
    expect(mockAudit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user_organization_role.scope_changed',
        diff: { before: { orgUnitId: null }, after: { orgUnitId: 'unit-1' } },
      }),
    );
  });

  it('null = alcance toda la org (RN-P19), sin validar unidad', async () => {
    mockPrisma.raw.userOrganizationRole.findUnique.mockResolvedValue({ ...membership, orgUnitId: 'unit-1' });
    mockTx.userOrganizationRole.update.mockResolvedValue({ ...membership, orgUnitId: null });

    const result = await service.setScope(ctx, 'org-1', 'u1', null);

    expect(result.orgUnitId).toBeNull();
    expect(mockPrisma.raw.orgUnit.findFirst).not.toHaveBeenCalled();
    expect(mockAudit.emit).toHaveBeenCalled();
  });

  it('404 si la unidad no existe en la org (o está borrada)', async () => {
    mockPrisma.raw.orgUnit.findFirst.mockResolvedValue(null);
    await expect(service.setScope(ctx, 'org-1', 'u1', 'other-org-unit')).rejects.toThrow(NotFoundException);
    expect(mockTx.userOrganizationRole.update).not.toHaveBeenCalled();
  });

  it('404 si el usuario no es miembro', async () => {
    mockPrisma.raw.userOrganizationRole.findUnique.mockResolvedValue(null);
    await expect(service.setScope(ctx, 'org-1', 'ghost', null)).rejects.toThrow(NotFoundException);
  });

  it('no-op sin audit si el alcance no cambia', async () => {
    const result = await service.setScope(ctx, 'org-1', 'u1', null);
    expect(result.changed).toBe(false);
    expect(mockAudit.emit).not.toHaveBeenCalled();
  });
});
