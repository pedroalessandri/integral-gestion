/**
 * Unit tests for the tenant-scoping Prisma extension.
 *
 * Strategy: we do NOT instantiate a real PrismaClient. Instead, we call
 * `interceptAllOperations()` directly with hand-rolled mock `query` functions.
 * This lets us verify injection logic without a DB or a real Prisma extension
 * object.
 *
 * `tenantExtension()` is a thin wrapper that passes the same function to
 * `Prisma.defineExtension`. The extension integration (wired to a live
 * PrismaClient against a real DB) is deferred to `apps/api/test/`
 * (testcontainers), per the implementation plan in ADR 0004 D6.
 */

import { describe, it, expect, vi } from 'vitest';
import { interceptAllOperations } from '../src/extension.js';
import { MissingTenantContextError } from '../src/errors.js';
import type { TenantContextProvider, AllOperationsParams } from '../src/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(orgId: string | null, superadmin = false): TenantContextProvider {
  return {
    getOrganizationId: () => orgId,
    isSuperadmin: () => superadmin,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockQuery(captured: { args?: Record<string, any> } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vi.fn(async (args: Record<string, any>) => {
    captured.args = args;
    return { _result: true };
  });
}

function callIntercept(
  provider: TenantContextProvider,
  params: Omit<AllOperationsParams, 'query'> & { query?: AllOperationsParams['query'] },
) {
  const query = params.query ?? mockQuery();
  return interceptAllOperations(provider, { ...params, query } as AllOperationsParams);
}

// ---------------------------------------------------------------------------
// Read operations — where injection
// ---------------------------------------------------------------------------

describe('read operations inject into args.where', () => {
  const ops = ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy'] as const;

  for (const operation of ops) {
    it(`${operation} on Objective injects organizationId into where`, async () => {
      const captured: { args?: Record<string, unknown> } = {};
      const query = mockQuery(captured);

      await interceptAllOperations(makeProvider('org-A'), {
        model: 'Objective',
        operation,
        args: { where: { title: 'x' } },
        query,
      });

      expect(captured.args?.['where']).toEqual({ title: 'x', organizationId: 'org-A' });
      expect(query).toHaveBeenCalledOnce();
    });
  }
});

// ---------------------------------------------------------------------------
// create — data injection
// ---------------------------------------------------------------------------

describe('create operation injects into args.data', () => {
  it('create on Task injects organizationId into data', async () => {
    const captured: { args?: Record<string, unknown> } = {};
    const query = mockQuery(captured);

    await interceptAllOperations(makeProvider('org-A'), {
      model: 'Task',
      operation: 'create',
      args: { data: { title: 'my task' } },
      query,
    });

    expect(captured.args?.['data']).toEqual({ title: 'my task', organizationId: 'org-A' });
  });

  it('create on KeyResult injects organizationId', async () => {
    const captured: { args?: Record<string, unknown> } = {};
    const query = mockQuery(captured);

    await interceptAllOperations(makeProvider('org-B'), {
      model: 'KeyResult',
      operation: 'create',
      args: { data: { title: 'kr-1' } },
      query,
    });

    expect(captured.args?.['data']).toMatchObject({ organizationId: 'org-B' });
  });
});

// ---------------------------------------------------------------------------
// update / updateMany / delete / deleteMany — where injection
// ---------------------------------------------------------------------------

describe('mutation operations inject into args.where', () => {
  const ops = ['update', 'updateMany', 'delete', 'deleteMany'] as const;

  for (const operation of ops) {
    it(`${operation} on Objective injects organizationId into where`, async () => {
      const captured: { args?: Record<string, unknown> } = {};
      const query = mockQuery(captured);

      await interceptAllOperations(makeProvider('org-A'), {
        model: 'Objective',
        operation,
        args: { where: { id: '1' } },
        query,
      });

      expect(captured.args?.['where']).toEqual({ id: '1', organizationId: 'org-A' });
    });
  }
});

// ---------------------------------------------------------------------------
// upsert — where + create injection
// ---------------------------------------------------------------------------

describe('upsert operation', () => {
  it('injects organizationId into both where and create', async () => {
    const captured: { args?: Record<string, unknown> } = {};
    const query = mockQuery(captured);

    await interceptAllOperations(makeProvider('org-A'), {
      model: 'Period',
      operation: 'upsert',
      args: {
        where: { id: 'p-1' },
        create: { name: 'Q1' },
        update: { name: 'Q1 updated' },
      },
      query,
    });

    expect(captured.args?.['where']).toEqual({ id: 'p-1', organizationId: 'org-A' });
    expect(captured.args?.['create']).toEqual({ name: 'Q1', organizationId: 'org-A' });
    // update payload must be untouched
    expect(captured.args?.['update']).toEqual({ name: 'Q1 updated' });
  });

  it('throws when update payload contains organizationId (tenancy change)', async () => {
    await expect(
      interceptAllOperations(makeProvider('org-A'), {
        model: 'Period',
        operation: 'upsert',
        args: {
          where: { id: 'p-1' },
          create: { name: 'Q1' },
          update: { organizationId: 'org-B' },
        },
        query: mockQuery(),
      }),
    ).rejects.toThrow('organizationId');
  });
});

// ---------------------------------------------------------------------------
// createMany — inject into every element
// ---------------------------------------------------------------------------

describe('createMany operation', () => {
  it('injects organizationId into every element of data array (≥2 elements)', async () => {
    const captured: { args?: Record<string, unknown> } = {};
    const query = mockQuery(captured);

    await interceptAllOperations(makeProvider('org-X'), {
      model: 'Task',
      operation: 'createMany',
      args: {
        data: [{ title: 'task-1' }, { title: 'task-2' }, { title: 'task-3' }],
      },
      query,
    });

    const data = captured.args?.['data'] as Array<Record<string, unknown>>;
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual({ title: 'task-1', organizationId: 'org-X' });
    expect(data[1]).toEqual({ title: 'task-2', organizationId: 'org-X' });
    expect(data[2]).toEqual({ title: 'task-3', organizationId: 'org-X' });
  });

  it('handles single-object data (non-array) by wrapping it', async () => {
    const captured: { args?: Record<string, unknown> } = {};
    const query = mockQuery(captured);

    await interceptAllOperations(makeProvider('org-X'), {
      model: 'Task',
      operation: 'createMany',
      args: { data: { title: 'task-1' } },
      query,
    });

    const data = captured.args?.['data'] as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({ title: 'task-1', organizationId: 'org-X' });
  });
});

// ---------------------------------------------------------------------------
// Models NOT in TENANT_SCOPED_MODELS — pass through unchanged
// ---------------------------------------------------------------------------

describe('models not in TENANT_SCOPED_MODELS pass through unchanged', () => {
  const nonScopedModels = ['Organization', 'User', 'AuditEvent'] as const;

  for (const model of nonScopedModels) {
    it(`findMany on ${model} is not modified`, async () => {
      const originalArgs = { where: { id: '1' } };
      const captured: { args?: Record<string, unknown> } = {};
      const query = mockQuery(captured);

      await interceptAllOperations(makeProvider('org-A'), {
        model,
        operation: 'findMany',
        args: originalArgs,
        query,
      });

      // args must be passed through without any organizationId injection
      expect(captured.args).toEqual(originalArgs);
      expect(captured.args?.['where']).not.toHaveProperty('organizationId');
    });
  }
});

// ---------------------------------------------------------------------------
// Undefined model — pass through unchanged
// ---------------------------------------------------------------------------

it('undefined model passes through unchanged', async () => {
  const originalArgs = { some: 'arg' };
  const captured: { args?: Record<string, unknown> } = {};
  const query = mockQuery(captured);

  await interceptAllOperations(makeProvider('org-A'), {
    model: undefined,
    operation: 'findMany',
    args: originalArgs,
    query,
  });

  expect(captured.args).toEqual(originalArgs);
});

// ---------------------------------------------------------------------------
// Superadmin bypass
// ---------------------------------------------------------------------------

describe('superadmin bypass', () => {
  it('does not inject organizationId on Objective when isSuperadmin() is true', async () => {
    const originalArgs = { where: { id: '1' } };
    const captured: { args?: Record<string, unknown> } = {};
    const query = mockQuery(captured);

    // superadmin = true, no orgId
    await interceptAllOperations(makeProvider(null, true), {
      model: 'Objective',
      operation: 'findMany',
      args: originalArgs,
      query,
    });

    expect(captured.args).toEqual(originalArgs);
    expect(captured.args?.['where']).not.toHaveProperty('organizationId');
  });

  it('does not inject even when orgId is available but isSuperadmin() is true', async () => {
    const originalArgs = { where: {} };
    const captured: { args?: Record<string, unknown> } = {};
    const query = mockQuery(captured);

    await interceptAllOperations(makeProvider('org-A', true), {
      model: 'KeyResult',
      operation: 'findMany',
      args: originalArgs,
      query,
    });

    expect(captured.args?.['where']).not.toHaveProperty('organizationId');
  });
});

// ---------------------------------------------------------------------------
// Missing context error
// ---------------------------------------------------------------------------

describe('MissingTenantContextError', () => {
  it('is thrown when orgId is null and not superadmin, on a scoped model', async () => {
    await expect(
      callIntercept(makeProvider(null, false), { model: 'Objective', operation: 'findMany', args: {} }),
    ).rejects.toThrow(MissingTenantContextError);
  });

  it('error message includes model and operation', async () => {
    await expect(
      callIntercept(makeProvider(null, false), { model: 'Task', operation: 'create', args: {} }),
    ).rejects.toThrow('Task.create');
  });

  it('error name is MissingTenantContextError', async () => {
    try {
      await callIntercept(makeProvider(null, false), { model: 'Objective', operation: 'delete', args: {} });
      expect.fail('Expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MissingTenantContextError);
      expect((err as Error).name).toBe('MissingTenantContextError');
    }
  });
});

// ---------------------------------------------------------------------------
// All scoped models from TENANT_SCOPED_MODELS receive injection
// ---------------------------------------------------------------------------

describe('all models in TENANT_SCOPED_MODELS receive injection', () => {
  const scopedModels = ['Objective', 'KeyResult', 'Task', 'Period', 'UserOrganizationRole', 'OrganizationModule'];

  for (const model of scopedModels) {
    it(`findMany on ${model} injects organizationId`, async () => {
      const captured: { args?: Record<string, unknown> } = {};
      const query = mockQuery(captured);

      await interceptAllOperations(makeProvider('org-Z'), {
        model,
        operation: 'findMany',
        args: { where: {} },
        query,
      });

      expect(captured.args?.['where']).toHaveProperty('organizationId', 'org-Z');
    });
  }
});
