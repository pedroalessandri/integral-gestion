import { describe, it, expect } from 'vitest';
import { ALL_PERMISSIONS, hasPermission } from '../src/auth/index.js';
import type { AuthContext, PermissionKey } from '../src/auth/index.js';
import type { ObjectiveCascadeDto, SetTaskProgressDto } from '../src/okr/index.js';
import type { MeDto, OrganizationDetailDto } from '../src/core/index.js';
import type { AuditEventDto, DomainEvent } from '../src/audit/index.js';
import type { ErrorResponseDto } from '../src/common/index.js';

describe('shared-types public API', () => {
  it('ALL_PERMISSIONS is "*"', () => {
    expect(ALL_PERMISSIONS).toBe('*');
  });

  it('hasPermission: superadmin wildcard grants any key', () => {
    const ctx: Pick<AuthContext, 'permissions'> = { permissions: ['*'] };
    const key: PermissionKey = 'okr:write';
    expect(hasPermission(ctx, key)).toBe(true);
  });

  it('hasPermission: specific key matches', () => {
    const ctx: Pick<AuthContext, 'permissions'> = { permissions: ['okr:read'] };
    expect(hasPermission(ctx, 'okr:read')).toBe(true);
    expect(hasPermission(ctx, 'okr:write')).toBe(false);
  });

  it('hasPermission: empty permissions rejects everything', () => {
    const ctx: Pick<AuthContext, 'permissions'> = { permissions: [] };
    expect(hasPermission(ctx, 'okr:read')).toBe(false);
  });

  // Structural smoke: construct a sample of each major DTO to verify shape compiles
  it('sample DTOs satisfy their interfaces', () => {
    const cascade: ObjectiveCascadeDto = {
      objective: {
        id: 'c1',
        title: 'T',
        periodCode: '2026-Q2',
        progressCachedBp: 5000,
        status: 'in_progress',
        hasActiveKeyResults: true,
        createdAt: '2026-04-20T00:00:00Z',
        period: { id: 'p1', code: '2026-Q2', status: 'open' },
        description: null,
        organizationId: 'o1',
        periodId: 'p1',
        updatedAt: '2026-04-20T00:00:00Z',
        startsAt: null,
        endsAt: null,
        owner: null,
      },
      keyResults: [],
      planIncomplete: true,
      imbalancedKrCount: 0,
    };
    expect(cascade.keyResults).toHaveLength(0);

    const progress: SetTaskProgressDto = { progressBp: 5000 };
    expect(progress.progressBp).toBe(5000);

    const me: MeDto = {
      userId: 'u1',
      email: 'a@b.c',
      displayName: 'A',
      isSuperadmin: false,
      orgs: [
        {
          id: 'o1',
          slug: 's',
          name: 'N',
          role: { key: 'org-admin', name: 'Admin', permissions: ['okr:read'] },
          enabledModules: ['okr'],
        },
      ],
    };
    expect(me.orgs[0]!.role.permissions).toContain('okr:read');

    const evt: DomainEvent = {
      action: 'task.progress.updated',
      entityType: 'okr.task',
      entityId: 't1',
      diff: { before: { progressBp: 0 }, after: { progressBp: 5000 } },
    };
    expect(evt.action).toBe('task.progress.updated');

    const err: ErrorResponseDto = {
      statusCode: 409,
      message: 'sum mismatch',
      error: 'WeightSumInvariant',
    };
    expect(err.statusCode).toBe(409);

    const auditEvent: AuditEventDto = {
      id: 'a1',
      occurredAt: '2026-04-20T00:00:00Z',
      actorId: 'u1',
      actorEmail: 'a@b.c',
      organizationId: 'o1',
      entityType: 'okr.task',
      entityId: 't1',
      action: 'task.progress.updated',
      diff: { before: 0, after: 5000 },
      requestId: 'r1',
    };
    expect(auditEvent.action).toBe('task.progress.updated');

    const org: OrganizationDetailDto = {
      id: 'o1',
      slug: 's',
      name: 'N',
      status: 'active',
      createdAt: '2026-04-20T00:00:00Z',
      deactivatedAt: null,
      deactivatedByUserId: null,
      updatedAt: '2026-04-20T00:00:00Z',
      mission: null,
      vision: null,
      values: null,
      context: null,
    };
    expect(org.status).toBe('active');
  });
});
