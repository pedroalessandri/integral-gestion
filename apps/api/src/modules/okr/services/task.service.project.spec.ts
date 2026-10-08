/**
 * TaskService, rama proyecto (RN-P5, RN-P6, RN-P8). El recálculo usa la matemática real de `okr-domain`
 * sobre una base en memoria. El camino KR legacy está cubierto en task.service.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { TaskService } from './task.service.js';
import { ProjectLifecyclePublisher } from './project-lifecycle-publisher.js';
import { createInMemoryOkrDb, type InMemoryOkrDb } from '../testing/in-memory-okr-db.js';

const ORG = 'org-1';
const PERIOD = {
  id: 'period-1',
  code: '2027',
  status: 'open',
  startsAt: new Date('2027-01-01T00:00:00.000Z'),
  endsAt: new Date('2027-12-31T00:00:00.000Z'),
};
const P_START = new Date('2027-02-01T00:00:00.000Z');
const P_END = new Date('2027-06-30T00:00:00.000Z');
const authCtx: AuthContext = {
  userId: 'user-1',
  auth0Sub: 'auth0|test',
  email: 'test@example.com',
  displayName: 'Test',
  isSuperadmin: false,
  organizationId: ORG,
  permissions: ['okr:write'],
  requestId: 'req-1',
};

let db: InMemoryOkrDb;
let committed = false;
const scoped = {
  project: { findFirst: vi.fn() },
  task: { findFirst: vi.fn(), findMany: vi.fn() },
};
const audit = { emit: vi.fn().mockResolvedValue(undefined) };
const prisma = {
  scoped,
  runInTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const result = await fn(db.tx);
    committed = true; // si fn lanza, nunca llega acá (rollback)
    return result;
  }),
};

/** Publicador REAL con un emisor falso: el evento solo sale de `emitAsync`, que se captura y se ordena contra el commit. */
const events: Array<{ name: string; payload: Record<string, unknown>; afterCommit: boolean }> = [];
const eventEmitter = {
  emitAsync: vi.fn(async (name: string, payload: Record<string, unknown>) => {
    events.push({ name, payload, afterCommit: committed });
    return [];
  }),
};

function build(): TaskService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new TaskService(prisma as any, audit as any, new ProjectLifecyclePublisher(eventEmitter as any));
}

const taskDto = { title: 'Asfaltar', startsAt: '2027-03-01T00:00:00.000Z', endsAt: '2027-04-01T00:00:00.000Z' };

function addTask(id: string, progressBp = 0, weightBp: number | null = null, projectId = 'p1') {
  return db.task.insert({
    id,
    projectId,
    organizationId: ORG,
    title: id,
    progressBp,
    weightBp,
    startsAt: P_START,
    endsAt: P_END,
  });
}
const projectRow = (id: string) => db.project.rows.find((r) => r['id'] === id);
const execution = () => db.objective.rows[0]?.['executionProgressCachedBp'];

beforeEach(() => {
  vi.clearAllMocks();
  committed = false;
  events.length = 0;
  db = createInMemoryOkrDb();
  db.objective.insert({ id: 'obj-1', organizationId: ORG });
  db.project.insert({ id: 'p1', objectiveId: 'obj-1', organizationId: ORG, startsAt: P_START, endsAt: P_END });
  db.project.insert({ id: 'p2', objectiveId: 'obj-1', organizationId: ORG, startsAt: P_START, endsAt: P_END });
  scoped.project.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = db.project.rows.find((r) => r['id'] === where.id && r['deletedAt'] === null);
    return row ? { ...row, objective: { period: PERIOD } } : null;
  });
  scoped.task.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = db.task.rows.find((r) => r['id'] === where.id && r['deletedAt'] === null);
    if (!row) return null;
    const project = row['projectId'] ? db.project.rows.find((p) => p['id'] === row['projectId']) : null;
    return { ...row, keyResult: null, project: project ? { ...project, objective: { period: PERIOD } } : null };
  });
});

describe('TaskService.createInProject', () => {
  it('crea la tarea bajo el proyecto, audita y recalcula proyecto y objetivo', async () => {
    const result = await build().createInProject('p1', ORG, taskDto, authCtx);

    expect(result.projectId).toBe('p1');
    expect(result.keyResultId).toBeNull();
    expect(result.weightBp).toBeNull();
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.created', diff: expect.objectContaining({ after: expect.objectContaining({ projectId: 'p1' }) }) }),
    );
    expect(projectRow('p1')?.['progressCachedBp']).toBe(0);
  });

  it('proyecto inexistente o de otra org -> 404', async () => {
    await expect(build().createInProject('nope', ORG, taskDto, authCtx)).rejects.toBeInstanceOf(NotFoundException);
    expect(scoped.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, deletedAt: null }) }),
    );
  });

  it.each([
    ['inicio antes del proyecto', '2027-01-15T00:00:00.000Z', '2027-03-01T00:00:00.000Z', /TaskOutsideProject/],
    ['fin después del proyecto', '2027-03-01T00:00:00.000Z', '2027-07-01T00:00:00.000Z', /TaskOutsideProject/],
    ['fin antes del inicio', '2027-04-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z', /TaskDatesInvalid/],
  ])('RN-P5: %s -> 422', async (_n, startsAt, endsAt, pattern) => {
    await expect(build().createInProject('p1', ORG, { ...taskDto, startsAt, endsAt }, authCtx)).rejects.toThrow(pattern);
    expect(db.task.rows).toHaveLength(0);
  });

  it('RN-P5: fechas exactamente iguales a las del proyecto -> ok', async () => {
    const result = await build().createInProject(
      'p1',
      ORG,
      { ...taskDto, startsAt: P_START.toISOString(), endsAt: P_END.toISOString() },
      authCtx,
    );
    expect(result.id).toBeDefined();
  });

  it('RN-P6: tarea con peso en grupo sin pesos -> 422 mixto', async () => {
    addTask('t1');
    await expect(build().createInProject('p1', ORG, { ...taskDto, weightBp: 5000 }, authCtx)).rejects.toThrow(
      /MixedWeightGroup/,
    );
  });

  it('RN-P6: tarea sin peso en grupo ponderado -> 422 mixto', async () => {
    addTask('t1', 0, 10000);
    await expect(build().createInProject('p1', ORG, taskDto, authCtx)).rejects.toThrow(/MixedWeightGroup/);
  });

  it('RN-P6: peso único != 10000 -> 422 suma', async () => {
    await expect(build().createInProject('p1', ORG, { ...taskDto, weightBp: 5000 }, authCtx)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});

describe('TaskService.setProgress / update / softDelete (proyecto)', () => {
  it('2 proyectos con tareas: el avance de tareas llega a proyecto y a gestión del objetivo', async () => {
    addTask('t1', 0, null, 'p1');
    addTask('t2', 0, null, 'p1');
    addTask('t3', 0, null, 'p2');

    const svc = build();
    await svc.setProgress('t1', ORG, 10000, authCtx);
    await svc.setProgress('t2', ORG, 5000, authCtx);
    await svc.setProgress('t3', ORG, 2000, authCtx);

    expect(projectRow('p1')?.['progressCachedBp']).toBe(7500);
    expect(projectRow('p2')?.['progressCachedBp']).toBe(2000);
    expect(execution()).toBe(4750);
    // Nunca fusiona con el camino KR ni con el resultado.
    expect(db.objective.rows[0]?.['progressCachedBp']).toBe(0);
    expect(db.objective.rows[0]?.['resultProgressCachedBp']).toBe(0);
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'task.progress.updated', entityId: 't1' }),
    );
  });

  it('borrar una tarea recalcula el proyecto', async () => {
    addTask('t1', 10000);
    addTask('t2', 0);
    const svc = build();
    await svc.setProgress('t1', ORG, 10000, authCtx);
    expect(projectRow('p1')?.['progressCachedBp']).toBe(5000);

    await svc.softDelete('t2', ORG, authCtx);

    expect(projectRow('p1')?.['progressCachedBp']).toBe(10000);
    expect(execution()).toBe(5000); // p1 = 10000, p2 = 0 (sin tareas)
  });

  it('RN-P6: borrar una tarea de un grupo ponderado que deja suma != 10000 -> 422', async () => {
    addTask('t1', 0, 5000);
    addTask('t2', 0, 3000);
    addTask('t3', 0, 2000);
    await expect(build().softDelete('t1', ORG, authCtx)).rejects.toThrow(/WeightSumInvalid/);
  });

  it('RN-P6: cambiar el peso de una tarea y dejar grupo mixto/suma incorrecta -> 422', async () => {
    addTask('t1');
    addTask('t2');
    await expect(build().update('t1', ORG, { weightBp: 5000 }, authCtx)).rejects.toThrow(/MixedWeightGroup/);
  });

  it('RN-P5: mover fechas fuera del proyecto -> 422', async () => {
    addTask('t1');
    await expect(
      build().update('t1', ORG, { endsAt: '2027-12-01T00:00:00.000Z' }, authCtx),
    ).rejects.toThrow(/TaskOutsideProject/);
  });

  it('una tarea de proyecto no admite weightBp null cuando el grupo es ponderado (queda mixto)', async () => {
    addTask('t1', 0, 5000);
    addTask('t2', 0, 5000);
    await expect(build().update('t1', ORG, { weightBp: null }, authCtx)).rejects.toThrow(/MixedWeightGroup/);
  });
});

describe('TaskService.setProjectTaskWeights', () => {
  it('pasa de sin pesos a ponderado y recalcula con los pesos', async () => {
    addTask('t1', 10000);
    addTask('t2', 0);

    const result = await build().setProjectTaskWeights(
      'p1',
      ORG,
      { weights: [{ id: 't1', weightBp: 2500 }, { id: 't2', weightBp: 7500 }] },
      authCtx,
    );

    expect(result.map((t) => t.weightBp)).toEqual([2500, 7500]);
    expect(projectRow('p1')?.['progressCachedBp']).toBe(2500);
    expect(execution()).toBe(1250); // trunc((2500 + 0) / 2)
  });

  it('suma incorrecta o ids que no coinciden -> 422 sin persistir', async () => {
    addTask('t1');
    addTask('t2');
    await expect(
      build().setProjectTaskWeights('p1', ORG, { weights: [{ id: 't1', weightBp: 5000 }, { id: 't2', weightBp: 4000 }] }, authCtx),
    ).rejects.toThrow(/WeightSumInvalid/);
    await expect(
      build().setProjectTaskWeights('p1', ORG, { weights: [{ id: 't1', weightBp: 10000 }] }, authCtx),
    ).rejects.toThrow(/WeightsSetMismatch/);
    expect(db.task.rows.every((t) => t['weightBp'] === null)).toBe(true);
  });
});

describe('TaskService: eventos del ciclo de vida del proyecto (ADR-0009 D5, RN-P13)', () => {
  it('llegar al 100 % emite project.completed DESPUÉS del commit, con organización, actor y request', async () => {
    addTask('t1', 0, null, 'p1');
    addTask('t2', 10000, null, 'p1');
    await build().setProgress('t1', ORG, 10000, authCtx);

    expect(projectRow('p1')?.['progressCachedBp']).toBe(10000);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'project.completed',
      afterCommit: true,
      payload: { organizationId: ORG, actorId: 'user-1', requestId: 'req-1', projectId: 'p1', objectiveId: 'obj-1' },
    });
    expect(typeof events[0]?.payload['occurredAt']).toBe('string');
  });

  it('bajar del 100 % emite project.reopened (progress_dropped)', async () => {
    addTask('t1', 10000, null, 'p1');
    db.project.rows.find((r) => r['id'] === 'p1')!['progressCachedBp'] = 10000;
    await build().setProgress('t1', ORG, 5000, authCtx);

    expect(events.map((e) => e.name)).toEqual(['project.reopened']);
    expect(events[0]?.payload).toMatchObject({ reason: 'progress_dropped', projectId: 'p1' });
  });

  it('agregar una tarea a un proyecto completo lo reabre; borrar la única tarea pendiente lo completa', async () => {
    addTask('t1', 10000, null, 'p1');
    db.project.rows.find((r) => r['id'] === 'p1')!['progressCachedBp'] = 10000;
    const svc = build();
    await svc.createInProject('p1', ORG, taskDto, authCtx);
    expect(events.map((e) => e.name)).toEqual(['project.reopened']);

    events.length = 0;
    const pending = db.task.rows.find((r) => r['progressBp'] === 0 && r['projectId'] === 'p1');
    await svc.softDelete(pending?.['id'] as string, ORG, authCtx);
    expect(events.map((e) => e.name)).toEqual(['project.completed']);
  });

  it('sin cruzar el 100 % no se emite nada, y si la transacción falla tampoco', async () => {
    addTask('t1', 0, null, 'p1');
    addTask('t2', 0, null, 'p1');
    await build().setProgress('t1', ORG, 4000, authCtx);
    expect(events).toHaveLength(0);

    prisma.runInTransaction.mockRejectedValueOnce(new Error('rollback'));
    await expect(build().setProgress('t2', ORG, 10000, authCtx)).rejects.toThrow('rollback');
    expect(events).toHaveLength(0);
  });

  it('si el oyente falla, la mutación ya está confirmada: se loguea y no se propaga', async () => {
    addTask('t1', 0, null, 'p1');
    eventEmitter.emitAsync.mockRejectedValueOnce(new Error('listener down'));
    await expect(build().setProgress('t1', ORG, 10000, authCtx)).resolves.toBeDefined();
    expect(projectRow('p1')?.['progressCachedBp']).toBe(10000);
  });
});
