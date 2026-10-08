import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ObjectiveIndicatorController } from './objective-indicator.controller.js';

const user = (permissions: string[]): AuthContext => ({
  userId: 'u',
  auth0Sub: 'a',
  email: 'e@e.com',
  displayName: 'U',
  isSuperadmin: false,
  organizationId: 'org-1',
  permissions,
  requestId: 'r',
});

describe('ObjectiveIndicatorController', () => {
  const service = { create: vi.fn().mockResolvedValue({ id: 'oi-1' }), listByObjective: vi.fn().mockResolvedValue([]) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controller = new ObjectiveIndicatorController(service as any);
  const inline = { name: 'N', unit: 'number', frequency: 'monthly', kind: 'output' } as const;

  it('crear con métrica nueva alcanza con okr:write y pasa el organizationId del contexto', async () => {
    await controller.create(user(['okr:write']), 'obj-1', { metric: inline, targetValue: '1', direction: 'increasing' });
    await controller.create(user(['okr:write']), 'obj-1', { metricId: 'm-1' });
    expect(service.create).toHaveBeenCalledTimes(2);
    expect(service.create).toHaveBeenLastCalledWith('obj-1', 'org-1', { metricId: 'm-1' }, expect.anything());
  });

  it('sin organización en el contexto -> 403', async () => {
    await expect(controller.list({ ...user(['okr:read']), organizationId: null }, 'obj-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('cada handler declara permiso (default deny): lectura okr:read, escritura okr:write', () => {
    const proto = ObjectiveIndicatorController.prototype;
    const perms = (name: keyof ObjectiveIndicatorController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, proto[name] as object) as string[];
    expect(perms('list')).toEqual(['okr:read']);
    expect(perms('getById')).toEqual(['okr:read']);
    for (const w of ['create', 'update', 'softDelete', 'setWeights'] as const) {
      expect(perms(w)).toEqual(['okr:write']);
    }
  });
});
