import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ThrottlerStorage } from '@nestjs/throttler';

/**
 * Planificación F8 / C19 — alcance de escritura por unidad (RN-P19, RN-P20, RN-P21) contra una DB real.
 * Permiso = RBAC (rol) ∧ alcance. Matriz: alcance central vs. unidad (propia, hija, hermana, ancestro),
 * lecturas de toda la org, superadmin, N1/N2/árbol solo central, invitar con unidad y aislamiento entre orgs.
 *
 * Corre solo si DATABASE_URL está definido (necesita Postgres, como los otros e2e).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;
let db: PrismaClient;

const SUPER = { 'X-Dev-User-Id': 'e2e-superadmin-c19', 'X-Dev-Is-Superadmin': 'true' };
const orgHeaders = (orgId: string) => ({ ...SUPER, 'X-Organization-Id': orgId });
const asUser = (userId: string, orgId: string) => ({ 'X-Dev-User-Id': userId, 'X-Organization-Id': orgId });
const YEAR = new Date().getUTCFullYear();

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

const FORBIDDEN = /OrgUnitScopeForbidden/;

async function bootstrapOrg(suffix: string) {
  const orgRes = await request(httpServer)
    .post('/api/v1/orgs')
    .set(SUPER)
    .send({
      slug: `e2e-c19-${suffix}-${Date.now()}`,
      name: `C19 ${suffix}`,
      firstPeriod: { code: `C19-${suffix}-${Date.now()}`, startsAt: `${YEAR}-01-01T00:00:00.000Z`, endsAt: `${YEAR}-12-31T00:00:00.000Z` },
    });
  expect(orgRes.status, JSON.stringify(orgRes.body)).toBe(201);
  const orgId = orgRes.body.organization.id as string;
  const periodId = orgRes.body.period.id as string;
  const periodRes = await request(httpServer).get(`/api/v1/periods/${periodId}`).set(SUPER);
  if (periodRes.body.status === 'future') await request(httpServer).post(`/api/v1/periods/${periodId}/open`).set(SUPER);
  const enabled = await request(httpServer).post(`/api/v1/orgs/${orgId}/modules/indicadores-gestion/enable`).set(orgHeaders(orgId));
  expect([200, 201], JSON.stringify(enabled.body)).toContain(enabled.status);
  const member = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/members`)
    .set(orgHeaders(orgId))
    .send({ userIdOrEmail: 'e2e-superadmin-c19', roleId: 'role_org_admin' });
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

/** Invita (como superadmin) a un miembro con rol y alcance; devuelve su userId. */
async function inviteMember(orgId: string, email: string, roleKey: string, orgUnitId?: string): Promise<string> {
  const res = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/members/invite`)
    .set(orgHeaders(orgId))
    .send({ email, roleKey, orgUnitId: orgUnitId ?? null });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  expect(res.body.orgUnitId).toBe(orgUnitId ?? null);
  return res.body.userId as string;
}

async function createObjective(orgId: string, title: string, orgUnitId: string): Promise<string> {
  const res = await request(httpServer).post('/api/v1/okr/objectives').set(orgHeaders(orgId)).send({ title, orgUnitId });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as string;
}

async function createProject(orgId: string, objectiveId: string, title: string, orgUnitId?: string) {
  const h = orgHeaders(orgId);
  const proj = await request(httpServer)
    .post(`/api/v1/okr/objectives/${objectiveId}/projects`)
    .set(h)
    .send({ title, startsAt: `${YEAR}-01-05T00:00:00.000Z`, endsAt: `${YEAR}-06-30T00:00:00.000Z`, ...(orgUnitId && { orgUnitId }) });
  expect(proj.status, JSON.stringify(proj.body)).toBe(201);
  const task = await request(httpServer)
    .post(`/api/v1/okr/projects/${proj.body.id as string}/tasks`)
    .set(h)
    .send({ title: `Tarea ${title}`, startsAt: `${YEAR}-01-06T00:00:00.000Z`, endsAt: `${YEAR}-02-28T00:00:00.000Z` });
  expect(task.status, JSON.stringify(task.body)).toBe(201);
  return { projectId: proj.body.id as string, taskId: task.body.id as string };
}

async function createIndicator(orgId: string, objectiveId: string, extra: Record<string, unknown>) {
  return request(httpServer)
    .post(`/api/v1/okr/objectives/${objectiveId}/indicators`)
    .set(orgHeaders(orgId))
    .send({ baselineValue: '0', targetValue: '100', direction: 'increasing', ...extra });
}

const metricBody = { name: 'Km', unit: 'number', frequency: 'monthly', kind: 'output' };

describe.skipIf(!process.env['DATABASE_URL'])('C19 — alcance por unidad', () => {
  it('matriz rol x alcance: escritura solo en la unidad propia y descendientes; lectura de toda la org', async () => {
    const { orgId, periodId, centralId } = await bootstrapOrg('matrix');
    const firstBucket = (await request(httpServer).get(`/api/v1/periods/${periodId}`).set(SUPER)).body.startsAt as string;

    // Árbol: central -> M (ministry) -> A (area) -> A1 (area); M -> B (area).
    const m = await createUnit(orgId, centralId, 'ministry', 'Ministerio M');
    const a = await createUnit(orgId, m, 'area', 'Área A');
    const a1 = await createUnit(orgId, a, 'area', 'Área A1');
    const b = await createUnit(orgId, m, 'area', 'Área B');

    const objA = await createObjective(orgId, 'Objetivo de A', a);
    const objA1 = await createObjective(orgId, 'Objetivo de A1', a1);
    const objB = await createObjective(orgId, 'Objetivo de B', b);
    const objM = await createObjective(orgId, 'Objetivo de M', m);
    const projA = await createProject(orgId, objA, 'Proyecto de A');
    const projB = await createProject(orgId, objB, 'Proyecto de B');
    const projAinM = await createProject(orgId, objM, 'Proyecto de A dentro de M', a);

    // Métricas: una compartida entre A y B, una solo de A, una standalone.
    const indA = await createIndicator(orgId, objA, { metric: metricBody });
    expect(indA.status, JSON.stringify(indA.body)).toBe(201);
    const metricOnlyA = indA.body.metricId as string;
    const indShared = await createIndicator(orgId, objA, { metric: { ...metricBody, name: 'Compartida' } });
    const metricShared = indShared.body.metricId as string;
    const indB = await createIndicator(orgId, objB, { metricId: metricShared });
    expect(indB.status, JSON.stringify(indB.body)).toBe(201);
    const standalone = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/metrics`)
      .set(orgHeaders(orgId))
      .send({ ...metricBody, name: 'Standalone', direction: 'increasing', baselineValue: '0', targetValue: '10' });
    expect(standalone.status, JSON.stringify(standalone.body)).toBe(201);
    const metricStandalone = standalone.body.id as string;

    const adminA = await inviteMember(orgId, `admin-a-${Date.now()}@c19.test`, 'org-admin', a);
    const userA = await inviteMember(orgId, `user-a-${Date.now()}@c19.test`, 'org-user', a);
    const readerA = await inviteMember(orgId, `reader-a-${Date.now()}@c19.test`, 'org-reader', a);
    const adminCentral = await inviteMember(orgId, `admin-c-${Date.now()}@c19.test`, 'org-admin');
    const hA = asUser(adminA, orgId);
    const hC = asUser(adminCentral, orgId);

    // ── Objetivos ─────────────────────────────────────────────────────────────
    const patch = (h: Record<string, string>, id: string) => request(httpServer).patch(`/api/v1/okr/objectives/${id}`).set(h).send({ description: 'x' });
    expect((await patch(hA, objA)).status).toBe(200);
    expect((await patch(hA, objA1)).status).toBe(200); // hija de A
    for (const id of [objB, objM]) {
      const res = await patch(hA, id); // hermana y ancestro
      expect(res.status, id).toBe(403);
      expect(res.body.message).toMatch(FORBIDDEN);
    }
    // Mover un objetivo propio a una unidad ajena también está prohibido.
    const move = await request(httpServer).patch(`/api/v1/okr/objectives/${objA}`).set(hA).send({ orgUnitId: b });
    expect(move.status).toBe(403);
    expect((await request(httpServer).post('/api/v1/okr/objectives').set(hA).send({ title: 'En A', orgUnitId: a1 })).status).toBe(201);
    expect((await request(httpServer).post('/api/v1/okr/objectives').set(hA).send({ title: 'En B', orgUnitId: b })).status).toBe(403);
    expect((await request(httpServer).post('/api/v1/okr/objectives').set(hA).send({ title: 'Sin unidad' })).status).toBe(403);
    expect((await request(httpServer).delete(`/api/v1/okr/objectives/${objB}`).set(hA)).status).toBe(403);
    // Alcance central: edita cualquier unidad.
    expect((await patch(hC, objB)).status).toBe(200);
    expect((await patch(hC, objM)).status).toBe(200);

    // ── Lecturas: toda la org para el alcance de unidad (RN-P20) ──────────────
    const list = await request(httpServer).get('/api/v1/okr/objectives').set(hA);
    expect(list.status).toBe(200);
    const titles = (list.body as Array<{ title: string }>).map((o) => o.title);
    expect(titles).toEqual(expect.arrayContaining(['Objetivo de A', 'Objetivo de B', 'Objetivo de M']));
    expect((await request(httpServer).get(`/api/v1/okr/objectives/${objB}`).set(hA)).status).toBe(200);
    expect((await request(httpServer).get(`/api/v1/okr/objectives/${objB}/projects`).set(hA)).status).toBe(200);
    expect((await request(httpServer).get(`/api/v1/okr/objectives/${objB}/indicators`).set(hA)).status).toBe(200);
    expect((await request(httpServer).get(`/api/v1/orgs/${orgId}/org-units/tree`).set(hA)).status).toBe(200);
    expect((await request(httpServer).get(`/api/v1/orgs/${orgId}/strategic-plan/axes`).set(hA)).status).toBe(200);

    // ── Proyectos y tareas: la unidad efectiva es la del proyecto ─────────────
    const patchProject = (h: Record<string, string>, id: string) => request(httpServer).patch(`/api/v1/okr/projects/${id}`).set(h).send({ description: 'x' });
    expect((await patchProject(hA, projA.projectId)).status).toBe(200);
    const pB = await patchProject(hA, projB.projectId);
    expect(pB.status).toBe(403);
    expect(pB.body.message).toMatch(FORBIDDEN);
    // Proyecto de A colgado de un objetivo de M: A lo edita (su unidad), pero no el objetivo ni sus pesos.
    expect((await patchProject(hA, projAinM.projectId)).status).toBe(200);
    expect((await request(httpServer).put(`/api/v1/okr/objectives/${objM}/projects/weights`).set(hA).send({ weights: [{ id: projAinM.projectId, weightBp: null }] })).status).toBe(403);
    // Crear proyecto en objetivo de M: con la unidad propia sí (delegación RN-P4), heredando la de M no.
    const mkProject = (unit?: string) =>
      request(httpServer)
        .post(`/api/v1/okr/objectives/${objM}/projects`)
        .set(hA)
        .send({ title: 'Nuevo', startsAt: `${YEAR}-01-05T00:00:00.000Z`, endsAt: `${YEAR}-06-30T00:00:00.000Z`, ...(unit && { orgUnitId: unit }) });
    expect((await mkProject(a1)).status).toBe(201);
    expect((await mkProject()).status).toBe(403);
    expect((await request(httpServer).delete(`/api/v1/okr/projects/${projB.projectId}`).set(hA)).status).toBe(403);

    const taskBody = { title: 'T', startsAt: `${YEAR}-01-06T00:00:00.000Z`, endsAt: `${YEAR}-02-28T00:00:00.000Z` };
    expect((await request(httpServer).post(`/api/v1/okr/projects/${projA.projectId}/tasks`).set(hA).send(taskBody)).status).toBe(201);
    expect((await request(httpServer).post(`/api/v1/okr/projects/${projB.projectId}/tasks`).set(hA).send(taskBody)).status).toBe(403);
    expect((await request(httpServer).patch(`/api/v1/okr/tasks/${projB.taskId}`).set(hA).send({ title: 'Y' })).status).toBe(403);
    expect((await request(httpServer).delete(`/api/v1/okr/tasks/${projB.taskId}`).set(hA)).status).toBe(403);
    expect((await request(httpServer).put(`/api/v1/okr/tasks/${projB.taskId}/progress`).set(hA).send({ progressBp: 5000 })).status).toBe(403);
    expect((await request(httpServer).put(`/api/v1/okr/tasks/${projA.taskId}/progress`).set(hA).send({ progressBp: 5000 })).status).toBe(200);

    // org-user con alcance A: el rol (RBAC) manda primero, y su carga de avance respeta el alcance.
    const hUA = asUser(userA, orgId);
    expect((await patch(hUA, objA)).status).toBe(403); // sin okr:write (RBAC)
    expect((await request(httpServer).put(`/api/v1/okr/tasks/${projA.taskId}/progress`).set(hUA).send({ progressBp: 7000 })).status).toBe(200);
    const uB = await request(httpServer).put(`/api/v1/okr/tasks/${projB.taskId}/progress`).set(hUA).send({ progressBp: 7000 });
    expect(uB.status).toBe(403);
    expect(uB.body.message).toMatch(FORBIDDEN);

    // ── Indicadores y curva ───────────────────────────────────────────────────
    expect((await createIndicator(orgId, objA, {})).status).toBe(422); // control: sin metric/metricId falla por validación, no por alcance
    const mkIndicator = (h: Record<string, string>, id: string) =>
      request(httpServer).post(`/api/v1/okr/objectives/${id}/indicators`).set(h).send({ metric: { ...metricBody, name: `I-${Math.random()}` }, baselineValue: '0', targetValue: '10', direction: 'increasing' });
    expect((await mkIndicator(hA, objA1)).status).toBe(201);
    expect((await mkIndicator(hA, objB)).status).toBe(403);
    expect((await request(httpServer).patch(`/api/v1/okr/indicators/${indB.body.id as string}`).set(hA).send({ targetValue: '50' })).status).toBe(403);
    expect((await request(httpServer).put(`/api/v1/okr/indicators/${indB.body.id as string}/target-points`).set(hA).send({ points: [] })).status).toBe(403);
    expect((await request(httpServer).put(`/api/v1/okr/objectives/${objB}/indicators/weights`).set(hA).send({ weights: [{ id: indB.body.id as string, weightBp: null }] })).status).toBe(403);
    expect((await request(httpServer).delete(`/api/v1/okr/indicators/${indB.body.id as string}`).set(hA)).status).toBe(403);
    expect((await request(httpServer).patch(`/api/v1/okr/indicators/${indA.body.id as string}`).set(hA).send({ targetValue: '50' })).status).toBe(200);

    // ── Cargas de métrica: conservador = todas las unidades de los objetivos vinculados ──
    const entry = (h: Record<string, string>, metricId: string) =>
      request(httpServer).post(`/api/v1/metrics/${metricId}/entries`).set(h).send({ bucketDate: firstBucket, incrementValue: '5' });
    expect((await entry(hA, metricOnlyA)).status).toBe(201); // solo A
    const shared = await entry(hA, metricShared); // A y B
    expect(shared.status).toBe(403);
    expect(shared.body.message).toMatch(FORBIDDEN);
    expect((await entry(hA, metricStandalone)).status).toBe(403); // sin unidad: solo central
    expect((await entry(hUA, metricOnlyA)).status).toBe(201); // org-user con metrics:entry:write y alcance A
    expect((await entry(hUA, metricShared)).status).toBe(403);
    expect((await entry(hC, metricShared)).status).toBe(201);
    expect((await entry(hC, metricStandalone)).status).toBe(201);

    // ── N1 / N2 / árbol: solo alcance central ─────────────────────────────────
    const plan = { title: 'Plan', vision: 'Visión', mandateStartsAt: `${YEAR}-01-01T00:00:00.000Z`, mandateEndsAt: `${YEAR + 3}-12-31T00:00:00.000Z` };
    const putPlan = (h: Record<string, string>) => request(httpServer).put(`/api/v1/orgs/${orgId}/strategic-plan`).set(h).send(plan);
    const planA = await putPlan(hA);
    expect(planA.status).toBe(403);
    expect(planA.body.message).toMatch(FORBIDDEN);
    expect([200, 201], JSON.stringify((await putPlan(hC)).body)).toContain((await putPlan(hC)).status);
    const axisA = await request(httpServer).post(`/api/v1/orgs/${orgId}/strategic-plan/axes`).set(hA).send({ name: 'Eje' });
    expect(axisA.status).toBe(403);
    expect(axisA.body.message).toMatch(FORBIDDEN);
    const axisC = await request(httpServer).post(`/api/v1/orgs/${orgId}/strategic-plan/axes`).set(hC).send({ name: 'Eje' });
    expect(axisC.status, JSON.stringify(axisC.body)).toBe(201);
    expect((await request(httpServer).patch(`/api/v1/orgs/${orgId}/strategic-plan/axes/${axisC.body.id as string}`).set(hA).send({ name: 'Otro' })).status).toBe(403);
    expect((await request(httpServer).delete(`/api/v1/orgs/${orgId}/strategic-plan/axes/${axisC.body.id as string}`).set(hA)).status).toBe(403);

    const unitUrl = (id = '') => `/api/v1/orgs/${orgId}/org-units${id ? `/${id}` : ''}`;
    expect((await request(httpServer).post(unitUrl()).set(hA).send({ parentId: a, kind: 'area', name: 'Nueva' })).status).toBe(403);
    expect((await request(httpServer).patch(unitUrl(a)).set(hA).send({ name: 'Renombrada' })).status).toBe(403);
    expect((await request(httpServer).delete(unitUrl(a1)).set(hA)).status).toBe(403);
    // Visión y misión (N3) de la propia unidad y descendientes sí; hermana y ancestro no.
    expect((await request(httpServer).patch(unitUrl(a)).set(hA).send({ vision: 'v', mission: 'm' })).status).toBe(200);
    expect((await request(httpServer).patch(unitUrl(a1)).set(hA).send({ vision: 'v1' })).status).toBe(200);
    expect((await request(httpServer).patch(unitUrl(b)).set(hA).send({ vision: 'vb' })).status).toBe(403);
    expect((await request(httpServer).patch(unitUrl(m)).set(hA).send({ vision: 'vm' })).status).toBe(403);
    expect((await request(httpServer).patch(unitUrl(b)).set(hC).send({ name: 'B renombrada' })).status).toBe(200);

    // ── Escalada de alcance: el admin de A no otorga más de lo que tiene ──────
    const invite = (h: Record<string, string>, body: Record<string, unknown>) => request(httpServer).post(`/api/v1/orgs/${orgId}/members/invite`).set(h).send(body);
    const stamp = Date.now();
    expect((await invite(hA, { email: `n1-${stamp}@c19.test`, roleKey: 'org-reader', orgUnitId: a1 })).status).toBe(201);
    expect((await invite(hA, { email: `n2-${stamp}@c19.test`, roleKey: 'org-reader', orgUnitId: b })).status).toBe(403);
    expect((await invite(hA, { email: `n3-${stamp}@c19.test`, roleKey: 'org-reader', orgUnitId: null })).status).toBe(403); // null = toda la org
    const setScope = (h: Record<string, string>, userId: string, orgUnitId: string | null) =>
      request(httpServer).patch(`/api/v1/orgs/${orgId}/members/${userId}/scope`).set(h).send({ orgUnitId });
    expect((await setScope(hA, adminA, null)).status).toBe(403); // no se auto-promueve
    expect((await setScope(hC, userA, a1)).status).toBe(200);
    expect((await setScope(hC, userA, a)).status).toBe(200);

    // ── Aportes: alcance sobre la unidad del PROYECTO (relajado) ──────────────
    const feeds = await createIndicator(orgId, objM, {
      metric: { ...metricBody, name: 'Aportable', kind: 'output' },
      linkMode: 'execution_feeds_indicator',
    });
    expect(feeds.status, JSON.stringify(feeds.body)).toBe(201);
    const feedsUrl = `/api/v1/okr/indicators/${feeds.body.id as string}/contributions`;
    const projBinM = await createProject(orgId, objM, 'Proyecto de B dentro de M', b);
    const own = await request(httpServer).post(feedsUrl).set(hA).send({ projectId: projAinM.projectId, contributionValue: '3' });
    expect(own.status, JSON.stringify(own.body)).toBe(201); // proyecto de A, aunque el objetivo sea de M
    expect((await request(httpServer).patch(`/api/v1/okr/contributions/${own.body.id as string}`).set(hA).send({ contributionValue: '4' })).status).toBe(200);
    const otherProj = await request(httpServer).post(feedsUrl).set(hA).send({ projectId: projBinM.projectId, contributionValue: '3' });
    expect(otherProj.status).toBe(403);
    expect(otherProj.body.message).toMatch(FORBIDDEN);
    expect((await request(httpServer).delete(`/api/v1/okr/contributions/${own.body.id as string}`).set(hA)).status).toBe(204);

    // ── Metric (catálogo): misma regla que las cargas ─────────────────────────
    const mk = (h: Record<string, string>, name: string) =>
      request(httpServer).post(`/api/v1/orgs/${orgId}/metrics`).set(h).send({ ...metricBody, name, direction: 'increasing', baselineValue: '0', targetValue: '10' });
    const mkA = await mk(hA, 'Standalone de A');
    expect(mkA.status).toBe(403);
    expect(mkA.body.message).toMatch(FORBIDDEN);
    const mkC = await mk(hC, 'Standalone de C');
    expect(mkC.status).toBe(201);
    const patchMetric = (h: Record<string, string>, id: string) => request(httpServer).patch(`/api/v1/metrics/${id}`).set(h).send({ description: 'd' });
    expect((await patchMetric(hA, metricOnlyA)).status).toBe(200);
    expect((await patchMetric(hA, metricShared)).status).toBe(403); // usada por A y B
    expect((await patchMetric(hA, metricStandalone)).status).toBe(403); // sin objetivos: central
    expect((await request(httpServer).delete(`/api/v1/metrics/${mkC.body.id as string}`).set(hA)).status).toBe(403);
    expect((await patchMetric(hC, metricShared)).status).toBe(200);
    expect((await request(httpServer).delete(`/api/v1/metrics/${mkC.body.id as string}`).set(hC)).status).toBe(204);

    // ── Visión y misión: permiso fino + alcance ───────────────────────────────
    const vm = (h: Record<string, string>, id: string, body: Record<string, unknown>) =>
      request(httpServer).patch(`/api/v1/orgs/${orgId}/org-units/${id}/vision-mission`).set(h).send(body);
    expect((await vm(hUA, a, { vision: 'v', mission: 'm' })).status).toBe(200); // org-user con alcance A
    expect((await vm(hUA, a1, { mission: 'm1' })).status).toBe(200);
    const vmB = await vm(hUA, b, { vision: 'vb' });
    expect(vmB.status).toBe(403);
    expect(vmB.body.message).toMatch(FORBIDDEN);
    expect((await vm(hUA, m, { vision: 'vm' })).status).toBe(403);
    expect((await vm(hUA, a, { name: 'Estructura' })).status).toBe(400); // la estructura no entra por acá
    expect((await request(httpServer).patch(unitUrl(a)).set(hUA).send({ vision: 'v' })).status).toBe(403); // PATCH :id sigue pidiendo manage
    expect((await vm(asUser(readerA, orgId), a, { vision: 'v' })).status).toBe(403); // org-reader sin permiso (RBAC)
    expect((await vm(hC, b, { vision: 'vb' })).status).toBe(200);

    // ── Cambiar rol / quitar miembros: administrar el alcance actual ──────────
    const role = (h: Record<string, string>, userId: string, roleKey: string) =>
      request(httpServer).patch(`/api/v1/orgs/${orgId}/members/${userId}/role`).set(h).send({ roleKey });
    expect((await role(hA, adminCentral, 'org-reader')).status).toBe(403); // alcance null: solo central
    expect((await request(httpServer).delete(`/api/v1/orgs/${orgId}/members/${adminCentral}`).set(hA)).status).toBe(403);
    expect((await role(hA, readerA, 'org-user')).status).toBe(200); // miembro de su propia unidad
    expect((await role(hC, adminCentral, 'org-admin')).status).toBe(200);

    // ── Superadmin: todo ─────────────────────────────────────────────────────
    expect((await patch(orgHeaders(orgId), objB)).status).toBe(200);
    expect((await entry(orgHeaders(orgId), metricStandalone)).status).toBe(201);

    // ── Auditoría: las mutaciones permitidas dejaron eventos ─────────────────
    expect(await db.auditEvent.count({ where: { action: 'objective.updated', entityId: objA } })).toBeGreaterThan(0);
  });

  it('invitar: orgUnitId obligatorio (unidad o null explícito), validado contra la org', async () => {
    const a = await bootstrapOrg('invite-a');
    const b = await bootstrapOrg('invite-b');
    const unitA = await createUnit(a.orgId, a.centralId, 'ministry', 'Ministerio A');
    const unitB = await createUnit(b.orgId, b.centralId, 'ministry', 'Ministerio B');
    const stamp = Date.now();
    const inv = (orgId: string, body: Record<string, unknown>) => request(httpServer).post(`/api/v1/orgs/${orgId}/members/invite`).set(orgHeaders(orgId)).send(body);

    const withUnit = await inv(a.orgId, { email: `w-${stamp}@c19.test`, roleKey: 'org-user', orgUnitId: unitA });
    expect(withUnit.status).toBe(201);
    expect(withUnit.body.orgUnitId).toBe(unitA);
    const withoutUnit = await inv(a.orgId, { email: `wo-${stamp}@c19.test`, roleKey: 'org-user', orgUnitId: null });
    expect(withoutUnit.status).toBe(201);
    expect(withoutUnit.body.orgUnitId).toBeNull(); // null explícito = toda la org
    // La propiedad es obligatoria: omitirla es un 400, no se asume null.
    expect((await inv(a.orgId, { email: `om-${stamp}@c19.test`, roleKey: 'org-user' })).status).toBe(400);
    expect((await inv(a.orgId, { email: `x-${stamp}@c19.test`, roleKey: 'org-user', orgUnitId: unitB })).status).toBe(404); // unidad de otra org
    expect((await inv(a.orgId, { email: `y-${stamp}@c19.test`, roleKey: 'org-user', orgUnitId: 'no-existe' })).status).toBe(404);
    expect((await inv(a.orgId, { email: `z-${stamp}@c19.test`, roleKey: 'org-user', orgUnitId: '' })).status).toBe(400);
    expect(await db.auditEvent.count({ where: { action: 'user_organization_role.assigned', entityId: `${withUnit.body.userId as string}:${a.orgId}` } })).toBe(1);
  });

  it('aislamiento entre orgs: el alcance de una org no da acceso a otra', async () => {
    const a = await bootstrapOrg('iso-a');
    const b = await bootstrapOrg('iso-b');
    const unitA = await createUnit(a.orgId, a.centralId, 'ministry', 'Min A');
    const unitB = await createUnit(b.orgId, b.centralId, 'ministry', 'Min B');
    const objB = await createObjective(b.orgId, 'Objetivo de la org B', unitB);
    const adminA = await inviteMember(a.orgId, `iso-${Date.now()}@c19.test`, 'org-admin', unitA);

    // Con header de la org B no es miembro.
    const wrongOrg = await request(httpServer).patch(`/api/v1/okr/objectives/${objB}`).set(asUser(adminA, b.orgId)).send({ description: 'x' });
    expect(wrongOrg.status).toBe(403);
    // Con su propia org, el objetivo ajeno es indistinguible de uno inexistente.
    const crossRead = await request(httpServer).patch(`/api/v1/okr/objectives/${objB}`).set(asUser(adminA, a.orgId)).send({ description: 'x' });
    expect(crossRead.status).toBe(404);
    // Crear en una unidad de otra org: no existe para esta org (y el alcance de A no la cubre).
    const crossUnit = await request(httpServer).post('/api/v1/okr/objectives').set(asUser(adminA, a.orgId)).send({ title: 'Cruzado', orgUnitId: unitB });
    expect(crossUnit.status).toBe(403);
  });
});
