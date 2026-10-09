import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import type { PlanningGanttDto } from '@gestion-publica/shared-types/okr';
import { AppModule } from '../src/app.module.js';

/**
 * Planificación F9 / C22 — GET okr/planning-gantt contra una DB real: 2 objetivos (uno sin proyectos), proyectos
 * con tareas, filtros por eje y unidad, período por defecto y aislamiento entre organizaciones.
 *
 * Corre solo si DATABASE_URL está definido (necesita Postgres, como los otros e2e).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const superFor = (userId: string) => ({ 'X-Dev-User-Id': userId, 'X-Dev-Is-Superadmin': 'true' });
const orgHeaders = (userId: string, orgId: string) => ({ ...superFor(userId), 'X-Organization-Id': orgId });

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  httpServer = app.getHttpServer();
});

afterAll(async () => {
  await app?.close();
});

async function bootstrapOrg(suffix: string, userId: string, withStructure: boolean) {
  const year = new Date().getUTCFullYear();
  const orgRes = await request(httpServer)
    .post('/api/v1/orgs')
    .set(superFor(userId))
    .send({
      slug: `e2e-c22-${suffix}-${Date.now()}`,
      name: 'C22 Test Org',
      firstPeriod: {
        code: `C22-${Date.now()}`,
        startsAt: `${year}-01-01T00:00:00.000Z`,
        endsAt: `${year}-12-31T00:00:00.000Z`,
      },
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
  if (!withStructure) return { orgId, periodId, h, year };

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
  const plan = await request(httpServer)
    .put(`/api/v1/orgs/${orgId}/strategic-plan`)
    .set(h)
    .send({
      title: 'Plan',
      vision: 'Visión',
      mandateStartsAt: `${year}-01-01T00:00:00.000Z`,
      mandateEndsAt: `${year + 3}-12-31T00:00:00.000Z`,
    });
  expect([200, 201], JSON.stringify(plan.body)).toContain(plan.status);
  const axis = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/strategic-plan/axes`)
    .set(h)
    .send({ name: 'Movilidad' });
  expect(axis.status, JSON.stringify(axis.body)).toBe(201);

  const objective = async (title: string, orgUnitId: string, axisId?: string) => {
    const res = await request(httpServer)
      .post('/api/v1/okr/objectives')
      .set(h)
      .send({ title, orgUnitId, ...(axisId && { axisId }), ownerUserId: userId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.id as string;
  };
  return { orgId, periodId, h, year, unitA, unitB, axisId: axis.body.id as string, objective };
}

describe.skipIf(!process.env['DATABASE_URL'])('C22 — Gantt Objetivo -> Proyecto -> Tarea', () => {
  it('lista objetivos con proyectos y tareas, dos lecturas separadas, fechas derivadas, filtros y período por defecto', async () => {
    const ctx = await bootstrapOrg('flow', 'e2e-c22-flow', true);
    const { h, year, periodId } = ctx;
    const o1 = await ctx.objective!('Ciclovías', ctx.unitA!, ctx.axisId);
    const o2 = await ctx.objective!('Sin proyectos', ctx.unitB!);

    const mkProject = async (title: string, startsAt: string, endsAt: string) => {
      const res = await request(httpServer)
        .post(`/api/v1/okr/objectives/${o1}/projects`)
        .set(h)
        .send({ title, startsAt, endsAt });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body.id as string;
    };
    const p1 = await mkProject('Anillo verde', `${year}-02-01T00:00:00.000Z`, `${year}-06-30T00:00:00.000Z`);
    await mkProject('Ciclovía Av. Y', `${year}-04-01T00:00:00.000Z`, `${year}-10-31T00:00:00.000Z`);
    const task = await request(httpServer)
      .post(`/api/v1/okr/projects/${p1}/tasks`)
      .set(h)
      .send({ title: 'Relevamiento', startsAt: `${year}-02-02T00:00:00.000Z`, endsAt: `${year}-03-01T00:00:00.000Z` });
    expect(task.status, JSON.stringify(task.body)).toBe(201);
    const prog = await request(httpServer)
      .put(`/api/v1/okr/tasks/${task.body.id as string}/progress`)
      .set(h)
      .send({ progressBp: 10000 });
    expect(prog.status, JSON.stringify(prog.body)).toBe(200);

    const res = await request(httpServer).get('/api/v1/okr/planning-gantt').query({ periodId }).set(h);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const gantt = res.body as PlanningGanttDto;
    expect(gantt.periodId).toBe(periodId);
    expect(gantt.objectives.map((o) => o.id).sort()).toEqual([o1, o2].sort());

    const a = gantt.objectives.find((o) => o.id === o1)!;
    expect(a).toMatchObject({
      orgUnitId: ctx.unitA,
      orgUnitName: 'Ministerio A',
      axisId: ctx.axisId,
      axisName: 'Movilidad',
      startsAt: `${year}-02-01T00:00:00.000Z`,
      endsAt: `${year}-10-31T00:00:00.000Z`,
    });
    expect(a.projects.map((p) => p.title)).toEqual(['Anillo verde', 'Ciclovía Av. Y']);
    const proj1 = a.projects[0]!;
    expect(proj1).toMatchObject({ progressBp: 10000, progressMode: 'from_tasks', orgUnitName: 'Ministerio A' });
    expect(proj1.tasks).toHaveLength(1);
    expect(proj1.tasks[0]).toMatchObject({ title: 'Relevamiento', progressBp: 10000, status: 'done' });
    expect(a.projects[1]?.tasks).toEqual([]);

    // Las dos lecturas son las de GET objectives/:id/status y no hay número combinado.
    const single = await request(httpServer).get(`/api/v1/okr/objectives/${o1}/status`).set(h);
    expect(a.execution).toEqual(single.body.execution);
    const { indicators: _i, ...result } = single.body.result;
    void _i;
    expect(a.result).toEqual(result);
    expect(a.execution.progressBp).toBeGreaterThan(0);
    expect(a).not.toHaveProperty('progressBp');

    // Objetivo sin proyectos: incluido, fechas null.
    const b = gantt.objectives.find((o) => o.id === o2)!;
    expect(b).toMatchObject({ startsAt: null, endsAt: null, projects: [], axisId: null });

    // Filtros.
    const byAxis = (await request(httpServer).get('/api/v1/okr/planning-gantt').query({ axisId: ctx.axisId }).set(h))
      .body as PlanningGanttDto;
    expect(byAxis.objectives.map((o) => o.id)).toEqual([o1]);
    const byUnit = (await request(httpServer).get('/api/v1/okr/planning-gantt').query({ orgUnitId: ctx.unitB }).set(h))
      .body as PlanningGanttDto;
    expect(byUnit.objectives.map((o) => o.id)).toEqual([o2]);

    // Sin periodId: el período abierto.
    const byDefault = await request(httpServer).get('/api/v1/okr/planning-gantt').set(h);
    expect(byDefault.status).toBe(200);
    expect((byDefault.body as PlanningGanttDto).periodId).toBe(periodId);
  });

  it('aislamiento entre organizaciones y default deny', async () => {
    const a = await bootstrapOrg('iso-a', 'e2e-c22-iso', true);
    const b = await bootstrapOrg('iso-b', 'e2e-c22-iso', false);
    const oa = await a.objective!('Solo de A', a.unitA!, a.axisId);
    const pr = await request(httpServer)
      .post(`/api/v1/okr/objectives/${oa}/projects`)
      .set(a.h)
      .send({ title: 'Proyecto de A', startsAt: `${a.year}-02-01T00:00:00.000Z`, endsAt: `${a.year}-03-01T00:00:00.000Z` });
    expect(pr.status, JSON.stringify(pr.body)).toBe(201);

    const ganttB = await request(httpServer).get('/api/v1/okr/planning-gantt').query({ periodId: b.periodId }).set(b.h);
    expect(ganttB.status).toBe(200);
    expect((ganttB.body as PlanningGanttDto).objectives).toEqual([]);
    expect(JSON.stringify(ganttB.body)).not.toContain(oa);
    expect(JSON.stringify(ganttB.body)).not.toContain('Proyecto de A');

    // Ids de la otra org -> 404 (período, eje, unidad).
    for (const query of [{ periodId: a.periodId }, { axisId: a.axisId }, { orgUnitId: a.unitA }]) {
      const res = await request(httpServer).get('/api/v1/okr/planning-gantt').query(query).set(b.h);
      expect(res.status, JSON.stringify(query)).toBe(404);
    }

    // Sin credenciales: no hay ruta pública.
    const denied = (await request(httpServer).get('/api/v1/okr/planning-gantt')).status;
    expect(denied).toBeGreaterThanOrEqual(400);
    expect(denied).toBeLessThan(500);
  });
});
