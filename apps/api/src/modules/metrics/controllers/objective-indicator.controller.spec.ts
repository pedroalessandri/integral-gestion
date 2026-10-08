import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { CreateObjectiveIndicatorDto } from '../dto/create-objective-indicator.dto.js';
import { UpdateObjectiveIndicatorDto } from '../dto/update-objective-indicator.dto.js';
import { SetIndicatorTargetPointsDto } from '../dto/indicator-target-point.dto.js';
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
  const service = {
    create: vi.fn().mockResolvedValue({ id: 'oi-1' }),
    listByObjective: vi.fn().mockResolvedValue([]),
    getTargetPoints: vi.fn().mockResolvedValue([]),
    setTargetPoints: vi.fn().mockResolvedValue([]),
  };
  const statusService = {
    getIndicatorStatus: vi.fn().mockResolvedValue({ objectiveIndicatorId: 'oi-1' }),
    getObjectiveStatus: vi.fn().mockResolvedValue({ objectiveId: 'obj-1' }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controller = new ObjectiveIndicatorController(service as any, statusService as any);
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
    for (const w of ['create', 'update', 'softDelete', 'setWeights', 'setTargetPoints'] as const) {
      expect(perms(w)).toEqual(['okr:write']);
    }
    for (const r of ['getStatus', 'getObjectiveStatus', 'getTargetPoints'] as const) {
      expect(perms(r)).toEqual(['okr:read']);
    }
  });

  it('el controller completo está detrás de TenantGuard + PermissionsGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ObjectiveIndicatorController)).toEqual([TenantGuard, PermissionsGuard]);
  });

  it('los endpoints de estado y de puntos usan el organizationId del contexto', async () => {
    await controller.getStatus(user(['okr:read']), 'oi-1');
    expect(statusService.getIndicatorStatus).toHaveBeenCalledWith('oi-1', 'org-1');
    await controller.getObjectiveStatus(user(['okr:read']), 'obj-1');
    expect(statusService.getObjectiveStatus).toHaveBeenCalledWith('obj-1', 'org-1');
    expect(await controller.getTargetPoints(user(['okr:read']), 'oi-1')).toEqual({ items: [] });
    const dto = { points: [{ bucketDate: '2027-12-01', expectedValue: '100' }] };
    await controller.setTargetPoints(user(['okr:write']), 'oi-1', dto);
    expect(service.setTargetPoints).toHaveBeenCalledWith('oi-1', 'org-1', dto, expect.anything());
    expect(() => controller.getStatus({ ...user(['okr:read']), organizationId: null }, 'oi-1')).toThrow(
      ForbiddenException,
    );
  });
});

describe('validación de DTOs de curva (borde, class-validator)', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const run = (type: new () => object, value: unknown) => pipe.transform(value, { type: 'body', metatype: type });

  it('acepta puntos bien formados y los transforma en instancias', async () => {
    const out = await run(SetIndicatorTargetPointsDto, { points: [{ bucketDate: '2027-12-01', expectedValue: '100.5' }] });
    expect(out).toBeInstanceOf(SetIndicatorTargetPointsDto);
  });

  it('rechaza fecha mal formada, valor no decimal y campos extra', async () => {
    await expect(run(SetIndicatorTargetPointsDto, { points: [{ bucketDate: '01/12/2027', expectedValue: '1' }] })).rejects.toThrow();
    await expect(run(SetIndicatorTargetPointsDto, { points: [{ bucketDate: '2027-12-01', expectedValue: '1e3' }] })).rejects.toThrow();
    await expect(run(SetIndicatorTargetPointsDto, { points: [{ bucketDate: '2027-12-01', expectedValue: '1.23456' }] })).rejects.toThrow();
    await expect(run(SetIndicatorTargetPointsDto, { points: [], extra: 1 })).rejects.toThrow();
    await expect(run(SetIndicatorTargetPointsDto, {})).rejects.toThrow();
  });

  it('create y update aceptan expectedCurveMode y targetPoints, y rechazan modos desconocidos', async () => {
    const points = [{ bucketDate: '2027-12-01', expectedValue: '100' }];
    await expect(run(CreateObjectiveIndicatorDto, { metricId: 'm', expectedCurveMode: 'manual', targetPoints: points })).resolves.toBeTruthy();
    await expect(run(UpdateObjectiveIndicatorDto, { expectedCurveMode: 'linear', targetPoints: points })).resolves.toBeTruthy();
    await expect(run(UpdateObjectiveIndicatorDto, { expectedCurveMode: 'cuadratica' })).rejects.toThrow();
    await expect(run(UpdateObjectiveIndicatorDto, { targetPoints: [{ bucketDate: 'x', expectedValue: '1' }] })).rejects.toThrow();
  });
});
