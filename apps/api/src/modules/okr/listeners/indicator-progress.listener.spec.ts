import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { requestContextStorage } from '../../audit/index.js';
import type { IndicatorProgressChangedEvent } from '@gestion-publica/shared-types/metrics';
import { IndicatorProgressListener } from './indicator-progress.listener.js';

const event: IndicatorProgressChangedEvent = {
  organizationId: 'org-1',
  actorId: 'user-1',
  requestId: '11111111-1111-4111-8111-111111111111',
  objectiveIndicatorId: 'oi-1',
  objectiveId: 'obj-1',
  progressBp: 2500,
  objectiveResultProgressBp: 2500,
};

const tx = {
  objective: { findFirst: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  $queryRaw: vi.fn().mockResolvedValue([]),
};
const prisma = { runInTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
const audit = { emit: vi.fn() };

function build() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new IndicatorProgressListener(prisma as any, audit as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  audit.emit.mockImplementation(async () => {
    // El audit exige actor y requestId en los ALS: deben salir del payload, no del contexto de quien emitió.
    expect(tenantContextStorage.getStore()).toMatchObject({ userId: 'user-1', organizationId: 'org-1' });
    expect(requestContextStorage.getStore()).toEqual({ requestId: event.requestId });
  });
});

describe('IndicatorProgressListener', () => {
  it('setea resultProgressCachedBp, filtra por organizationId y escribe su audit con actor del payload', async () => {
    tx.objective.findFirst.mockResolvedValue({ resultProgressCachedBp: 0 });
    await build().handle(event);

    expect(tx.objective.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'obj-1', organizationId: 'org-1', deletedAt: null } }),
    );
    expect(tx.objective.updateMany).toHaveBeenCalledWith({
      where: { id: 'obj-1', organizationId: 'org-1' },
      data: { resultProgressCachedBp: 2500 },
    });
    expect(audit.emit).toHaveBeenCalledWith({
      action: 'objective.result_progress_changed',
      entityType: 'okr.objective',
      entityId: 'obj-1',
      diff: { before: { resultProgressCachedBp: 0 }, after: { resultProgressCachedBp: 2500 } },
    });
  });

  it('idempotente: si el valor ya es el del payload no escribe ni audita (dos entregas = un solo efecto)', async () => {
    tx.objective.findFirst.mockResolvedValueOnce({ resultProgressCachedBp: 0 });
    tx.objective.findFirst.mockResolvedValueOnce({ resultProgressCachedBp: 2500 });
    const listener = build();
    await listener.handle(event);
    await listener.handle(event);
    expect(tx.objective.updateMany).toHaveBeenCalledTimes(1);
    expect(audit.emit).toHaveBeenCalledTimes(1);
  });

  it('objetivo inexistente o borrado: no hace nada', async () => {
    tx.objective.findFirst.mockResolvedValue(null);
    await build().handle(event);
    expect(tx.objective.updateMany).not.toHaveBeenCalled();
    expect(audit.emit).not.toHaveBeenCalled();
  });

  it('no toca la lectura de gestión', async () => {
    tx.objective.findFirst.mockResolvedValue({ resultProgressCachedBp: 10 });
    await build().handle(event);
    const data = tx.objective.updateMany.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(['resultProgressCachedBp']);
  });
});
