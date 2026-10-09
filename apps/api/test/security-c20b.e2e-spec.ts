import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ThrottlerStorage } from '@nestjs/throttler';

/**
 * C20b — fixes de la revisión de seguridad C20 contra una DB real.
 *  #1 (crítico): PeriodController y OrganizationController con TenantGuard / superadmin / alcance central.
 *  #2 (alto): vincular una métrica existente exige poder escribirla (assertCanWriteMetric).
 *
 * Corre solo si DATABASE_URL está definido (necesita Postgres, como los otros e2e).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;
let db: PrismaClient;

const SUPER = { 'X-Dev-User-Id': 'e2e-superadmin-c20b', 'X-Dev-Is-Superadmin': 'true' };
const orgHeaders = (orgId: string) => ({ ...SUPER, 'X-Organization-Id': orgId });
const asUser = (userId: string, orgId: string) => ({ 'X-Dev-User-Id': userId, 'X-Organization-Id': orgId });
const YEAR = new Date().getUTCFullYear();
const FORBIDDEN_SCOPE = /OrgUnitScopeForbidden/;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) })
    .compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  httpServer = app.getHttpServer();
  db = new PrismaClient();
});

afterAll(async () => {
  await db?.$disconnect();
  await app?.close();
});

async function bootstrapOrg(suffix: string) {
  const orgRes = await request(httpServer)
    .post('/api/v1/orgs')
    .set(SUPER)
    .send({
      slug: `e2e-c20b-${suffix}-${Date.now()}`,
      name: `C20b ${suffix}`,
      firstPeriod: { code: `C20B-${suffix}-${Date.now()}`, startsAt: `${YEAR}-01-01T00:00:00.000Z`, endsAt: `${YEAR}-12-31T00:00:00.000Z` },
    });
  expect(orgRes.status, JSON.stringify(orgRes.body)).toBe(201);
  const orgId = orgRes.body.organization.id as string;
  const periodId = orgRes.body.period.id as string;
  const periodRes = await request(httpServer).get(`/api/v1/periods/${periodId}`).set(orgHeaders(orgId));
  expect(periodRes.status, JSON.stringify(periodRes.body)).toBe(200);
  if (periodRes.body.status === 'future') {
    expect((await request(httpServer).post(`/api/v1/periods/${periodId}/open`).set(orgHeaders(orgId))).status).toBe(200);
  }
  const enabled = await request(httpServer).post(`/api/v1/orgs/${orgId}/modules/indicadores-gestion/enable`).set(orgHeaders(orgId));
  expect([200, 201], JSON.stringify(enabled.body)).toContain(enabled.status);
  const member = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/members`)
    .set(orgHeaders(orgId))
    .send({ userIdOrEmail: 'e2e-superadmin-c20b', roleId: 'role_org_admin' });
  expect([200, 201], JSON.stringify(member.body)).toContain(member.status);
  const units = await request(httpServer).get(`/api/v1/orgs/${orgId}/org-units`).set(orgHeaders(orgId));
  const central = (units.body.items as Array<{ id: string; kind: string }>).find((u) => u.kind === 'central');
  return { orgId, periodId, centralId: central?.id as string };
}

async function createUnit(orgId: string, parentId: string, kind: 'ministry' | 'area', name: string): Promise<string> {
  const res = await request(httpServer).post(`/api/v1/orgs/${orgId}/org-units`).set(orgHeaders(orgId)).send({ parentId, kind, name });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function inviteMember(orgId: string, email: string, roleKey: string, orgUnitId?: string): Promise<string> {
  const res = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/members/invite`)
    .set(orgHeaders(orgId))
    .send({ email, roleKey, orgUnitId: orgUnitId ?? null });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.userId as string;
}

async function createObjective(orgId: string, title: string, orgUnitId: string): Promise<string> {
  const res = await request(httpServer).post('/api/v1/okr/objectives').set(orgHeaders(orgId)).send({ title, orgUnitId });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

const metricBody = { name: 'Km', unit: 'number', frequency: 'monthly', kind: 'output' };
const indicatorBody = { baselineValue: '0', targetValue: '100', direction: 'increasing' };

describe.skipIf(!process.env['DATABASE_URL'])('C20b #1 — períodos y organizaciones', () => {
  it('sin membresía: 403 en orgs y períodos; miembro de A sobre B: 404 / TenantMismatch; alcance y superadmin', async () => {
    const orgA = await bootstrapOrg('a');
    const orgB = await bootstrapOrg('b');
    const outsider = { 'X-Dev-User-Id': 'e2e-outsider-c20b' };
    const outsiderInA = { ...outsider, 'X-Organization-Id': orgA.orgId };

    // ── Usuario autenticado SIN membresía ─────────────────────────────────────
    expect((await request(httpServer).get('/api/v1/orgs').set(outsider)).status).toBe(403);
    expect((await request(httpServer).post('/api/v1/orgs').set(outsider).send({ slug: 'hack', name: 'Hack', firstPeriod: { code: 'X', startsAt: `${YEAR}-01-01T00:00:00.000Z`, endsAt: `${YEAR}-12-31T00:00:00.000Z` } })).status).toBe(403);
    expect((await request(httpServer).post(`/api/v1/orgs/${orgA.orgId}/deactivate`).set(outsider).send({ reason: 'x' })).status).toBe(403);
    expect((await request(httpServer).post(`/api/v1/orgs/${orgA.orgId}/activate`).set(outsider)).status).toBe(403);
    expect((await request(httpServer).get(`/api/v1/orgs/${orgA.orgId}`).set(outsiderInA)).status).toBe(403);
    expect((await request(httpServer).patch(`/api/v1/orgs/${orgA.orgId}`).set(outsiderInA).send({ name: 'x' })).status).toBe(403);
    for (const call of [
      () => request(httpServer).post(`/api/v1/periods/${orgA.periodId}/close`).set(outsiderInA),
      () => request(httpServer).get(`/api/v1/periods/${orgA.periodId}`).set(outsiderInA),
      () => request(httpServer).post(`/api/v1/periods/${orgA.periodId}/open`).set(outsiderInA),
      () => request(httpServer).delete(`/api/v1/periods/${orgA.periodId}`).set(outsiderInA),
      () => request(httpServer).get(`/api/v1/orgs/${orgA.orgId}/periods`).set(outsiderInA),
      () => request(httpServer).post(`/api/v1/orgs/${orgA.orgId}/periods`).set(outsiderInA).send({ code: 'Z', startsAt: `${YEAR + 1}-01-01T00:00:00.000Z`, endsAt: `${YEAR + 1}-12-31T00:00:00.000Z` }),
    ]) {
      expect((await call()).status).toBe(403);
    }
    // Sin header de org tampoco (default deny): 400, nunca 2xx.
    const noHeader = await request(httpServer).post(`/api/v1/periods/${orgA.periodId}/close`).set(outsider);
    expect(noHeader.status).toBeGreaterThanOrEqual(400);
    expect((await db.period.findUnique({ where: { id: orgA.periodId } }))?.status).toBe('open');
    expect((await db.organization.findUnique({ where: { id: orgA.orgId } }))?.status).toBe('active');

    // ── Miembros de A: admin central, admin de unidad, org-user ───────────────
    const ministry = await createUnit(orgA.orgId, orgA.centralId, 'ministry', 'Ministerio');
    const unitAdmin = await inviteMember(orgA.orgId, `unit-admin-${Date.now()}@c20b.test`, 'org-admin', ministry);
    const centralAdmin = await inviteMember(orgA.orgId, `central-admin-${Date.now()}@c20b.test`, 'org-admin');
    const plainUser = await inviteMember(orgA.orgId, `user-${Date.now()}@c20b.test`, 'org-user');
    const hUnit = asUser(unitAdmin, orgA.orgId);
    const hCentral = asUser(centralAdmin, orgA.orgId);
    const hUser = asUser(plainUser, orgA.orgId);

    // Miembro de A sobre un período / org de B: 404 (período) y 403 (org). B queda intacta.
    for (const h of [hCentral, hUnit]) {
      expect((await request(httpServer).get(`/api/v1/periods/${orgB.periodId}`).set(h)).status).toBe(404);
      expect((await request(httpServer).post(`/api/v1/periods/${orgB.periodId}/close`).set(h)).status).toBe(404);
      expect((await request(httpServer).post(`/api/v1/periods/${orgB.periodId}/open`).set(h)).status).toBe(404);
      expect((await request(httpServer).delete(`/api/v1/periods/${orgB.periodId}`).set(h)).status).toBe(404);
      expect((await request(httpServer).get(`/api/v1/orgs/${orgB.orgId}/periods`).set(h)).status).toBe(403);
      expect((await request(httpServer).get(`/api/v1/orgs/${orgB.orgId}`).set(h)).status).toBe(403);
      expect((await request(httpServer).patch(`/api/v1/orgs/${orgB.orgId}`).set(h).send({ name: 'x' })).status).toBe(403);
    }
    expect((await request(httpServer).get('/api/v1/orgs').set(hCentral)).status).toBe(403); // ABM solo superadmin
    expect((await request(httpServer).post(`/api/v1/orgs/${orgA.orgId}/deactivate`).set(hCentral).send({ reason: 'x' })).status).toBe(403);
    expect((await db.period.findUnique({ where: { id: orgB.periodId } }))?.status).toBe('open');

    // ── Lecturas: cualquier miembro de la org (selector de período) ───────────
    for (const h of [hUser, hUnit, hCentral]) {
      const list = await request(httpServer).get(`/api/v1/orgs/${orgA.orgId}/periods`).set(h);
      expect(list.status).toBe(200);
      expect((list.body.items as Array<{ id: string }>).map((p) => p.id)).toContain(orgA.periodId);
      expect((await request(httpServer).get(`/api/v1/periods/${orgA.periodId}`).set(h)).status).toBe(200);
      expect((await request(httpServer).get(`/api/v1/orgs/${orgA.orgId}`).set(h)).status).toBe(200);
    }

    // ── Mutaciones: RBAC (org-user) y alcance central (admin de unidad) ───────
    expect((await request(httpServer).post(`/api/v1/periods/${orgA.periodId}/close`).set(hUser)).status).toBe(403);
    const unitClose = await request(httpServer).post(`/api/v1/periods/${orgA.periodId}/close`).set(hUnit);
    expect(unitClose.status).toBe(403);
    expect(unitClose.body.message).toMatch(FORBIDDEN_SCOPE);
    const nextPeriod = { code: `NEXT-${Date.now()}`, startsAt: `${YEAR + 1}-01-01T00:00:00.000Z`, endsAt: `${YEAR + 1}-12-31T00:00:00.000Z` };
    const unitCreate = await request(httpServer).post(`/api/v1/orgs/${orgA.orgId}/periods`).set(hUnit).send(nextPeriod);
    expect(unitCreate.status).toBe(403);
    expect(unitCreate.body.message).toMatch(FORBIDDEN_SCOPE);
    expect((await request(httpServer).delete(`/api/v1/periods/${orgA.periodId}`).set(hUnit)).status).toBe(403);
    expect((await db.period.findUnique({ where: { id: orgA.periodId } }))?.status).toBe('open');
    // Un admin de unidad tampoco edita el contexto de toda la organización.
    const unitPatch = await request(httpServer).patch(`/api/v1/orgs/${orgA.orgId}`).set(hUnit).send({ mission: 'x' });
    expect(unitPatch.status).toBe(403);
    expect(unitPatch.body.message).toMatch(FORBIDDEN_SCOPE);

    // Admin central: crea, cierra, y puede editar el contexto de su org.
    const created = await request(httpServer).post(`/api/v1/orgs/${orgA.orgId}/periods`).set(hCentral).send(nextPeriod);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect((await request(httpServer).patch(`/api/v1/orgs/${orgA.orgId}`).set(hCentral).send({ mission: 'Misión' })).status).toBe(200);
    expect((await request(httpServer).post(`/api/v1/periods/${orgA.periodId}/close`).set(hCentral)).status).toBe(200);
    expect((await db.period.findUnique({ where: { id: orgA.periodId } }))?.status).toBe('closed');
    // Abrir el próximo (central) y borrarlo (central).
    expect((await request(httpServer).post(`/api/v1/periods/${created.body.id as string}/open`).set(hCentral)).status).toBe(200);
    expect((await request(httpServer).delete(`/api/v1/periods/${created.body.id as string}`).set(hCentral)).status).toBe(204);

    // ── Superadmin: ABM de orgs y períodos (con header de la org) ─────────────
    expect((await request(httpServer).get('/api/v1/orgs').set(SUPER)).status).toBe(200);
    expect((await request(httpServer).get(`/api/v1/orgs/${orgB.orgId}`).set(orgHeaders(orgB.orgId))).status).toBe(200);
    expect((await request(httpServer).post(`/api/v1/periods/${orgB.periodId}/close`).set(orgHeaders(orgB.orgId))).status).toBe(200);
    // Superadmin con header de A no toca el período de B (404): el filtro de org no tiene excepción.
    expect((await request(httpServer).get(`/api/v1/periods/${orgB.periodId}`).set(orgHeaders(orgA.orgId))).status).toBe(404);
    expect((await request(httpServer).post(`/api/v1/orgs/${orgB.orgId}/deactivate`).set(SUPER).send({ reason: 'cierre e2e' })).status).toBe(200);
    expect((await request(httpServer).post(`/api/v1/orgs/${orgB.orgId}/activate`).set(SUPER)).status).toBe(200);

    // Auditoría: los eventos de cierre quedaron (solo INSERT).
    const events = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM audit.event WHERE action = 'period.closed' AND entity_id IN (${orgA.periodId}, ${orgB.periodId})`;
    expect(Number(events[0]?.n)).toBe(2);
  });
});

describe.skipIf(!process.env['DATABASE_URL'])('C20b #2 — vincular una métrica existente exige poder escribirla', () => {
  it('usuario de la unidad B no vincula una métrica central ni una de la unidad A; el central sí', async () => {
    const { orgId, centralId } = await bootstrapOrg('metric');
    const m = await createUnit(orgId, centralId, 'ministry', 'Ministerio M');
    const a = await createUnit(orgId, m, 'area', 'Área A');
    const b = await createUnit(orgId, m, 'area', 'Área B');
    const objA = await createObjective(orgId, 'Objetivo A', a);
    const objB = await createObjective(orgId, 'Objetivo B', b);
    const objB2 = await createObjective(orgId, 'Objetivo B2', b);

    const standalone = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/metrics`)
      .set(orgHeaders(orgId))
      .send({ ...metricBody, name: 'Central', direction: 'increasing', baselineValue: '0', targetValue: '10' });
    expect(standalone.status, JSON.stringify(standalone.body)).toBe(201);
    const metricCentral = standalone.body.id as string;

    const indA = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objA}/indicators`)
      .set(orgHeaders(orgId))
      .send({ metric: { ...metricBody, name: 'De A' }, ...indicatorBody });
    expect(indA.status, JSON.stringify(indA.body)).toBe(201);
    const metricA = indA.body.metricId as string;

    const adminB = await inviteMember(orgId, `admin-b-${Date.now()}@c20b.test`, 'org-admin', b);
    const adminCentral = await inviteMember(orgId, `admin-c-${Date.now()}@c20b.test`, 'org-admin');
    const hB = asUser(adminB, orgId);
    const hC = asUser(adminCentral, orgId);
    const link = (h: Record<string, string>, objectiveId: string, metricId: string) =>
      request(httpServer).post(`/api/v1/okr/objectives/${objectiveId}/indicators`).set(h).send({ metricId, ...indicatorBody });

    // Métrica central (sin objetivos vivos): solo el alcance central. B no la captura.
    const centralByB = await link(hB, objB, metricCentral);
    expect(centralByB.status, JSON.stringify(centralByB.body)).toBe(403);
    expect(centralByB.body.message).toMatch(FORBIDDEN_SCOPE);
    // Métrica de A: B no la traba para A.
    const aByB = await link(hB, objB, metricA);
    expect(aByB.status, JSON.stringify(aByB.body)).toBe(403);
    expect(aByB.body.message).toMatch(FORBIDDEN_SCOPE);
    const linkedCount = await db.objectiveIndicator.count({ where: { objectiveId: objB, deletedAt: null } });
    expect(linkedCount).toBe(0);

    // Control: B sí crea un indicador con métrica inline propia y la reutiliza en otro objetivo propio.
    const own = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objB}/indicators`)
      .set(hB)
      .send({ metric: { ...metricBody, name: 'De B' }, ...indicatorBody });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    expect((await link(hB, objB2, own.body.metricId as string)).status).toBe(201);

    // El alcance central vincula ambas.
    expect((await link(hC, objB, metricCentral)).status).toBe(201);
    expect((await link(hC, objB2, metricA)).status).toBe(201);
  });
});
