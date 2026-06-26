import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';

/**
 * Reproduction + regression guard for the invite → first-login reconciliation bug.
 *
 * Scenario (no Auth0 needed — we call the sync service directly, bypassing the guard):
 *  1. An admin invites a new email. MemberService.inviteByEmail creates a placeholder
 *     core.user with auth0Sub = "pending:<email>".
 *  2. That person logs in for the first time. The AuthGuard calls
 *     UserSyncService.upsertFromJwt with their REAL Auth0 sub and the same email.
 *
 * Pre-fix, step 2 keyed the upsert purely on auth0_sub: the real sub didn't match the
 * placeholder, so it tried to CREATE a second row with the same (unique) email →
 * P2002 → mapped to HTTP 409 by the global filter. Because this runs in the guard, it
 * broke EVERY endpoint for that user (/me, /modules, ...).
 *
 * Test 1 reproduces that exact collision. Test 2 proves the fix claims the placeholder.
 */

let app: INestApplication;

const runId = Date.now();
const email = `repro-reconcile-${runId}@example.com`;
const placeholderSub = `pending:${email}`;
const realSub = `auth0|repro-real-${runId}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaService: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let userSyncService: any;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  await app.init();

  const { PrismaService } = await import('../src/modules/auth/index.js');
  prismaService = app.get(PrismaService);
  const { UserSyncService } = await import('../src/modules/core/index.js');
  userSyncService = app.get(UserSyncService);

  // Step 1 — seed the invite placeholder exactly as MemberService.inviteByEmail does.
  await prismaService.raw.user.deleteMany({ where: { email } });
  await prismaService.raw.user.create({
    data: {
      auth0Sub: placeholderSub,
      email,
      displayName: email,
      isSuperadmin: false,
    },
  });
});

afterAll(async () => {
  await prismaService?.raw.user.deleteMany({ where: { email } });
  await app?.close();
});

describe.skipIf(!process.env['DATABASE_URL'])('invite → first-login reconciliation', () => {
  it('reproduces the pre-fix collision: upsert keyed by sub hits the unique email (P2002 → 409)', async () => {
    // This is verbatim what the pre-fix upsertFromJwt did. The placeholder occupies the
    // email, so the create branch collides. P2002 is what the filter turns into a 409.
    await expect(
      prismaService.raw.user.upsert({
        where: { auth0Sub: realSub },
        create: {
          auth0Sub: realSub,
          email,
          displayName: email,
          isSuperadmin: false,
          lastSeenAt: new Date(),
        },
        update: { email, displayName: email, lastSeenAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('the fix: first login claims the placeholder by email and binds the real sub', async () => {
    const synced = await userSyncService.upsertFromJwt({
      auth0_sub: realSub,
      email,
      name: 'Repro User',
    });

    // Same logical user, now bound to the real Auth0 sub.
    expect(synced.email).toBe(email);
    expect(synced.auth0Sub).toBe(realSub);

    // Crucially: NO duplicate row — exactly one user for this email, placeholder claimed.
    const rows = await prismaService.raw.user.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0].auth0Sub).toBe(realSub);
  });
});
