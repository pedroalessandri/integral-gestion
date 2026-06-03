import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const SUPERADMIN_HEADERS = {
  'X-Dev-User-Id': 'e2e-superadmin-me',
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

describe.skipIf(!process.env['DATABASE_URL'])('GET /api/v1/me', () => {
  it('returns MeDto for a new user with no org memberships', async () => {
    const userId = `e2e-new-user-${Date.now()}`;
    const res = await request(httpServer)
      .get('/api/v1/me')
      .set({ 'X-Dev-User-Id': userId });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
    expect(Array.isArray(res.body.orgs)).toBe(true);
    expect(res.body.orgs).toHaveLength(0);
  });

  it('returns enabledModules in orgs when module is enabled', async () => {
    const userId = `e2e-me-with-org-${Date.now()}`;
    const slug = `e2e-me-org-${Date.now()}`;

    // Create an org
    const orgRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Me Test Org' });
    const orgId = orgRes.body.organization.id;

    // Lazy-create user via me endpoint
    await request(httpServer)
      .get('/api/v1/me')
      .set({ 'X-Dev-User-Id': userId });

    // Assign user to org
    await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/members`)
      .set(SUPERADMIN_HEADERS)
      .send({ userIdOrEmail: userId, roleId: 'org-user' });

    // Enable OKR module for the org
    await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/modules/okr/enable`)
      .set(SUPERADMIN_HEADERS);

    // Now get /me for the user
    const meRes = await request(httpServer)
      .get('/api/v1/me')
      .set({ 'X-Dev-User-Id': userId });

    expect(meRes.status).toBe(200);
    expect(meRes.body.orgs).toHaveLength(1);
    expect(meRes.body.orgs[0].id).toBe(orgId);
    expect(meRes.body.orgs[0].enabledModules).toContain('okr');
  });
});
