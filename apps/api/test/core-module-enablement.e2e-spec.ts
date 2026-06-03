import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const SUPERADMIN_HEADERS = {
  'X-Dev-User-Id': 'e2e-superadmin-module',
  'X-Dev-Is-Superadmin': 'true',
};

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  httpServer = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
});

const makeSlug = (s: string) => `e2e-mod-${s}-${Date.now()}`;

describe.skipIf(!process.env['DATABASE_URL'])('Module enablement', () => {
  it('enables a known module and returns 201', async () => {
    const orgRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug: makeSlug('enable'), name: 'Module Enable Org' });
    const orgId = orgRes.body.organization.id;

    const enableRes = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/modules/okr/enable`)
      .set(SUPERADMIN_HEADERS);

    expect(enableRes.status).toBe(201);
    expect(enableRes.body.moduleKey).toBe('okr');
    expect(enableRes.body.disabledAt).toBeNull();
  });

  it('returns 404 when enabling an unknown module key', async () => {
    const orgRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug: makeSlug('unknown-mod'), name: 'Unknown Module Org' });
    const orgId = orgRes.body.organization.id;

    const res = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/modules/nonexistent-module/enable`)
      .set(SUPERADMIN_HEADERS);

    expect(res.status).toBe(404);
  });

  it('disables an enabled module and returns 200', async () => {
    const orgRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug: makeSlug('disable'), name: 'Disable Module Org' });
    const orgId = orgRes.body.organization.id;

    await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/modules/okr/enable`)
      .set(SUPERADMIN_HEADERS);

    const disableRes = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/modules/okr/disable`)
      .set(SUPERADMIN_HEADERS);

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.disabledAt).not.toBeNull();
  });
});
