import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Integration test for the audit.event append-only trigger.
 *
 * Connects directly to the local DB via PrismaClient (no NestJS bootstrap).
 * Verifies that:
 *  1. INSERT into audit.event succeeds.
 *  2. UPDATE on audit.event is blocked by the trigger.
 *  3. DELETE on audit.event is blocked by the trigger.
 *
 * Requires DATABASE_URL to be set and reachable with applied migrations.
 * The trigger name is audit_event_append_only (see migration).
 *
 * Note: inserted rows are intentionally left in the DB after the test run
 * (the trigger blocks DELETE and raw SQL through Prisma.$executeRaw also goes
 * through the trigger). The row carries a distinctive requestId for identification.
 */

const prisma = new PrismaClient();

let insertedId: string | undefined;
let existingUserId: string | undefined;

beforeAll(async () => {
  // Get any existing core.user.id to use as actorId
  const result = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM core."user" LIMIT 1
  `;
  existingUserId = result[0]?.id ?? 'test-actor-fallback-id';
});

describe.skipIf(!process.env['DATABASE_URL'])('audit.event append-only trigger', () => {
  it('Test 1 — INSERT into audit.event succeeds', async () => {
    const created = await prisma.auditEvent.create({
      data: {
        actorId: existingUserId ?? 'test-actor-fallback-id',
        organizationId: null,
        entityType: 'core.organization',
        entityId: 'trigger-test-entity-1',
        action: 'organization.created',
        diff: { before: null, after: { slug: 'trigger-test', name: 'Trigger Test', status: 'active' } },
        requestId: '00000000-0000-0000-0000-000000000001',
      },
    });

    expect(created.id).toBeDefined();
    expect(created.action).toBe('organization.created');
    insertedId = created.id;
  });

  it('Test 2 — UPDATE is blocked by the append-only trigger', async () => {
    expect(insertedId).toBeDefined();

    await expect(
      prisma.$executeRaw`
        UPDATE audit.event
        SET action = 'organization.updated'
        WHERE id = ${insertedId}
      `,
    ).rejects.toThrow(/append-only/i);
  });

  it('Test 3 — DELETE is blocked by the append-only trigger', async () => {
    expect(insertedId).toBeDefined();

    await expect(
      prisma.$executeRaw`
        DELETE FROM audit.event
        WHERE id = ${insertedId}
      `,
    ).rejects.toThrow(/append-only/i);
  });
});
