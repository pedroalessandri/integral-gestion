/**
 * Concurrency tests for the tenant-scoping extension with AsyncLocalStorage.
 *
 * These tests verify the critical "lazy provider" contract: the extension reads
 * `organizationId` and `isSuperadmin` at QUERY TIME by calling the provider
 * methods, which in turn read the ALS context of the currently executing async
 * task.
 *
 * WHY THESE TESTS MATTER:
 * If an implementation captured the orgId eagerly at extension construction
 * (e.g. `const orgId = provider.getOrganizationId()` outside the intercept
 * callback), all tests below would FAIL because:
 *   - The extension would read the orgId of the first ALS.run() that triggered
 *     construction, not the orgId of the ALS context currently executing.
 *   - Under parallel requests, every query would see the same (wrong) orgId.
 *
 * The lazy-call pattern is documented in ADR 0004 D6 as the critical design
 * invariant for multi-tenant concurrency safety.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, it, expect } from 'vitest';
import { interceptAllOperations } from '../src/extension.js';
import type { TenantContextProvider } from '../src/types.js';

// ---------------------------------------------------------------------------
// ALS setup
// ---------------------------------------------------------------------------

interface TenantContext {
  orgId: string;
  isSuperadmin: boolean;
}

const als = new AsyncLocalStorage<TenantContext>();

/**
 * Provider that reads from the ALS on every call.
 * This is the reference implementation pattern that `apps/api/src/modules/auth/`
 * will follow when wiring to `TenantContextStorage`.
 *
 * NOTE: The provider is instantiated OUTSIDE any ALS.run() to simulate the
 * `PrismaService` lifecycle where the extension is created once at app startup.
 * If the provider captured values at construction time, `als.getStore()` would
 * return `undefined` here and all tests would fail with MissingTenantContextError.
 */
const alsProvider: TenantContextProvider = {
  getOrganizationId: () => als.getStore()?.orgId ?? null,
  isSuperadmin: () => als.getStore()?.isSuperadmin ?? false,
};

// ---------------------------------------------------------------------------
// Helper — runs a single "query" inside the given ALS context and returns
// the organizationId that the extension injected.
// ---------------------------------------------------------------------------

async function runQuery(tenantId: string, delayMs = 0): Promise<string | undefined> {
  return als.run({ orgId: tenantId, isSuperadmin: false }, async () => {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    let observedOrgId: string | undefined;
    await interceptAllOperations(alsProvider, {
      model: 'Objective',
      operation: 'findMany',
      args: { where: {} },
      query: async (args) => {
        const where = args['where'] as Record<string, unknown>;
        observedOrgId = where['organizationId'] as string;
        return [];
      },
    });

    return observedOrgId;
  });
}

// ---------------------------------------------------------------------------
// Scenario 1: Straight interleaving
// Two ALS contexts interleaved with a microtask yield between operations.
// Each query must see its own orgId.
// ---------------------------------------------------------------------------

describe('Scenario 1 — straight interleaving', () => {
  it('interleaved ALS.run contexts see their own orgId', async () => {
    /**
     * Both "requests" start concurrently. Each yields to the event loop once
     * before hitting the query. If the intercept read orgId lazily per call,
     * each sees its own context. If it captured eagerly at some point outside
     * the ALS.run, both would see the same (wrong) value.
     */
    const [orgIdA, orgIdB] = await Promise.all([runQuery('tenant-A', 0), runQuery('tenant-B', 0)]);

    expect(orgIdA).toBe('tenant-A');
    expect(orgIdB).toBe('tenant-B');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Nested async work
// Deep await chain inside ALS.run — orgId must survive the awaits.
// ---------------------------------------------------------------------------

describe('Scenario 2 — nested async work', () => {
  it('orgId is correct after a deep await chain inside ALS.run', async () => {
    let observedOrgId: string | undefined;

    await als.run({ orgId: 'tenant-deep', isSuperadmin: false }, async () => {
      // Simulate a service method that does several awaits before hitting the DB.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      await interceptAllOperations(alsProvider, {
        model: 'KeyResult',
        operation: 'findFirst',
        args: { where: { id: 'kr-1' } },
        query: async (args) => {
          const where = args['where'] as Record<string, unknown>;
          observedOrgId = where['organizationId'] as string;
          return null;
        },
      });
    });

    expect(observedOrgId).toBe('tenant-deep');
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Promise.all parallel
// Multiple ALS.run contexts racing. Each must see its own orgId.
// ---------------------------------------------------------------------------

describe('Scenario 3 — Promise.all parallel', () => {
  it('parallel ALS.run contexts each see their own orgId (5 concurrent tenants)', async () => {
    const tenants = ['tenant-1', 'tenant-2', 'tenant-3', 'tenant-4', 'tenant-5'];

    const results = await Promise.all(
      tenants.map(async (tenantId) => {
        // Stagger slightly with random delay to ensure real interleaving
        const delay = Math.floor(Math.random() * 10);
        const observedOrgId = await runQuery(tenantId, delay);
        return { tenantId, observedOrgId };
      }),
    );

    for (const { tenantId, observedOrgId } of results) {
      expect(observedOrgId).toBe(tenantId);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Extension constructed outside any ALS context
// Confirms that construction-time capture would return null/undefined,
// proving that the lazy read is what makes things work.
// ---------------------------------------------------------------------------

describe('Scenario 4 — extension constructed outside ALS context', () => {
  /**
   * `alsProvider` and `interceptAllOperations` are module-level (created before
   * any ALS.run()). If `getOrganizationId()` were called at construction time,
   * `als.getStore()` would return `undefined`, and the provider would return `null`.
   *
   * The test verifies that queries AFTER construction still see the correct orgId
   * because the provider is called lazily at query time (inside ALS.run).
   */
  it('queries after construction still see the correct orgId from their own ALS context', async () => {
    let observedOrgId: string | undefined;

    await als.run({ orgId: 'post-construction-tenant', isSuperadmin: false }, async () => {
      await interceptAllOperations(alsProvider, {
        model: 'Objective',
        operation: 'create',
        args: { data: { title: 'test' } },
        query: async (args) => {
          const data = args['data'] as Record<string, unknown>;
          observedOrgId = data['organizationId'] as string;
          return {};
        },
      });
    });

    expect(observedOrgId).toBe('post-construction-tenant');
  });

  it('operations outside any ALS context throw MissingTenantContextError (not superadmin)', async () => {
    // This confirms the eager-capture failure mode: if orgId WERE captured at
    // module level, it would be undefined/null, and this behavior would silently
    // pass through instead of throwing — which would be a security bug.
    // With lazy reads, the provider correctly returns null outside ALS.run().
    await expect(
      interceptAllOperations(alsProvider, {
        model: 'Objective',
        operation: 'findMany',
        args: { where: {} },
        query: async () => [],
      }),
    ).rejects.toThrow('Tenant context missing for Objective.findMany');
  });
});
