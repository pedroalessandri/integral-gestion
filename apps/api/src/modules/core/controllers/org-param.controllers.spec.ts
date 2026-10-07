import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTenantApp } from '../../../common/testing/tenant-http-harness.js';
import { TenantGuard } from '../../auth/guards/tenant.guard.js';
import { PermissionsGuard } from '../../auth/guards/permissions.guard.js';
import { SuperadminOnlyGuard } from '../../auth/guards/superadmin-only.guard.js';
import { OrgUnitController } from './org-unit.controller.js';
import { MemberController } from './member.controller.js';
import { OrganizationModuleController } from './organization-module.controller.js';
import { OrgUnitService } from '../services/org-unit.service.js';
import { MemberService } from '../services/member.service.js';
import { ModuleEnablementService } from '../services/module-enablement.service.js';

const orgUnitService = { list: vi.fn().mockResolvedValue([]), getTree: vi.fn().mockResolvedValue([]) };
const memberService = {
  list: vi.fn().mockResolvedValue([]),
  setScope: vi.fn().mockResolvedValue({}),
};
const moduleService = {
  listForOrganization: vi.fn().mockResolvedValue([]),
  enableModule: vi.fn().mockResolvedValue({}),
};

let app: INestApplication;

beforeAll(async () => {
  app = await createTenantApp({
    controllers: [OrgUnitController, MemberController, OrganizationModuleController],
    providers: [
      { provide: OrgUnitService, useValue: orgUnitService },
      { provide: MemberService, useValue: memberService },
      { provide: ModuleEnablementService, useValue: moduleService },
    ],
    tenantGuard: TenantGuard,
    guardsToStub: [PermissionsGuard, SuperadminOnlyGuard],
  });
});

afterAll(async () => {
  await app?.close();
});

describe('core controllers: :orgId del path vs tenant del header', () => {
  it('OrgUnitController: header A + path B -> 403 TenantMismatch y no llega al service', async () => {
    const res = await request(app.getHttpServer())
      .get('/orgs/org-B/org-units')
      .set('X-Organization-Id', 'org-A');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('TenantMismatch');
    expect(orgUnitService.list).not.toHaveBeenCalled();
  });

  it('OrgUnitController: header A + path A -> pasa', async () => {
    const res = await request(app.getHttpServer())
      .get('/orgs/org-A/org-units')
      .set('X-Organization-Id', 'org-A');
    expect(res.status).toBe(200);
    expect(orgUnitService.list).toHaveBeenCalledWith('org-A');
  });

  it('MemberController: header A + path B -> 403 TenantMismatch', async () => {
    const res = await request(app.getHttpServer())
      .get('/orgs/org-B/members')
      .set('X-Organization-Id', 'org-A');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('TenantMismatch');
    expect(memberService.list).not.toHaveBeenCalled();
  });

  it('MemberController PATCH :userId/scope: header A + path B -> 403 TenantMismatch', async () => {
    const res = await request(app.getHttpServer())
      .patch('/orgs/org-B/members/user-9/scope')
      .set('X-Organization-Id', 'org-A')
      .send({ orgUnitId: null });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('TenantMismatch');
    expect(memberService.setScope).not.toHaveBeenCalled();
  });

  it('OrganizationModuleController: header A + path B -> 403 (list y enable)', async () => {
    const list = await request(app.getHttpServer())
      .get('/orgs/org-B/modules')
      .set('X-Organization-Id', 'org-A');
    expect(list.status).toBe(403);
    const enable = await request(app.getHttpServer())
      .post('/orgs/org-B/modules/okr/enable')
      .set('X-Organization-Id', 'org-A');
    expect(enable.status).toBe(403);
    expect(enable.body.message).toBe('TenantMismatch');
    expect(moduleService.listForOrganization).not.toHaveBeenCalled();
    expect(moduleService.enableModule).not.toHaveBeenCalled();
  });
});
