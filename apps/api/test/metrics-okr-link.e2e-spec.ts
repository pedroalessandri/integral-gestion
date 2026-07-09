import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * Módulo 2 "Indicadores en OKRs" — integration e2e.
 * Full flow: enable both modules → create metric + objective + KR → link →
 * load a MetricEntry → automatic KR recomputed → objective recomputed.
 * Plus one test per edge rule (RN-O5 unlink, RN-O6 sin-datos, RN-O7 block delete,
 * RN-O8 period-close read-only).
 *
 * Runs only when DATABASE_URL is set (needs a live Postgres, like the other e2e).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const SUPER = {
  'X-Dev-User-Id': 'e2e-superadmin-m2',
  'X-Dev-Is-Superadmin': 'true',
};

/** Superadmin headers bound to a tenant (org context via X-Organization-Id). */
function orgHeaders(orgId: string) {
  return { ...SUPER, 'X-Organization-Id': orgId };
}

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

const makeSlug = (s: string) => `e2e-m2-${s}-${Date.now()}`;

/** Create an org, ensure its period is open, and enable both indicadores modules. */
async function bootstrapOrg(suffix: string): Promise<{ orgId: string; periodId: string }> {
  const orgRes = await request(httpServer)
    .post('/api/v1/orgs')
    .set(SUPER)
    .send({ slug: makeSlug(suffix), name: 'M2 Test Org' });
  const orgId = orgRes.body.organization.id as string;
  const periodId = orgRes.body.period.id as string;

  const periodRes = await request(httpServer).get(`/api/v1/periods/${periodId}`).set(SUPER);
  if (periodRes.body.status === 'future') {
    await request(httpServer).post(`/api/v1/periods/${periodId}/open`).set(SUPER);
  }

  // Dependency order: indicadores-okr requires indicadores-gestion.
  await request(httpServer).post(`/api/v1/orgs/${orgId}/modules/indicadores-gestion/enable`).set(SUPER);
  await request(httpServer).post(`/api/v1/orgs/${orgId}/modules/indicadores-okr/enable`).set(SUPER);

  return { orgId, periodId };
}

async function createMetric(orgId: string): Promise<string> {
  const res = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/metrics`)
    .set(orgHeaders(orgId))
    .send({
      name: 'Trámites digitalizados',
      unit: 'number',
      direction: 'increasing',
      frequency: 'monthly',
      baselineValue: '0',
      targetValue: '100',
    });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

async function createObjectiveWithKr(orgId: string): Promise<{ objectiveId: string; krId: string }> {
  const objRes = await request(httpServer)
    .post('/api/v1/okr/objectives')
    .set(orgHeaders(orgId))
    .send({ title: 'Digitalización' });
  expect([200, 201]).toContain(objRes.status);
  const objectiveId = objRes.body.id as string;

  const krRes = await request(httpServer)
    .post(`/api/v1/okr/objectives/${objectiveId}/key-results`)
    .set(orgHeaders(orgId))
    .send({ title: 'KR métrico', weightBp: 10000 });
  expect([200, 201]).toContain(krRes.status);
  return { objectiveId, krId: krRes.body.id as string };
}

/** First valid monthly bucket = the period start. */
async function firstBucket(periodId: string): Promise<string> {
  const res = await request(httpServer).get(`/api/v1/periods/${periodId}`).set(SUPER);
  return res.body.startsAt as string;
}

describe.skipIf(!process.env['DATABASE_URL'])('M2 — metric ↔ KR link flow', () => {
  it('load entry → automatic KR recomputed → objective recomputed', async () => {
    const { orgId, periodId } = await bootstrapOrg('flow');
    const metricId = await createMetric(orgId);
    const { objectiveId, krId } = await createObjectiveWithKr(orgId);

    // Link with explicit baseline 0 / target 100.
    const linkRes = await request(httpServer)
      .put(`/api/v1/key-results/${krId}/metric-link`)
      .set(orgHeaders(orgId))
      .send({ metricId, baselineValue: '0', targetValue: '100' });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.estado).toBe('sin-datos'); // no entries yet (RN-O6)
    expect(linkRes.body.computedProgressBp).toBe(0);

    // Load a +50 entry → cumulative 50 → progress (50-0)/(100-0) = 5000 bp.
    const entryRes = await request(httpServer)
      .post(`/api/v1/metrics/${metricId}/entries`)
      .set(orgHeaders(orgId))
      .send({ bucketDate: await firstBucket(periodId), incrementValue: '50' });
    expect([200, 201]).toContain(entryRes.status);

    const cascade = await request(httpServer)
      .get(`/api/v1/okr/objectives/${objectiveId}/cascade`)
      .set(orgHeaders(orgId));
    expect(cascade.status).toBe(200);
    const kr = cascade.body.keyResults.find((k: { id: string }) => k.id === krId);
    expect(kr.progressMode).toBe('automatic');
    expect(kr.progressCachedBp).toBe(5000);
    expect(kr.metricLink.computedProgressBp).toBe(5000);
    expect(kr.metricLink.estado).toBe('ok');
    // Single KR at weight 10000 → objective mirrors the KR.
    expect(cascade.body.objective.progressCachedBp).toBe(5000);
  });

  it('RN-O7: deleting a metric with an active link is blocked (409)', async () => {
    const { orgId } = await bootstrapOrg('blockdel');
    const metricId = await createMetric(orgId);
    const { krId } = await createObjectiveWithKr(orgId);

    await request(httpServer)
      .put(`/api/v1/key-results/${krId}/metric-link`)
      .set(orgHeaders(orgId))
      .send({ metricId, baselineValue: '0', targetValue: '100' });

    const delRes = await request(httpServer)
      .delete(`/api/v1/metrics/${metricId}`)
      .set(orgHeaders(orgId));
    expect(delRes.status).toBe(409);
  });

  it('RN-O5: unlink reverts the KR to manual keeping its last %; then delete is allowed', async () => {
    const { orgId, periodId } = await bootstrapOrg('unlink');
    const metricId = await createMetric(orgId);
    const { objectiveId, krId } = await createObjectiveWithKr(orgId);

    await request(httpServer)
      .put(`/api/v1/key-results/${krId}/metric-link`)
      .set(orgHeaders(orgId))
      .send({ metricId, baselineValue: '0', targetValue: '100' });
    await request(httpServer)
      .post(`/api/v1/metrics/${metricId}/entries`)
      .set(orgHeaders(orgId))
      .send({ bucketDate: await firstBucket(periodId), incrementValue: '50' });

    const unlinkRes = await request(httpServer)
      .delete(`/api/v1/key-results/${krId}/metric-link`)
      .set(orgHeaders(orgId));
    expect(unlinkRes.status).toBe(204);

    const cascade = await request(httpServer)
      .get(`/api/v1/okr/objectives/${objectiveId}/cascade`)
      .set(orgHeaders(orgId));
    const kr = cascade.body.keyResults.find((k: { id: string }) => k.id === krId);
    expect(kr.progressMode).toBe('manual');
    expect(kr.progressCachedBp).toBe(5000); // last % preserved
    expect(kr.metricLink).toBeNull();

    // Metric now deletable (no active links).
    const delRes = await request(httpServer)
      .delete(`/api/v1/metrics/${metricId}`)
      .set(orgHeaders(orgId));
    expect(delRes.status).toBe(204);
  });

  it('RN-O8: with the period closed, editing the link is rejected', async () => {
    const { orgId, periodId } = await bootstrapOrg('closed');
    const metricId = await createMetric(orgId);
    const { krId } = await createObjectiveWithKr(orgId);

    await request(httpServer)
      .put(`/api/v1/key-results/${krId}/metric-link`)
      .set(orgHeaders(orgId))
      .send({ metricId, baselineValue: '0', targetValue: '100' });

    await request(httpServer).post(`/api/v1/periods/${periodId}/close`).set(SUPER);

    const patchRes = await request(httpServer)
      .patch(`/api/v1/key-results/${krId}/metric-link`)
      .set(orgHeaders(orgId))
      .send({ targetValue: '200' });
    expect(patchRes.status).toBeGreaterThanOrEqual(400);
  });
});
