import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { buildBuckets } from '@gestion-publica/metrics-domain';
import { AppModule } from '../src/app.module.js';

/**
 * Planificación F6 / C15 — curvas esperadas, desvío, semáforo y buckets vencidos (RN-P9, RN-P15, RN-P17),
 * contra una DB real. Flujo: indicador mensual -> puntos de curva manual (validación del último punto == meta,
 * 422 para `from_projects`) -> modo manual -> carga -> estado del indicador -> estado del objetivo con las dos
 * lecturas separadas. También aislamiento entre organizaciones.
 *
 * Corre solo si DATABASE_URL está definido (necesita Postgres, como los otros e2e).
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;

const SUPER = { 'X-Dev-User-Id': 'e2e-superadmin-c15', 'X-Dev-Is-Superadmin': 'true' };
const orgHeaders = (orgId: string) => ({ ...SUPER, 'X-Organization-Id': orgId });
const day = (d: Date) => d.toISOString().slice(0, 10);

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

async function bootstrapOrg(suffix: string) {
  const year = new Date().getUTCFullYear();
  const orgRes = await request(httpServer)
    .post('/api/v1/orgs')
    .set(SUPER)
    .send({
      slug: `e2e-c15-${suffix}-${Date.now()}`,
      name: 'C15 Test Org',
      // Período anual que contiene a "hoy" (queda abierto).
      firstPeriod: { code: `C15-${Date.now()}`, startsAt: `${year}-01-01T00:00:00.000Z`, endsAt: `${year}-12-31T00:00:00.000Z` },
    });
  const orgId = orgRes.body.organization.id as string;
  const periodId = orgRes.body.period.id as string;
  const periodRes = await request(httpServer).get(`/api/v1/periods/${periodId}`).set(SUPER);
  if (periodRes.body.status === 'future') {
    await request(httpServer).post(`/api/v1/periods/${periodId}/open`).set(SUPER);
  }
  const enabled = await request(httpServer).post(`/api/v1/orgs/${orgId}/modules/indicadores-gestion/enable`).set(orgHeaders(orgId));
  expect([200, 201], JSON.stringify(enabled.body)).toContain(enabled.status);
  // El responsable del objetivo (por defecto el usuario actual) debe ser miembro de la org.
  const member = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/members`)
    .set(orgHeaders(orgId))
    .send({ userIdOrEmail: 'e2e-superadmin-c15', roleId: 'role_org_admin' });
  expect([200, 201], JSON.stringify(member.body)).toContain(member.status);
  const range = {
    startsAt: new Date(periodRes.body.startsAt as string),
    endsAt: new Date(periodRes.body.endsAt as string),
  };
  return { orgId, range, buckets: buildBuckets(range, 'monthly') };
}

/** RN-P3: el objetivo cuelga de una unidad `ministry`/`area`; se crea una bajo la central. */
async function createObjective(orgId: string, title: string): Promise<string> {
  const h = orgHeaders(orgId);
  const units = await request(httpServer).get(`/api/v1/orgs/${orgId}/org-units`).set(h);
  const list = (units.body.items ?? units.body) as Array<{ id: string; kind: string }>;
  const central = list.find((u) => u.kind === 'central');
  const unit = await request(httpServer)
    .post(`/api/v1/orgs/${orgId}/org-units`)
    .set(h)
    .send({ parentId: central?.id, kind: 'ministry', name: 'Secretaría de Movilidad' });
  expect(unit.status).toBe(201);
  const obj = await request(httpServer)
    .post('/api/v1/okr/objectives')
    .set(h)
    .send({ title, orgUnitId: unit.body.id as string, ownerUserId: 'e2e-superadmin-c15' });
  expect(obj.status, JSON.stringify(obj.body)).toBe(201);
  return obj.body.id as string;
}

describe.skipIf(!process.env['DATABASE_URL'])('C15 — curvas, desvío y semáforo', () => {
  it('curva manual: validación, modo, estado del indicador y del objetivo', async () => {
    const { orgId, range, buckets } = await bootstrapOrg('flow');
    const h = orgHeaders(orgId);
    const b = (i: number) => day(buckets[i] as Date);

    const objectiveId = await createObjective(orgId, 'Movilidad');

    // Indicador lineal con métrica inline mensual, base 0 -> meta 100.
    const created = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objectiveId}/indicators`)
      .set(h)
      .send({
        metric: { name: 'Km de ciclovía', unit: 'number', frequency: 'monthly', kind: 'output' },
        baselineValue: '0',
        targetValue: '100',
        direction: 'increasing',
      });
    expect(created.status).toBe(201);
    expect(created.body.expectedCurveMode).toBe('linear');
    const indicatorId = created.body.id as string;

    // from_projects: 422 tipado (no hay aportes todavía).
    const fp = await request(httpServer).patch(`/api/v1/okr/indicators/${indicatorId}`).set(h).send({ expectedCurveMode: 'from_projects' });
    expect(fp.status).toBe(422);
    expect(fp.body.message).toMatch(/ExpectedCurveModeNotAvailable/);

    // manual sin puntos: 422.
    const noPoints = await request(httpServer).patch(`/api/v1/okr/indicators/${indicatorId}`).set(h).send({ expectedCurveMode: 'manual' });
    expect(noPoints.status).toBe(422);

    // El último punto debe ser la meta; la fecha debe ser inicio de bucket.
    const badLast = await request(httpServer)
      .put(`/api/v1/okr/indicators/${indicatorId}/target-points`)
      .set(h)
      .send({ points: [{ bucketDate: b(5), expectedValue: '90' }] });
    expect(badLast.status).toBe(422);
    expect(badLast.body.message).toMatch(/igual a la meta/);
    const badDate = await request(httpServer)
      .put(`/api/v1/okr/indicators/${indicatorId}/target-points`)
      .set(h)
      .send({ points: [{ bucketDate: '2000-01-02', expectedValue: '100' }] });
    expect(badDate.status).toBe(422);
    const badShape = await request(httpServer)
      .put(`/api/v1/okr/indicators/${indicatorId}/target-points`)
      .set(h)
      .send({ points: [{ bucketDate: 'ayer', expectedValue: '100' }] });
    expect(badShape.status).toBe(400);

    // Puntos válidos: la mitad del período en 50, y la meta al final. Después, modo manual.
    const points = [
      { bucketDate: b(5), expectedValue: '50' },
      { bucketDate: b(buckets.length - 1), expectedValue: '100' },
    ];
    const put = await request(httpServer).put(`/api/v1/okr/indicators/${indicatorId}/target-points`).set(h).send({ points });
    expect(put.status).toBe(200);
    expect(put.body.items).toEqual(points);
    const get = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/target-points`).set(h);
    expect(get.body.items).toEqual(points);
    const patch = await request(httpServer).patch(`/api/v1/okr/indicators/${indicatorId}`).set(h).send({ expectedCurveMode: 'manual' });
    expect(patch.status).toBe(200);
    expect(patch.body.expectedCurveMode).toBe('manual');

    // Cambiar la meta sin ajustar los puntos: 422.
    const retarget = await request(httpServer).patch(`/api/v1/okr/indicators/${indicatorId}`).set(h).send({ targetValue: '120' });
    expect(retarget.status).toBe(422);

    // Sin datos: sin desvío ni semáforo.
    const empty = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/status`).set(h);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ hasData: false, deviationBp: null, semaphore: null, expectedCurveMode: 'manual' });

    // Una carga de 30 en el bucket 5: esperado 50 -> desvío -20 puntos -> amarillo.
    const entry = await request(httpServer)
      .post(`/api/v1/metrics/${created.body.metricId as string}/entries`)
      .set(h)
      .send({ bucketDate: b(5), incrementValue: '30' });
    expect(entry.status, JSON.stringify(entry.body)).toBe(201);
    const status = await request(httpServer).get(`/api/v1/okr/indicators/${indicatorId}/status`).set(h);
    expect(status.body).toMatchObject({
      hasData: true,
      asOf: b(5),
      actualValue: '30',
      expectedValue: '50',
      deviationBp: -2000,
      semaphore: 'yellow',
      graceDays: 10,
    });
    expect(Array.isArray(status.body.pendingBuckets)).toBe(true);
    // Un bucket cargado nunca figura como pendiente.
    expect(status.body.pendingBuckets).not.toContain(b(5));

    // Objetivo: las dos lecturas separadas.
    const objStatus = await request(httpServer).get(`/api/v1/okr/objectives/${objectiveId}/status`).set(h);
    expect(objStatus.status).toBe(200);
    expect(Object.keys(objStatus.body).sort()).toEqual(['asOf', 'execution', 'objectiveId', 'result']);
    expect(objStatus.body.result).toMatchObject({ deviationBp: -2000, semaphore: 'yellow' });
    expect(objStatus.body.result.indicators).toHaveLength(1);
    expect(objStatus.body.execution).toMatchObject({ progressBp: 0, plannedBp: 0, deviationBp: 0, semaphore: 'green' });

    // Gestión: un proyecto cuyas fechas ya pasaron (planificado 100 %) con una tarea al 0 %.
    const proj = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objectiveId}/projects`)
      .set(h)
      .send({ title: 'Obra', startsAt: range.startsAt.toISOString(), endsAt: range.startsAt.toISOString() });
    if (proj.status === 201) {
      const task = await request(httpServer)
        .post(`/api/v1/okr/projects/${proj.body.id as string}/tasks`)
        .set(h)
        .send({ title: 'Tramo 1', startsAt: range.startsAt.toISOString(), endsAt: range.startsAt.toISOString() });
      expect(task.status).toBe(201);
      const after = await request(httpServer).get(`/api/v1/okr/objectives/${objectiveId}/status`).set(h);
      expect(after.body.execution).toEqual({ progressBp: 0, plannedBp: 10000, deviationBp: -10000, semaphore: 'red' });
      // La lectura de resultado no se movió por la gestión.
      expect(after.body.result.deviationBp).toBe(-2000);
    }
  });

  it('aislamiento entre organizaciones: otra org no ve el estado ni los puntos (404)', async () => {
    const a = await bootstrapOrg('iso-a');
    const b = await bootstrapOrg('iso-b');
    const objectiveId = await createObjective(a.orgId, 'A');
    const created = await request(httpServer)
      .post(`/api/v1/okr/objectives/${objectiveId}/indicators`)
      .set(orgHeaders(a.orgId))
      .send({
        metric: { name: 'M', unit: 'number', frequency: 'monthly', kind: 'output' },
        targetValue: '10',
        direction: 'increasing',
      });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const hb = orgHeaders(b.orgId);
    expect((await request(httpServer).get(`/api/v1/okr/indicators/${id}/status`).set(hb)).status).toBe(404);
    expect((await request(httpServer).get(`/api/v1/okr/indicators/${id}/target-points`).set(hb)).status).toBe(404);
    expect(
      (
        await request(httpServer)
          .put(`/api/v1/okr/indicators/${id}/target-points`)
          .set(hb)
          .send({ points: [{ bucketDate: day(b.buckets[0] as Date), expectedValue: '10' }] })
      ).status,
    ).toBe(404);
    expect((await request(httpServer).get(`/api/v1/okr/objectives/${objectiveId}/status`).set(hb)).status).toBe(404);
  });

  it('sin autenticación no hay acceso (default deny)', async () => {
    for (const path of ['/api/v1/okr/indicators/x/status', '/api/v1/okr/objectives/x/status']) {
      const status = (await request(httpServer).get(path)).status;
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
  });
});
