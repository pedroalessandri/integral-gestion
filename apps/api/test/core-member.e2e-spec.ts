import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const SUPERADMIN_HEADERS = {
  'X-Dev-User-Id': 'e2e-superadmin-member',
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

const makeSlug = (s: string) => `e2e-mbr-${s}-${Date.now()}`;

describe.skipIf(!process.env['DATABASE_URL'])('Member management', () => {
  it('assigns a member and lists them', async () => {
    const orgRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug: makeSlug('assign'), name: 'Member Test Org' });
    const orgId = orgRes.body.organization.id;

    // Create a second user via dev auth (triggers lazy-create)
    const memberUserId = `e2e-member-user-${Date.now()}`;
    await request(httpServer)
      .get('/api/v1/me')
      .set({ 'X-Dev-User-Id': memberUserId });

    // Assign the member
    const assignRes = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/members`)
      .set(SUPERADMIN_HEADERS)
      .send({ userIdOrEmail: memberUserId, roleId: 'org-user' });

    expect(assignRes.status).toBe(201);
    expect(assignRes.body.userId).toBe(memberUserId);

    // List members
    const listRes = await request(httpServer)
      .get(`/api/v1/orgs/${orgId}/members`)
      .set(SUPERADMIN_HEADERS);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);
  });

  it('returns 404 when assigning a user that does not exist', async () => {
    const orgRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug: makeSlug('unknown-member'), name: 'Unknown Member Org' });
    const orgId = orgRes.body.organization.id;

    const res = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/members`)
      .set(SUPERADMIN_HEADERS)
      .send({ userIdOrEmail: 'nonexistent-user-id-xyz', roleId: 'org-user' });

    expect(res.status).toBe(404);
  });

  it('removes a member and returns 204', async () => {
    const orgRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug: makeSlug('remove'), name: 'Remove Member Org' });
    const orgId = orgRes.body.organization.id;

    const memberUserId = `e2e-remove-user-${Date.now()}`;
    await request(httpServer)
      .get('/api/v1/me')
      .set({ 'X-Dev-User-Id': memberUserId });

    await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/members`)
      .set(SUPERADMIN_HEADERS)
      .send({ userIdOrEmail: memberUserId, roleId: 'org-user' });

    const deleteRes = await request(httpServer)
      .delete(`/api/v1/orgs/${orgId}/members/${memberUserId}`)
      .set(SUPERADMIN_HEADERS);

    expect(deleteRes.status).toBe(204);
  });
});
