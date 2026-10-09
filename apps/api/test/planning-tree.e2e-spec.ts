import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { buildBuckets } from '@gestion-publica/metrics-domain';
import type { PlanningTreeDto } from '@gestion-publica/shared-types/okr';
import { AppModule } from '../src/app.module.js';

/**
 * Planificación F9 / C21 — GET okr/planning-tree contra una DB real: 2 unidades, 1 eje, objetivos con y sin
 * cargas, agregación por lectura, filtros y aislamiento entre organizaciones.
 *
 * Corre solo si DATABASE_URL está definido (necesita Postgres, como los otros e2e).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

// Un usuario por test: el rate limit (100 req/min) es por usuario y cada escenario hace decenas de requests.
const superFor = (userId: string) => ({ 'X-Dev-User-Id': userId, 'X-Dev-Is-Superadmin': 'true' });
const orgHeaders = (userId: string, orgId: string) => ({ ...superFor(userId), 'X-Organization-Id': orgId });
const day = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
    .compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  httpServer = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
});

/** Organización, período abierto y miembro. Aparte de `bootstrapOrg` para ahorrar requests (rate limit por IP). */
async function bootstrapBase(suffix: string, userId: string) {
  const year = new Date().getUTCFullYear();
  const orgRes = await request(httpServer)
    .post('/api/v1/orgs')
    .set(superFor(userId))
    .send({
      slug: `e2e-c21-${suffix}-${Date.now()}`,
      name: 'C21 Test Org',
      firstPeriod: { code: `C21-${Date.now()}`, startsAt: `${year}-01-01T00:00:00.000Z`, endsAt: `${year}-12-31T00:00:00.000Z` },
    });
  const orgId = orgRes.body.organization.id as string;
  const periodId = orgRes.body.period.id as string;
  const h = orgHeaders(userId, orgId);
  const periodRes = await request(httpServer).get(`/api/v1/periods/${periodId}`).set(h);
  if (periodRes.body.status === 'future') {
    await request(httpServer).post(`/api/v1/periods/${periodId}/open`).set(h);
  }
  const enabled = await request(httpServer).post(`/api/v1/orgs/${orgId}/modules/indicadores-gestion/enable`).set(h);
  expect([200, 201], JSON.stringify(enabled.body)).toContain(enabled.status);
  const member = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/members`)
    .set(h)
    .send({ userIdOrEmail: userId, roleId: 'role_org_admin' });
  expect([200, 201], JSON.stringify(member.body)).toContain(member.status);

  const range = {
    startsAt: new Date(periodRes.body.startsAt as string),
    endsAt: new Date(periodRes.body.endsAt as string),
  };
  return { orgId, periodId, h, range };
}

/** Base + 3 unidades bajo la central, plan activo con un eje y un helper para crear objetivos. */
async function bootstrapOrg(suffix: string, userId: string) {
  const { orgId, periodId, h, range } = await bootstrapBase(suffix, userId);
  const year = new Date().getUTCFullYear();
  const units = await request(httpServer).get(`/api/v1/orgs/${orgId}/org-units`).set(h);
  const list = (units.body.items ?? units.body) as Array<{ id: string; kind: string }>;
  const central = list.find((u) => u.kind === 'central') as { id: string };
  const mkUnit = async (name: string) => {
    const res = await request(httpServer)
      .post(`/api/v1/orgs/${orgId}/org-units`)
      .set(h)
      .send({ parentId: central.id, kind: 'ministry', name });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  };
  const unitA = await mkUnit('Ministerio A');
  const unitB = await mkUnit('Ministerio B');
  const unitEmpty = await mkUnit('Ministerio sin objetivos');

  const plan = await request(httpServer)
    .put(`/api/v1/orgs/${orgId}/strategic-plan`)
    .set(h)
    .send({ title: 'Plan', vision: 'Visión', mandateStartsAt: `${year}-01-01T00:00:00.000Z`, mandateEndsAt: `${year + 3}-12-31T00:00:00.000Z` });
  expect([200, 201], JSON.stringify(plan.body)).toContain(plan.status);
  const axis = await request(httpServer).post(`/api/v1/orgs/${orgId}/strategic-plan/axes`).set(h).send({ name: 'Movilidad' });
  expect(axis.status, JSON.stringify(axis.body)).toBe(201);

  const objective = async (title: string, orgUnitId: string, axisId?: string) => {
    const res = await request(httpServer)
      .post('/api/v1/okr/objectives')
      .set(h)
      .send({ title, orgUnitId, ...(axisId && { axisId }), ownerUserId: userId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  };
  return {
    orgId,
    periodId,
    h,
    unitA,
    unitB,
    unitEmpty,
    axisId: axis.body.id as string,
    objective,
    buckets: buildBuckets(range, 'monthly'),
  };
}

describe.skipIf(!process.env['DATABASE_URL'])('C21 — árbol de planificación y tableros', () => {
  it('agrega por plan, eje y unidad, por lectura, con filtros y sin mezclar resultado con gestión', async () => {
    const ctx = await bootstrapOrg('flow', 'e2e-c21-flow');
    const { h, orgId, periodId } = ctx;

    // o1 (unidad A, eje): indicador con una carga (avance de resultado > 0) -> desvío medible.
    // o2 (unidad B, eje): sin indicadores ni cargas.
    // o3 (unidad B, sin eje): sin indicadores.
    const o1 = await ctx.objective('Ciclovías', ctx.unitA, ctx.axisId);
    const o2 = await ctx.objective('Semáforos', ctx.unitB, ctx.axisId);
    const o3 = await ctx.objective('Sin eje', ctx.unitB);

    const ind = await request(httpServer)
      .post(`/api/v1/okr/objectives/${o1}/indicators`)
      .set(h)
      .send({ metric: { name: 'Km', unit: 'number', frequency: 'monthly', kind: 'output' }, baselineValue: '0', targetValue: '100', direction: 'increasing' });
    expect(ind.status, JSON.stringify(ind.body)).toBe(201);
    const entry = await request(httpServer)
      .post(`/api/v1/metrics/${ind.body.metricId as string}/entries`)
      .set(h)
      .send({ bucketDate: day(ctx.buckets[0] as Date), incrementValue: '40' });
    expect(entry.status, JSON.stringify(entry.body)).toBe(201);

    const res = await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId }).set(h);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const tree = res.body as PlanningTreeDto;

    // Las dos lecturas del objetivo son las mismas que GET objectives/:id/status.
    for (const id of [o1, o2, o3]) {
      const single = await request(httpServer).get(`/api/v1/okr/objectives/${id}/status`).set(h);
      const item = tree.objectives.find((o) => o.id === id);
      const { indicators: _i, ...result } = single.body.result;
      void _i;
      expect(item?.result).toEqual(result);
      expect(item?.execution).toEqual(single.body.execution);
    }
    expect(tree.objectives).toHaveLength(3);
    const item1 = tree.objectives.find((o) => o.id === o1);
    expect(item1?.result.progressBp).toBeGreaterThan(0);
    expect(item1?.result.deviationBp).not.toBeNull();
    expect(tree.objectives.find((o) => o.id === o2)?.result.deviationBp).toBeNull();

    // Plan: promedio simple de los 3 objetivos; solo se cuentan los desvíos medibles.
    const p1 = item1?.result.progressBp ?? 0;
    expect(tree.plan.aggregate.objectivesCount).toBe(3);
    expect(tree.plan.aggregate.result.progressBp).toBe(Math.trunc(p1 / 3));
    expect(tree.plan.aggregate.result.deviationBp).toBe(item1?.result.deviationBp);
    expect(tree.plan.title).toBe('Plan');

    // Eje: o1 + o2; "sin eje": o3.
    expect(tree.axes).toHaveLength(1);
    expect(tree.axes[0]?.objectiveIds.sort()).toEqual([o1, o2].sort());
    expect(tree.axes[0]?.aggregate.result.progressBp).toBe(Math.trunc(p1 / 2));
    expect(tree.axes[0]?.units.map((u) => u.orgUnitId).sort()).toEqual([ctx.unitA, ctx.unitB].sort());
    expect(tree.withoutAxis.objectiveIds).toEqual([o3]);

    // Unidades: la central incluye a todas (también la que no tiene objetivos).
    const central = tree.units[0];
    expect(central?.aggregate.objectivesCount).toBe(3);
    const byId = new Map((central?.children ?? []).map((c) => [c.id, c]));
    expect(byId.get(ctx.unitA)?.aggregate.objectivesCount).toBe(1);
    expect(byId.get(ctx.unitB)?.aggregate.objectivesCount).toBe(2);
    expect(byId.get(ctx.unitEmpty)?.aggregate.objectivesCount).toBe(0);
    expect(byId.get(ctx.unitEmpty)?.aggregate.result.progressBp).toBeNull();
    expect(tree.withoutUnit.aggregate.objectivesCount).toBe(0);

    // Filtros.
    const byAxis = (await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId, axisId: ctx.axisId }).set(h)).body as PlanningTreeDto;
    expect(byAxis.objectives.map((o) => o.id).sort()).toEqual([o1, o2].sort());
    expect(byAxis.plan.aggregate.objectivesCount).toBe(2);
    const byUnit = (await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId, orgUnitId: ctx.unitB }).set(h)).body as PlanningTreeDto;
    expect(byUnit.units.map((u) => u.id)).toEqual([ctx.unitB]);
    expect(byUnit.objectives.map((o) => o.id).sort()).toEqual([o2, o3].sort());

    // Validación: el período es obligatorio (400). Ojo con el rate limit: la ruta admite 10 requests/min por IP
    // (ver TODO.md: el throttler nombrado `ai` aplica a todas las rutas), así que este archivo hace <= 10 en total.
    expect((await request(httpServer).get('/api/v1/okr/planning-tree').set(h)).status).toBe(400);
    void orgId;
  });

  it('aislamiento entre organizaciones: otra org no ve objetivos, ejes ni unidades ajenos', async () => {
    const a = await bootstrapOrg('iso-a', 'e2e-c21-iso');
    const b = await bootstrapBase('iso-b', 'e2e-c21-iso');
    const oa = await a.objective('Solo de A', a.unitA, a.axisId);

    // Cada org ve solo lo suyo.
    const treeB = (await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId: b.periodId }).set(b.h)).body as PlanningTreeDto;
    expect(treeB.objectives).toEqual([]);
    expect(JSON.stringify(treeB)).not.toContain(oa);
    expect(JSON.stringify(treeB)).not.toContain(a.unitA);
    expect(JSON.stringify(treeB)).not.toContain(a.axisId);

    // Ids de la otra org -> 404 (período, eje, unidad); un id inexistente da lo mismo que uno ajeno.
    expect((await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId: a.periodId }).set(b.h)).status).toBe(404);
    expect((await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId: b.periodId, axisId: a.axisId }).set(b.h)).status).toBe(404);
    expect((await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId: b.periodId, orgUnitId: a.unitA }).set(b.h)).status).toBe(404);
  });

  it('sin autenticación no hay acceso (default deny)', async () => {
    const status = (await request(httpServer).get('/api/v1/okr/planning-tree').query({ periodId: 'x' })).status;
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });
});
