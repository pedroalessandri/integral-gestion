import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuditEventEmitterService } from '../src/modules/audit/index.js';

/**
 * Bootstrap superadmin e2e tests (D5).
 *
 * These tests verify the bootstrap superadmin logic behavior:
 * 1. When CORE_BOOTSTRAP_SUPERADMIN_EMAIL is set and email matches + no superadmin
 *    exists → promote and emit event.
 * 2. When a superadmin already exists → skip (idempotent).
 *
 * Note: Since the e2e DB may already have superadmins from previous test runs,
 * test 1 validates the mechanism works (may skip if superadmin exists).
 * Test 2 always verifies idempotency by calling upsert twice with the same user.
 */

let app: INestApplication;
let httpServer: ReturnType<INestApplication['getHttpServer']>;
let auditEmitSpy: ReturnType<typeof vi.spyOn>;

const runId = Date.now();
const bootstrapEmail = `e2e-bootstrap-${runId}@example.com`;
const bootstrapSub = `e2e-bootstrap-sub-${runId}`;

beforeAll(async () => {
  process.env['CORE_BOOTSTRAP_SUPERADMIN_EMAIL'] = bootstrapEmail;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  httpServer = app.getHttpServer();

  const auditEmitter = app.get(AuditEventEmitterService);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auditEmitSpy = vi.spyOn(auditEmitter as any, 'emit');
});

afterAll(async () => {
  delete process.env['CORE_BOOTSTRAP_SUPERADMIN_EMAIL'];
  await app?.close();
});

describe.skipIf(!process.env['DATABASE_URL'])('Bootstrap superadmin (D5)', () => {
  it('server health is OK and bootstrap email is configured', async () => {
    const healthRes = await request(httpServer).get('/api/v1/health');
    expect(healthRes.status).toBe(200);
    // Verify bootstrap email is configured in the running app
    expect(process.env['CORE_BOOTSTRAP_SUPERADMIN_EMAIL']).toBe(bootstrapEmail);
  });

  it('upsertFromJwt with bootstrap email: promotes if no superadmin exists, or is a no-op if one does', async () => {
    const { UserSyncService } = await import('../src/modules/core/index.js');
    const userSyncService = app.get(UserSyncService);
    const { PrismaService } = await import('../src/modules/auth/index.js');
    const prismaService = app.get(PrismaService);

    auditEmitSpy.mockClear();

    // Check if any superadmin already exists
    const existingSuperadmin = await prismaService.raw.user.findFirst({
      where: { isSuperadmin: true },
    });

    const user = await userSyncService.upsertFromJwt({
      auth0_sub: bootstrapSub,
      email: bootstrapEmail,
      name: 'Bootstrap Admin',
    });

    if (!existingSuperadmin) {
      // No superadmin existed → bootstrap should have fired
      expect(user.isSuperadmin).toBe(true);
      const grantedCall = auditEmitSpy.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.action === 'user.superadmin_granted',
      );
      expect(grantedCall).toBeDefined();
      expect(grantedCall?.[0]?.diff?.reason).toBe('bootstrap');
    } else {
      // Superadmin already existed → bootstrap skipped, no emit
      const grantedCalls = auditEmitSpy.mock.calls.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any[]) => call[0]?.action === 'user.superadmin_granted',
      );
      expect(grantedCalls.length).toBe(0);
    }
  });

  it('second upsert of same user does not emit user.superadmin_granted again', async () => {
    const { UserSyncService } = await import('../src/modules/core/index.js');
    const userSyncService = app.get(UserSyncService);

    auditEmitSpy.mockClear();

    // Second call with the same auth0_sub (same user logging in again)
    await userSyncService.upsertFromJwt({
      auth0_sub: bootstrapSub,
      email: bootstrapEmail,
      name: 'Bootstrap Admin Second Login',
    });

    // Superadmin exists now (either from first test or previous run) → no new grant
    const superadminGrantedCalls = auditEmitSpy.mock.calls.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (call: any[]) => call[0]?.action === 'user.superadmin_granted',
    );
    expect(superadminGrantedCalls.length).toBe(0);
  });
});
