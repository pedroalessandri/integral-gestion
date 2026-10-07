import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTenantApp } from '../../../common/testing/tenant-http-harness.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard.js';
import { MetricController } from './metric.controller.js';
import { MetricService } from '../services/metric.service.js';

const metricService = { list: vi.fn().mockResolvedValue([]), create: vi.fn() };

let app: INestApplication;

beforeAll(async () => {
  app = await createTenantApp({
    controllers: [MetricController],
    providers: [{ provide: MetricService, useValue: metricService }],
    tenantGuard: TenantGuard,
    guardsToStub: [PermissionsGuard, ModuleEnabledGuard],
  });
});

afterAll(async () => {
  await app?.close();
});

describe('MetricController: :orgId del path vs tenant del header', () => {
  it('header A + path B -> 403 TenantMismatch (list y create)', async () => {
    const list = await request(app.getHttpServer())
      .get('/orgs/org-B/metrics')
      .set('X-Organization-Id', 'org-A');
    expect(list.status).toBe(403);
    expect(list.body.message).toBe('TenantMismatch');
    const create = await request(app.getHttpServer())
      .post('/orgs/org-B/metrics')
      .set('X-Organization-Id', 'org-A')
      .send({});
    expect(create.status).toBe(403);
    expect(metricService.list).not.toHaveBeenCalled();
    expect(metricService.create).not.toHaveBeenCalled();
  });

  it('header A + path A -> pasa', async () => {
    const res = await request(app.getHttpServer())
      .get('/orgs/org-A/metrics')
      .set('X-Organization-Id', 'org-A');
    expect(res.status).toBe(200);
    expect(metricService.list).toHaveBeenCalled();
  });
});
