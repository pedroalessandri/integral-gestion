import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PlanningTreeController } from './planning-tree.controller.js';

const GUARDS_METADATA = '__guards__';
const PERMISSIONS_KEY = 'permissions';

describe('PlanningTreeController', () => {
  const service = { getPlanningTree: vi.fn().mockResolvedValue({ periodId: 'p-1' }) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock mínimo del service
  const controller = new PlanningTreeController(service as any);

  it('default deny: TenantGuard + PermissionsGuard a nivel de clase y okr:read en la ruta', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, PlanningTreeController) as Array<{ name: string }>).map((g) => g.name);
    expect(guards).toEqual(['TenantGuard', 'PermissionsGuard']);
    const perms = Reflect.getMetadata(PERMISSIONS_KEY, PlanningTreeController.prototype.getPlanningTree) as string[] | undefined;
    expect(perms).toEqual(['okr:read']);
  });

  it('pasa la organización del contexto, nunca una del request', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AuthContext parcial
    await controller.getPlanningTree({ organizationId: 'org-1' } as any, { periodId: 'p-1', axisId: 'ax' });
    expect(service.getPlanningTree).toHaveBeenCalledWith('org-1', { periodId: 'p-1', axisId: 'ax' });
  });

  it('sin organización en el contexto -> 403', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AuthContext parcial
    expect(() => controller.getPlanningTree({ organizationId: null } as any, { periodId: 'p-1' })).toThrow(ForbiddenException);
  });
});
