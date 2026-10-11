import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { ThrottlerStorage } from '@nestjs/throttler';
import { AppModule } from '../src/app.module.js';

/**
 * ADR-0011 — sector de la organización (terminología). DB real.
 * Corre solo si DATABASE_URL está definido.
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;
let db: PrismaClient;

const SUPER = { 'X-Dev-User-Id': 'e2e-superadmin-sector', 'X-Dev-Is-Superadmin': 'true' };
const orgHeaders = (orgId: string) => ({ ...SUPER, 'X-Organization-Id': orgId });
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

async function createOrg(suffix: string, sector?: string) {
  const res = await request(httpServer)
    .post('/api/v1/orgs')
    .set(SUPER)
    .send({
      slug: `e2e-sector-${suffix}-${Date.now()}`,
      name: `Sector ${suffix}`,
      ...(sector !== undefined && { sector }),
      firstPeriod: { code: `S-${suffix}-${Date.now()}`, startsAt: `${YEAR}-01-01T00:00:00.000Z`, endsAt: `${YEAR}-12-31T00:00:00.000Z` },
    });
  return res;
}

describe.skipIf(!process.env['DATABASE_URL'])('ADR-0011 — sector de la organización', () => {
  it('POST /orgs: sin sector queda public; con private/nonprofit lo respeta y lo audita; inválido da 400', async () => {
    const def = await createOrg('def');
    expect(def.status, JSON.stringify(def.body)).toBe(201);
    expect(def.body.organization.sector).toBe('public');

    for (const sector of ['private', 'nonprofit'] as const) {
      const res = await createOrg(sector, sector);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body.organization.sector).toBe(sector);
      const evt = await db.auditEvent.findFirst({
        where: { action: 'organization.created', entityId: res.body.organization.id as string },
      });
      expect((evt?.diff as { after: { sector: string } }).after.sector).toBe(sector);
    }

    expect((await createOrg('bad', 'ngo')).status).toBe(400);
  });

  it('PATCH /orgs/:id/sector: superadmin cambia y audita before/after; mismo valor no audita; inválido 400', async () => {
    const created = await createOrg('patch');
    const id = created.body.organization.id as string;

    for (const sector of ['private', 'nonprofit'] as const) {
      const res = await request(httpServer).patch(`/api/v1/orgs/${id}/sector`).set(SUPER).send({ sector });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.sector).toBe(sector);
    }
    const events = await db.auditEvent.findMany({
      where: { action: 'organization.sector_changed', entityId: id },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.diff)).toEqual([
      { before: { sector: 'public' }, after: { sector: 'private' } },
      { before: { sector: 'private' }, after: { sector: 'nonprofit' } },
    ]);

    const same = await request(httpServer).patch(`/api/v1/orgs/${id}/sector`).set(SUPER).send({ sector: 'nonprofit' });
    expect(same.status).toBe(200);
    expect(await db.auditEvent.count({ where: { action: 'organization.sector_changed', entityId: id } })).toBe(2);

    expect((await request(httpServer).patch(`/api/v1/orgs/${id}/sector`).set(SUPER).send({ sector: 'ngo' })).status).toBe(400);
    expect((await request(httpServer).patch('/api/v1/orgs/no-existe/sector').set(SUPER).send({ sector: 'private' })).status).toBe(404);
  });

  it('PATCH /orgs/:id/sector: el org-admin recibe 403; PATCH /orgs/:id ignora sector', async () => {
    const created = await createOrg('admin');
    const id = created.body.organization.id as string;
    const adminId = `e2e-sector-admin-${Date.now()}`;
    await request(httpServer).get('/api/v1/me').set({ 'X-Dev-User-Id': adminId }); // alta lazy del usuario
    const member = await request(httpServer)
      .post(`/api/v1/orgs/${id}/members`)
      .set(orgHeaders(id))
      .send({ userIdOrEmail: adminId, roleId: 'role_org_admin' });
    expect([200, 201], JSON.stringify(member.body)).toContain(member.status);
    const admin = { 'X-Dev-User-Id': adminId, 'X-Organization-Id': id };

    const denied = await request(httpServer).patch(`/api/v1/orgs/${id}/sector`).set(admin).send({ sector: 'private' });
    expect(denied.status).toBe(403);

    const patch = await request(httpServer).patch(`/api/v1/orgs/${id}`).set(admin).send({ name: 'Nuevo nombre', sector: 'private' });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect(patch.body.sector).toBe('public');
    expect((await db.organization.findUnique({ where: { id } }))?.sector).toBe('public');
  });

  it('GET /me devuelve el sector por org (miembro y superadmin) y GET /orgs/:id lo incluye', async () => {
    const created = await createOrg('me', 'private');
    const id = created.body.organization.id as string;
    const userId = `e2e-sector-me-${Date.now()}`;
    await request(httpServer).get('/api/v1/me').set({ 'X-Dev-User-Id': userId }); // alta lazy del usuario
    await request(httpServer).post(`/api/v1/orgs/${id}/members`).set(orgHeaders(id)).send({ userIdOrEmail: userId, roleId: 'role_org_admin' });

    const member = await request(httpServer).get('/api/v1/me').set({ 'X-Dev-User-Id': userId });
    expect(member.status).toBe(200);
    expect(member.body.orgs[0].sector).toBe('private');

    const sup = await request(httpServer).get('/api/v1/me').set(SUPER);
    const found = (sup.body.orgs as Array<{ id: string; sector: string }>).find((o) => o.id === id);
    expect(found?.sector).toBe('private');

    const detail = await request(httpServer).get(`/api/v1/orgs/${id}`).set(orgHeaders(id));
    expect(detail.body.sector).toBe('private');
  });

  it('la migración: las orgs existentes quedan public y el CHECK rechaza un cuarto valor', async () => {
    expect(await db.organization.count({ where: { sector: { notIn: ['public', 'private', 'nonprofit'] } } })).toBe(0);
    await expect(
      db.$executeRawUnsafe(`UPDATE "core"."organization" SET "sector" = 'ngo' WHERE "slug" = 'demo'`),
    ).rejects.toThrow();
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO "core"."organization" ("id","slug","name","sector","updated_at") VALUES ('x-chk','x-chk','x','ngo', now())`,
      ),
    ).rejects.toThrow();
  });
});
