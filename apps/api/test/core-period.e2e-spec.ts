import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Core period e2e tests.
 * Tests D3-A partial unique index enforcement at DB level.
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const SUPERADMIN_HEADERS = {
  'X-Dev-User-Id': 'e2e-superadmin-period',
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

const makeOrgSlug = (suffix: string) => `e2e-prd-${suffix}-${Date.now()}`;

async function createOrg(slug: string): Promise<{ orgId: string; periodId: string }> {
  const res = await request(httpServer)
    .post('/api/v1/orgs')
    .set(SUPERADMIN_HEADERS)
    .send({ slug, name: 'Period Test Org' });
  return {
    orgId: res.body.organization.id,
    periodId: res.body.period.id,
  };
}

describe.skipIf(!process.env['DATABASE_URL'])('Period lifecycle', () => {
  it('creates org with an open or future period', async () => {
    const { orgId, periodId } = await createOrg(makeOrgSlug('base'));
    const res = await request(httpServer)
      .get(`/api/v1/periods/${periodId}`)
      .set(SUPERADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.organizationId).toBe(orgId);
    expect(res.body.status).toMatch(/^(open|future)$/);
  });

  it('close path: close an open period returns 200 with status=closed', async () => {
    const { periodId } = await createOrg(makeOrgSlug('close'));

    // First make sure period is open; if it's future, open it
    const periodRes = await request(httpServer)
      .get(`/api/v1/periods/${periodId}`)
      .set(SUPERADMIN_HEADERS);

    if (periodRes.body.status === 'future') {
      await request(httpServer)
        .post(`/api/v1/periods/${periodId}/open`)
        .set(SUPERADMIN_HEADERS);
    }

    const closeRes = await request(httpServer)
      .post(`/api/v1/periods/${periodId}/close`)
      .set(SUPERADMIN_HEADERS);

    expect(closeRes.status).toBe(200);
    expect(closeRes.body.status).toBe('closed');
    expect(closeRes.body.closedAt).not.toBeNull();
  });

  it('D3-A: cannot open a second period if one is already open', async () => {
    const slug = makeOrgSlug('d3a');
    const { orgId, periodId: firstPeriodId } = await createOrg(slug);

    // Ensure first period is open
    const firstPeriodRes = await request(httpServer)
      .get(`/api/v1/periods/${firstPeriodId}`)
      .set(SUPERADMIN_HEADERS);

    if (firstPeriodRes.body.status === 'future') {
      await request(httpServer)
        .post(`/api/v1/periods/${firstPeriodId}/open`)
        .set(SUPERADMIN_HEADERS);
    }

    // Create a second period in 'future' status
    const secondRes = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/periods`)
      .set(SUPERADMIN_HEADERS)
      .send({
        code: '2027-Q1',
        startsAt: '2027-01-01T03:00:00.000Z',
        endsAt: '2027-04-01T02:59:59.999Z',
      });

    expect(secondRes.status).toBe(201);
    const secondPeriodId = secondRes.body.id;

    // Attempt to open second period while first is still open → 409 D3-A
    const openRes = await request(httpServer)
      .post(`/api/v1/periods/${secondPeriodId}/open`)
      .set(SUPERADMIN_HEADERS);

    expect(openRes.status).toBe(409);
  });

  it('PATCH on open period returns 422', async () => {
    const { periodId } = await createOrg(makeOrgSlug('patch422'));

    const periodRes = await request(httpServer)
      .get(`/api/v1/periods/${periodId}`)
      .set(SUPERADMIN_HEADERS);

    if (periodRes.body.status === 'future') {
      await request(httpServer)
        .post(`/api/v1/periods/${periodId}/open`)
        .set(SUPERADMIN_HEADERS);
    }

    const patchRes = await request(httpServer)
      .patch(`/api/v1/periods/${periodId}`)
      .set(SUPERADMIN_HEADERS)
      .send({ code: '2026-Q3' });

    expect(patchRes.status).toBe(422);
  });

  it('PATCH on future period succeeds with 200', async () => {
    // Create org with a past quarter so period is 'future'
    const slug = makeOrgSlug('patch-future');
    const res = await request(httpServer)
      .post('/api/v1/orgs')
      .set(SUPERADMIN_HEADERS)
      .send({ slug, name: 'Patch Future Org', firstPeriod: { code: '2025-Q1' } });

    const periodId = res.body.period.id;

    const patchRes = await request(httpServer)
      .patch(`/api/v1/periods/${periodId}`)
      .set(SUPERADMIN_HEADERS)
      .send({ code: '2025-Q2', startsAt: '2025-04-01T03:00:00.000Z', endsAt: '2025-07-01T02:59:59.999Z' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.code).toBe('2025-Q2');
  });

  it('open on closed period returns 422', async () => {
    const { periodId } = await createOrg(makeOrgSlug('reopen'));

    const periodRes = await request(httpServer)
      .get(`/api/v1/periods/${periodId}`)
      .set(SUPERADMIN_HEADERS);

    if (periodRes.body.status === 'future') {
      await request(httpServer)
        .post(`/api/v1/periods/${periodId}/open`)
        .set(SUPERADMIN_HEADERS);
    }

    await request(httpServer)
      .post(`/api/v1/periods/${periodId}/close`)
      .set(SUPERADMIN_HEADERS);

    const reopenRes = await request(httpServer)
      .post(`/api/v1/periods/${periodId}/open`)
      .set(SUPERADMIN_HEADERS);

    expect(reopenRes.status).toBe(422);
  });
});
