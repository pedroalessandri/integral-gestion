import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PROJECT_COMPLETED, PROJECT_REOPENED } from '@gestion-publica/shared-types/okr';
import { AppModule } from '../src/app.module.js';
import { ThrottlerStorage } from '@nestjs/throttler';

/**
 * Planificación F7 / C17 — aportes de proyectos a indicadores, contra una DB real (sin mockear la cascada):
 * ida y vuelta "el proyecto llega al 100 % -> carga automática +X y el avance del indicador se mueve; baja del
 * 100 % -> carga compensatoria −X" (RN-P12, RN-P13, RN-P14), idempotencia del oyente, curva `from_projects`,
 * vínculos vigentes y aislamiento entre organizaciones.
 *
 * Corre solo si DATABASE_URL está definido (necesita Postgres, como los otros e2e).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;
let db: PrismaClient;

const SUPER = { 'X-Dev-User-Id': 'e2e-superadmin-c17', 'X-Dev-Is-Superadmin': 'true' };
const orgHeaders = (orgId: string) => ({ ...SUPER, 'X-Organization-Id': orgId });
const YEAR = new Date().getUTCFullYear();
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);

beforeAll(async () => {
  // Muchas requests por test: el throttler global (100/min por usuario) devolvería 429, y no es lo que se prueba acá.
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
      slug: `e2e-c17-${suffix}-${Date.now()}`,
      name: 'C17 Test Org',
      firstPeriod: { code: `C17-${Date.now()}`, startsAt: `${YEAR}-01-01T00:00:00.000Z`, endsAt: `${YEAR}-12-31T00:00:00.000Z` },
    });
  expect(orgRes.status, JSON.stringify(orgRes.body)).toBe(201);
  const orgId = orgRes.body.organization.id as string;
  const periodId = orgRes.body.period.id as string;
  const periodRes = await request(httpServer).get(`/api/v1/periods/${periodId}`).set(orgHeaders(orgId));
  if (periodRes.body.status === 'future') await request(httpServer).post(`/api/v1/periods/${periodId}/open`).set(orgHeaders(orgId));
  const enabled = await request(httpServer).post(`/api/v1/orgs/${orgId}/modules/indicadores-gestion/enable`).set(orgHeaders(orgId));
  expect([200, 201], JSON.stringify(enabled.body)).toContain(enabled.status);
  const member = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/members`)
    .set(orgHeaders(orgId))
    .send({ userIdOrEmail: 'e2e-superadmin-c17', roleId: 'role_org_admin' });
  expect([200, 201], JSON.stringify(member.body)).toContain(member.status);
  return { orgId };
}

async function createObjective(orgId: string, title: string): Promise<string> {
  const h = orgHeaders(orgId);
  const units = await request(httpServer).get(`/api/v1/orgs/${orgId}/org-units`).set(h);
  const list = (units.body.items ?? units.body) as Array<{ id: string; kind: string }>;
  const central = list.find((u) => u.kind === 'central');
  const unit = await request(httpServer).post(`/api/v1/orgs/${orgId}/org-units`).set(h).send({ parentId: central?.id, kind: 'ministry', name: 'Secretaría de Movilidad' });
  expect(unit.status).toBe(201);
  const obj = await request(httpServer).post('/api/v1/okr/objectives').set(h).send({ title, orgUnitId: unit.body.id as string, ownerUserId: 'e2e-superadmin-c17' });
  expect(obj.status, JSON.stringify(obj.body)).toBe(201);
  return obj.body.id as string;
}

/** Proyecto con una única tarea (que lo completa o no al 0/100 %). Devuelve ids. */
async function createProject(orgId: string, objectiveId: string, title: string, endsAt: string) {
  const h = orgHeaders(orgId);
  const proj = await request(httpServer)
    .post(`/api/v1/okr/objectives/${objectiveId}/projects`)
    .set(h)
    .send({ title, startsAt: `${YEAR}-01-05T00:00:00.000Z`, endsAt });
  expect(proj.status, JSON.stringify(proj.body)).toBe(201);
  const task = await request(httpServer)
    .post(`/api/v1/okr/projects/${proj.body.id as string}/tasks`)
    .set(h)
    .send({ title: `Tarea de ${title}`, startsAt: `${YEAR}-01-06T00:00:00.000Z`, endsAt });
  expect(task.status, JSON.stringify(task.body)).toBe(201);
  return { projectId: proj.body.id as string, taskId: task.body.id as string };
}

const setProgress = (orgId: string, taskId: string, progressBp: number) =>
  request(httpServer).put(`/api/v1/okr/tasks/${taskId}/progress`).set(orgHeaders(orgId)).send({ progressBp });

async function entries(orgId: string, metricId: string) {
  const res = await request(httpServer).get(`/api/v1/metrics/${metricId}/entries`).set(orgHeaders(orgId));
  expect(res.status).toBe(200);
  return res.body.items as Array<{
    id: string;
    bucketDate: string;
    incrementValue: string;
    cumulativeAfter: string;
    comment: string | null;
    origin: string;
    sourceProjectId: string | null;
  }>;
}

const auditCount = (action: string, entityId: string) => db.auditEvent.count({ where: { action, entityId } });

describe.skipIf(!process.env['DATABASE_URL'])('C17 — aportes de proyectos a indicadores', () => {
  it('ida y vuelta: 100 % -> +X y avance del indicador; baja -> compensatorio; idempotencia; curva from_projects', async () => {
    const { orgId } = await bootstrapOrg('flow');
    const h = orgHeaders(orgId);
    const objectiveId = await createObjective(orgId, 'Movilidad');

    // Indicador output (km de ciclovía) base 5 -> meta 35, vinculado a la gestión, con curva from_projects.
    const created = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objectiveId}/indicators`)
      .set(h)
      .send({
        metric: { name: 'Km de ciclovía', unit: 'number', frequency: 'monthly', kind: 'output' },
        baselineValue: '5',
        targetValue: '35',
        direction: 'increasing',
        linkMode: 'execution_feeds_indicator',
        expectedCurveMode: 'from_projects',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const indicatorId = created.body.id as string;
    const metricId = created.body.metricId as string;
    expect(created.body).toMatchObject({ expectedCurveMode: 'from_projects', linkMode: 'execution_feeds_indicator' });

    const avY = await createProject(orgId, objectiveId, 'Ciclovía Av. Y', `${YEAR}-02-28T00:00:00.000Z`);

    // ── Validaciones 422 / 409 / 400 ──────────────────────────────────────────
    const bad = (body: Record<string, unknown>) => request(httpServer).post(`/api/v1/okr/indicators/${indicatorId}/contributions`).set(h).send(body);
    expect((await bad({ projectId: avY.projectId, contributionValue: '0' })).status).toBe(400);
    expect((await bad({ projectId: avY.projectId, contributionValue: 'mucho' })).status).toBe(400);
    const ghost = await bad({ projectId: 'no-existe', contributionValue: '4' });
    expect(ghost.status).toBe(422);
    expect(ghost.body.message).toMatch(/ContributionProjectNotFound/);

    // ── Alta del aporte (+4 km) ───────────────────────────────────────────────
    const contribution = await bad({ projectId: avY.projectId, contributionValue: '4' });
    expect(contribution.status, JSON.stringify(contribution.body)).toBe(201);
    expect(contribution.body).toMatchObject({ projectTitle: 'Ciclovía Av. Y', contributionValue: '4', applied: false, projectProgressBp: 0 });
    const contributionId = contribution.body.id as string;
    expect((await bad({ projectId: avY.projectId, contributionValue: '5' })).status).toBe(409);
    expect(await auditCount('project_contribution.created', contributionId)).toBe(1);

    // Sin cargas todavía; el aporte no alcanza la meta (5 + 4 < 35) y la curva escalonada sube en el endsAt.
    expect(await entries(orgId, metricId)).toHaveLength(0);
    const before = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/status`).set(h);
    expect(before.body.contributions).toEqual({ count: 1, total: '4', projectedValue: '9', coversTarget: false });

    // ── El proyecto llega al 100 %: carga automática +4 ───────────────────────
    expect((await setProgress(orgId, avY.taskId, 10000)).status).toBe(200);
    let list = await entries(orgId, metricId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      incrementValue: '4',
      cumulativeAfter: '9',
      comment: 'Aporte automático — Proyecto Ciclovía Av. Y',
      origin: 'project_contribution',
      sourceProjectId: avY.projectId,
      bucketDate: `${monthStart(new Date())}T00:00:00.000Z`,
    });
    // El avance del indicador se movió: (9 - 5) / (35 - 5) = 13,33 % -> 1333 bp, y llegó al objetivo.
    const indicator = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}`).set(h);
    expect(indicator.body).toMatchObject({ progressCachedBp: 1333, lastValue: '9', hasData: true });
    const objStatus = await request(httpServer).get(`/api/v1/okr/objectives/${objectiveId}/status`).set(h);
    expect(objStatus.body.result.progressBp).toBe(1333);
    // La gestión es otra lectura: el proyecto está completo (100 %), sin mezclarse con el resultado.
    expect(objStatus.body.execution.progressBp).toBe(10000);

    const applied = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/contributions`).set(h);
    expect(applied.body.items[0]).toMatchObject({ applied: true, projectProgressBp: 10000, appliedEntryId: list[0]?.id });
    expect(await auditCount('project_contribution.applied', contributionId)).toBe(1);
    expect(await auditCount('metric.entry.created', list[0]?.id as string)).toBe(1);

    // Un aporte aplicado no se edita ni se borra; la carga automática es de solo lectura; la manual sigue permitida.
    const edit = await request(httpServer).patch(`/api/v1/okr/contributions/${contributionId}`).set(h).send({ contributionValue: '6' });
    expect(edit.status).toBe(422);
    expect(edit.body.message).toMatch(/ContributionAlreadyApplied/);
    expect((await request(httpServer).delete(`/api/v1/okr/contributions/${contributionId}`).set(h)).status).toBe(422);
    const editEntry = await request(httpServer).patch(`/api/v1/metrics/${metricId}/entries/${list[0]?.id as string}`).set(h).send({ incrementValue: '99' });
    expect(editEntry.status).toBe(422);
    expect(editEntry.body.message).toMatch(/AutomaticEntryReadOnly/);
    expect((await request(httpServer).delete(`/api/v1/metrics/${metricId}/entries/${list[0]?.id as string}`).set(h)).status).toBe(422);
    const manual = await request(httpServer)
      .post(`/api/v1/metrics/${metricId}/entries`)
      .set(h)
      .send({ bucketDate: `${YEAR}-01-01`, incrementValue: '1' });
    expect(manual.status, JSON.stringify(manual.body)).toBe(201);
    expect(manual.body).toMatchObject({ origin: 'manual', sourceProjectId: null });

    // ── Idempotencia: repetir el evento (y la reconciliación) no duplica la carga ──
    const bus = app.get(EventEmitter2);
    const payload = {
      organizationId: orgId,
      actorId: 'e2e-superadmin-c17',
      requestId: randomUUID(),
      projectId: avY.projectId,
      projectTitle: 'Ciclovía Av. Y',
      objectiveId,
      occurredAt: new Date().toISOString(),
    };
    await bus.emitAsync(PROJECT_COMPLETED, payload);
    await bus.emitAsync(PROJECT_COMPLETED, payload);
    expect((await entries(orgId, metricId)).filter((e) => e.origin === 'project_contribution')).toHaveLength(1);

    // ── Baja del 100 %: carga compensatoria −4 (la original queda) ────────────
    expect((await setProgress(orgId, avY.taskId, 5000)).status).toBe(200);
    list = await entries(orgId, metricId);
    const auto = list.filter((e) => e.origin === 'project_contribution');
    expect(auto.map((e) => e.incrementValue)).toEqual(['4', '-4']);
    expect(auto[1]?.comment).toMatch(/^Aporte revertido — Proyecto Ciclovía Av\. Y/);
    const back = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}`).set(h);
    // 5 (base) + 1 (manual) + 4 − 4 = 6 -> (6 - 5) / 30 = 3,33 % -> 333 bp.
    expect(back.body).toMatchObject({ lastValue: '6', progressCachedBp: 333 });
    expect((await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/contributions`).set(h)).body.items[0]).toMatchObject({
      applied: false,
      appliedEntryId: null,
    });
    await bus.emitAsync(PROJECT_REOPENED, { ...payload, reason: 'progress_dropped' });
    expect((await entries(orgId, metricId)).filter((e) => e.origin === 'project_contribution')).toHaveLength(2);
    expect(await auditCount('project_contribution.reverted', contributionId)).toBe(1);

    // Vuelve a completarse: de nuevo +4 (neto +4, tres cargas automáticas en total).
    expect((await setProgress(orgId, avY.taskId, 10000)).status).toBe(200);
    expect((await entries(orgId, metricId)).filter((e) => e.origin === 'project_contribution').map((e) => e.incrementValue)).toEqual(['4', '-4', '4']);

    // ── Curva from_projects: el esperado sube en el endsAt planificado del proyecto ──
    // Segundo proyecto (sin cerrar) con el aporte que falta para llegar a la meta (26 km), cierra a fin de año.
    const parque = await createProject(orgId, objectiveId, 'Anillo verde', `${YEAR}-12-15T00:00:00.000Z`);
    const second = await bad({ projectId: parque.projectId, contributionValue: '26' });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    const status = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/status`).set(h);
    expect(status.body.expectedCurveMode).toBe('from_projects');
    expect(status.body.contributions).toEqual({ count: 2, total: '30', projectedValue: '35', coversTarget: true });
    // Última carga manual del 1/ene: esperado = base (el primer paso es 28/feb).
    expect(Number(status.body.expectedValue)).toBeGreaterThanOrEqual(5);

    // ── Vínculos vigentes (ADR-0009 D5 regla 3) y RN-P12 ──────────────────────
    const unlink = await request(httpServer).patch(`/api/v1/okr/indicators/${indicatorId}`).set(h).send({ linkMode: 'independent', expectedCurveMode: 'linear' });
    expect(unlink.status).toBe(422);
    expect(unlink.body.message).toMatch(/IndicatorHasLinkedProjects/);
    expect((unlink.body.details.projects as Array<{ title: string }>).map((p) => p.title).sort()).toEqual(['Anillo verde', 'Ciclovía Av. Y']);
    const delIndicator = await request(httpServer).delete(`/api/v1/okr/indicators/${indicatorId}`).set(h);
    expect(delIndicator.status).toBe(422);
    const kind = await request(httpServer).patch(`/api/v1/metrics/${metricId}`).set(h).send({ kind: 'outcome' });
    expect(kind.status).toBe(422);
    expect(kind.body.message).toMatch(/MetricKindChangeBlocked/);

    // ── Borrar el proyecto completo: compensa y da de baja el aporte ──────────
    const del = await request(httpServer).delete(`/api/v1/okr/projects/${avY.projectId}`).set(h);
    expect(del.status).toBe(200);
    const afterDelete = await entries(orgId, metricId);
    expect(afterDelete.filter((e) => e.origin === 'project_contribution').map((e) => e.incrementValue)).toEqual(['4', '-4', '4', '-4']);
    const remaining = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/contributions`).set(h);
    expect(remaining.body.items.map((i: { projectTitle: string }) => i.projectTitle)).toEqual(['Anillo verde']);
    expect(await auditCount('project_contribution.deleted', contributionId)).toBe(1);

    // El aporte sin aplicar sí se edita y se borra; con eso el indicador se puede desvincular.
    const secondId = second.body.id as string;
    expect((await request(httpServer).patch(`/api/v1/okr/contributions/${secondId}`).set(h).send({ contributionValue: '10.5' })).body.contributionValue).toBe('10.5');
    expect((await request(httpServer).delete(`/api/v1/okr/contributions/${secondId}`).set(h)).status).toBe(204);
    const ok = await request(httpServer).patch(`/api/v1/okr/indicators/${indicatorId}`).set(h).send({ linkMode: 'independent', expectedCurveMode: 'linear' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it('proyecto que ya está al 100 % al crear el aporte: se aplica enseguida; contribuciones inválidas por tipo y vínculo', async () => {
    const { orgId } = await bootstrapOrg('late');
    const h = orgHeaders(orgId);
    const objectiveId = await createObjective(orgId, 'Espacios verdes');
    const ind = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objectiveId}/indicators`)
      .set(h)
      .send({
        metric: { name: 'Espacios verdes', unit: 'number', frequency: 'monthly', kind: 'output' },
        baselineValue: '10',
        targetValue: '30',
        direction: 'increasing',
        linkMode: 'execution_feeds_indicator',
      });
    expect(ind.status).toBe(201);
    const indicatorId = ind.body.id as string;

    const done = await createProject(orgId, objectiveId, 'Espacio verde X', `${YEAR}-03-31T00:00:00.000Z`);
    expect((await setProgress(orgId, done.taskId, 10000)).status).toBe(200);
    expect(await entries(orgId, ind.body.metricId as string)).toHaveLength(0); // sin aporte, nada que aplicar

    const res = await request(httpServer).post(`/api/v1/okr/indicators/${indicatorId}/contributions`).set(h).send({ projectId: done.projectId, contributionValue: '1' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ applied: true, projectProgressBp: 10000 });
    expect(await entries(orgId, ind.body.metricId as string)).toMatchObject([{ incrementValue: '1', origin: 'project_contribution' }]);

    // Indicador outcome / independiente / otro objetivo.
    const outcome = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objectiveId}/indicators`)
      .set(h)
      .send({ metric: { name: 'Calidad percibida', unit: 'number', frequency: 'monthly', kind: 'outcome' }, baselineValue: '0', targetValue: '10', direction: 'increasing' });
    expect(outcome.status).toBe(201);
    const onOutcome = await request(httpServer).post(`/api/v1/okr/indicators/${outcome.body.id as string}/contributions`).set(h).send({ projectId: done.projectId, contributionValue: '1' });
    expect(onOutcome.status).toBe(422);
    expect(onOutcome.body.message).toMatch(/ContributionRequiresOutputMetric/);
    const linkOutcome = await request(httpServer).patch(`/api/v1/okr/indicators/${outcome.body.id as string}`).set(h).send({ linkMode: 'execution_feeds_indicator' });
    expect(linkOutcome.status).toBe(422);
    const fp = await request(httpServer).patch(`/api/v1/okr/indicators/${outcome.body.id as string}`).set(h).send({ expectedCurveMode: 'from_projects' });
    expect(fp.status).toBe(422);
    expect(fp.body.message).toMatch(/ExpectedCurveModeNotAvailable/);

    const other = await createObjective(orgId, 'Otro objetivo');
    const foreign = await createProject(orgId, other, 'Proyecto ajeno', `${YEAR}-03-31T00:00:00.000Z`);
    const mismatch = await request(httpServer).post(`/api/v1/okr/indicators/${indicatorId}/contributions`).set(h).send({ projectId: foreign.projectId, contributionValue: '1' });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.message).toMatch(/ContributionProjectObjectiveMismatch/);
  });

  it('aislamiento entre organizaciones: ni lectura, ni escritura, ni cargas cruzadas; default deny', async () => {
    const a = await bootstrapOrg('iso-a');
    const b = await bootstrapOrg('iso-b');
    const objA = await createObjective(a.orgId, 'Objetivo A');
    const ind = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objA}/indicators`)
      .set(orgHeaders(a.orgId))
      .send({
        metric: { name: 'Km A', unit: 'number', frequency: 'monthly', kind: 'output' },
        baselineValue: '0',
        targetValue: '10',
        direction: 'increasing',
        linkMode: 'execution_feeds_indicator',
      });
    const projA = await createProject(a.orgId, objA, 'Proyecto A', `${YEAR}-03-31T00:00:00.000Z`);
    const contribution = await request(httpServer)
      .post(`/api/v1/okr/indicators/${ind.body.id as string}/contributions`)
      .set(orgHeaders(a.orgId))
      .send({ projectId: projA.projectId, contributionValue: '3' });
    expect(contribution.status).toBe(201);
    const contributionId = contribution.body.id as string;

    const hb = orgHeaders(b.orgId);
    // Org B no ve ni toca los recursos de A.
    expect((await request(httpServer).get(`/api/v1/okr/indicators/${ind.body.id as string}/contributions`).set(hb)).status).toBe(404);
    expect((await request(httpServer).get(`/api/v1/okr/projects/${projA.projectId}/contributions`).set(hb)).status).toBe(404);
    expect((await request(httpServer).patch(`/api/v1/okr/contributions/${contributionId}`).set(hb).send({ contributionValue: '9' })).status).toBe(404);
    expect((await request(httpServer).delete(`/api/v1/okr/contributions/${contributionId}`).set(hb)).status).toBe(404);
    // Ni crear un aporte en un indicador propio apuntando a un proyecto de A.
    const objB = await createObjective(b.orgId, 'Objetivo B');
    const indB = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objB}/indicators`)
      .set(hb)
      .send({ metric: { name: 'Km B', unit: 'number', frequency: 'monthly', kind: 'output' }, baselineValue: '0', targetValue: '10', direction: 'increasing', linkMode: 'execution_feeds_indicator' });
    const cross = await request(httpServer).post(`/api/v1/okr/indicators/${indB.body.id as string}/contributions`).set(hb).send({ projectId: projA.projectId, contributionValue: '3' });
    expect(cross.status).toBe(422);
    expect(cross.body.message).toMatch(/ContributionProjectNotFound/);

    // Completar el proyecto de A no genera cargas en B, y A sí recibe la suya.
    expect((await setProgress(a.orgId, projA.taskId, 10000)).status).toBe(200);
    expect(await entries(b.orgId, indB.body.metricId as string)).toHaveLength(0);
    expect(await entries(a.orgId, ind.body.metricId as string)).toHaveLength(1);
    expect(await db.metricEntry.count({ where: { organizationId: b.orgId, origin: 'project_contribution' } })).toBe(0);

    // Default deny: sin autenticación (ni contexto de organización) no hay acceso a ninguna ruta nueva.
    const denied = [
      () => request(httpServer).get(`/api/v1/okr/indicators/${ind.body.id as string}/contributions`),
      () => request(httpServer).get(`/api/v1/okr/projects/${projA.projectId}/contributions`),
      () => request(httpServer).post(`/api/v1/okr/indicators/${ind.body.id as string}/contributions`).send({ projectId: projA.projectId, contributionValue: '3' }),
      () => request(httpServer).patch(`/api/v1/okr/contributions/${contributionId}`).send({ contributionValue: '9' }),
      () => request(httpServer).delete(`/api/v1/okr/contributions/${contributionId}`),
    ];
    for (const pending of denied) {
      const status = (await pending()).status;
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
    // Y no cambió nada.
    expect(await db.projectContribution.count({ where: { id: contributionId, contributionValue: 3 } })).toBe(1);
  });
});

