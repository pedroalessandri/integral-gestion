import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { AuditEventEmitterService } from './audit-event-emitter.service.js';
import { transactionContextStorage, NoActiveTransactionError } from './context/transaction-context-storage.js';
import { requestContextStorage } from './context/request-context-storage.js';
import { tenantContextStorage } from '../auth/context/tenant-context-storage.js';
import { MissingRequestContextError, MissingActorError } from './errors.js';
import type { DomainEvent } from '@gestion-publica/shared-types/audit';

// Silence logger output during tests
vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

const sampleEvent: DomainEvent = {
  action: 'organization.created',
  entityType: 'core.organization',
  entityId: 'org-entity-id-1',
  diff: {
    before: null,
    after: { slug: 'test-org', name: 'Test Org', status: 'active' },
  },
};

describe('AuditEventEmitterService', () => {
  let emitter: AuditEventEmitterService;

  beforeEach(() => {
    emitter = new AuditEventEmitterService();
  });

  it('Case 1 — throws NoActiveTransactionError when TransactionContextStorage is empty', async () => {
    // No ALS store seeded — transactionContextStorage.getStore() returns undefined
    await expect(emitter.emit(sampleEvent)).rejects.toThrow(NoActiveTransactionError);
  });

  it('Case 2 — throws MissingRequestContextError when RequestContextStorage is empty', async () => {
    const mockTx = { auditEvent: { create: vi.fn() } };

    await new Promise<void>((resolve, reject) => {
      transactionContextStorage.run(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockTx as any,
        async () => {
          // requestContextStorage is NOT seeded — getStore() returns undefined
          try {
            await expect(emitter.emit(sampleEvent)).rejects.toThrow(MissingRequestContextError);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  });

  it('Case 3 — throws MissingActorError when TenantContextStorage has no userId', async () => {
    const mockTx = { auditEvent: { create: vi.fn() } };
    const mockTenantCtx = {
      userId: null as unknown as string,
      organizationId: 'org-1',
      auth0Sub: 'auth0|test',
      email: 'test@example.com',
      displayName: 'Test User',
      isSuperadmin: false,
      permissions: [],
      requestId: 'req-id-case3',
    };

    await new Promise<void>((resolve, reject) => {
      transactionContextStorage.run(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockTx as any,
        () => {
          requestContextStorage.run({ requestId: 'req-id-case3' }, () => {
            tenantContextStorage.run(mockTenantCtx, async () => {
              try {
                await expect(emitter.emit(sampleEvent)).rejects.toThrow(MissingActorError);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          });
        },
      );
    });
  });

  it('Case 4 — happy path: calls tx.auditEvent.create with correct fields', async () => {
    const mockCreate = vi.fn().mockResolvedValue({});
    const mockTx = { auditEvent: { create: mockCreate } };
    const mockTenantCtx = {
      userId: 'user-1',
      organizationId: 'org-1',
      auth0Sub: 'auth0|user1',
      email: 'user1@example.com',
      displayName: 'User One',
      isSuperadmin: false,
      permissions: [],
      requestId: 'test-req-id',
    };

    await new Promise<void>((resolve, reject) => {
      transactionContextStorage.run(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockTx as any,
        () => {
          requestContextStorage.run({ requestId: 'test-req-id' }, () => {
            tenantContextStorage.run(mockTenantCtx, async () => {
              try {
                await emitter.emit(sampleEvent);
                expect(mockCreate).toHaveBeenCalledOnce();
                const callArg = mockCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
                expect(callArg.data).toMatchObject({
                  actorId: 'user-1',
                  organizationId: 'org-1',
                  requestId: 'test-req-id',
                  action: sampleEvent.action,
                  entityType: sampleEvent.entityType,
                  entityId: sampleEvent.entityId,
                });
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          });
        },
      );
    });
  });

  it('Case 5 — system event: organizationId is null when tenantCtx.organizationId is null', async () => {
    const mockCreate = vi.fn().mockResolvedValue({});
    const mockTx = { auditEvent: { create: mockCreate } };
    const mockTenantCtx = {
      userId: 'user-1',
      organizationId: null,
      auth0Sub: 'auth0|user1',
      email: 'user1@example.com',
      displayName: 'User One',
      isSuperadmin: false,
      permissions: [],
      requestId: 'test-req-id-sys',
    };

    await new Promise<void>((resolve, reject) => {
      transactionContextStorage.run(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockTx as any,
        () => {
          requestContextStorage.run({ requestId: 'test-req-id-sys' }, () => {
            tenantContextStorage.run(mockTenantCtx, async () => {
              try {
                await emitter.emit(sampleEvent);
                expect(mockCreate).toHaveBeenCalledOnce();
                const callArg = mockCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
                expect(callArg.data).toMatchObject({
                  actorId: 'user-1',
                  organizationId: null,
                });
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          });
        },
      );
    });
  });
});
