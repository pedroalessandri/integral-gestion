import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Core organization e2e tests.
 * Requires DATABASE_URL to be set and reachable with applied migrations.
 *
 * Tests use unique slugs to avoid conflicts across runs.
 * Dev auth stub headers simulate an authenticated superadmin user.
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const SUPERADMIN_HEADERS = {
  'X-Dev-User-Id': 'e2e-superadmin-org',
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

const makeSlug = (suffix: string) => `e2e-org-${suffix}-${Date.now()}`;

describe.skipIf(!process.env['DATABASE_URL'])('POST /api/v1/orgs — atomic create', () => {
  it('creates org + first period atomically and returns 201', async () => {
    const slug = makeSlug('create');
    const res = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Test Org' });

    expect(res.status).toBe(201);
    expect(res.body.organization.slug).toBe(slug);
    expect(res.body.organization.status).toBe('active');
    expect(res.body.period).toBeDefined();
    expect(res.body.period.status).toMatch(/^(open|future)$/);
  });

  it('returns 409 on duplicate slug', async () => {
    const slug = makeSlug('dup');
    await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'First Org' });

    const res = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Second Org' });

    expect(res.status).toBe(409);
  });

  it('derives Q from code when only code provided in firstPeriod', async () => {
    const slug = makeSlug('code-override');
    const res = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Code Override Org', firstPeriod: { code: '2025-Q4' } });

    expect(res.status).toBe(201);
    expect(res.body.period.code).toBe('2025-Q4');
    expect(res.body.period.status).toBe('future'); // past quarter → future
  });
});

describe.skipIf(!process.env['DATABASE_URL'])('GET /api/v1/orgs — list', () => {
  it('returns 200 with items array', async () => {
    const res = await request(httpServer)
      .get('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe.skipIf(!process.env['DATABASE_URL'])('PATCH /api/v1/orgs/:id — update', () => {
  it('updates org name and returns 200', async () => {
    const slug = makeSlug('patch');
    const createRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Original Name' });

    const id = createRes.body.organization.id;
    const patchRes = await request(httpServer)
      .patch(`/api/v1/orgs/${id}`)
      .set(SUPERADMIN_HEADERS)
      .send({ name: 'Updated Name' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.name).toBe('Updated Name');
  });
});

describe.skipIf(!process.env['DATABASE_URL'])('POST /api/v1/orgs/:id/deactivate + activate', () => {
  it('deactivates then activates an org', async () => {
    const slug = makeSlug('lifecycle');
    const createRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Lifecycle Org' });

    const id = createRes.body.organization.id;

    const deactivateRes = await request(httpServer)
      .post(`/api/v1/orgs/${id}/deactivate`)
      .set(SUPERADMIN_HEADERS)
      .send({ reason: 'Test deactivation' });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.status).toBe('inactive');

    const activateRes = await request(httpServer)
      .post(`/api/v1/orgs/${id}/activate`)
      .set(SUPERADMIN_HEADERS);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.status).toBe('active');
  });

  it('returns 409 when deactivating already-inactive org', async () => {
    const slug = makeSlug('double-deactivate');
    const createRes = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Double Deactivate' });

    const id = createRes.body.organization.id;

    await request(httpServer)
      .post(`/api/v1/orgs/${id}/deactivate`)
      .set(SUPERADMIN_HEADERS)
      .send({});

    const res2 = await request(httpServer)
      .post(`/api/v1/orgs/${id}/deactivate`)
      .set(SUPERADMIN_HEADERS)
      .send({});
    expect(res2.status).toBe(409);
  });
});
