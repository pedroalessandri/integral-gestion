import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTenantApp } from '../../../common/testing/tenant-http-harness.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { StrategicPlanController } from './strategic-plan.controller.js';
import { StrategicPlanService } from '../services/strategic-plan.service.js';
import { AxisService } from '../services/axis.service.js';

const planService = { getActive: vi.fn().mockResolvedValue({}), upsertActive: vi.fn() };
const axisService = { list: vi.fn().mockResolvedValue([]), softDelete: vi.fn() };

let app: INestApplication;

beforeAll(async () => {
  app = await createTenantApp({
    controllers: [StrategicPlanController],
    providers: [
      { provide: StrategicPlanService, useValue: planService },
      { provide: AxisService, useValue: axisService },
    ],
    tenantGuard: TenantGuard,
    guardsToStub: [PermissionsGuard],
  });
});

afterAll(async () => {
  await app?.close();
});

describe('StrategicPlanController: :orgId del path vs tenant del header', () => {
  it('header A + path B -> 403 TenantMismatch', async () => {
    const res = await request(app.getHttpServer())
      .get('/orgs/org-B/strategic-plan')
      .set('X-Organization-Id', 'org-A');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('TenantMismatch');
    expect(planService.getActive).not.toHaveBeenCalled();
  });

  it('header A + path A -> pasa', async () => {
    const res = await request(app.getHttpServer())
      .get('/orgs/org-A/strategic-plan/axes')
      .set('X-Organization-Id', 'org-A');
    expect(res.status).toBe(200);
    expect(axisService.list).toHaveBeenCalledWith('org-A');
  });
});
