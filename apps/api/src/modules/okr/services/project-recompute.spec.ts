/**
 * Recálculo de la lectura de gestión: tarea -> proyecto -> objetivo (RN-P8).
 * Usa la matemática real de `okr-domain` sobre una base en memoria (la cascada no se mockea).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { computeExecutionProgress, computeProjectProgress } from '@gestion-publica/okr-domain';
import { createInMemoryOkrDb, type InMemoryOkrDb } from '../testing/in-memory-okr-db.js';
import { recomputeObjectiveExecution, recomputeProjectAndObjectiveExecution } from './project-recompute.js';

const ORG = 'org-1';
let db: InMemoryOkrDb;

function addProject(id: string, extra: Record<string, unknown> = {}) {
  db.project.insert({ id, objectiveId: 'obj-1', organizationId: ORG, ...extra });
}
function addTask(id: string, projectId: string, progressBp: number, weightBp: number | null = null, extra: Record<string, unknown> = {}) {
  db.task.insert({ id, projectId, organizationId: ORG, progressBp, weightBp, ...extra });
}
async function recompute(projectId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return recomputeProjectAndObjectiveExecution(db.tx as any, projectId, ORG, computeProjectProgress, computeExecutionProgress);
}
const projectProgress = (id: string) => db.project.rows.find((r) => r['id'] === id)?.['progressCachedBp'];
const execution = () => db.objective.rows.find((r) => r['id'] === 'obj-1')?.['executionProgressCachedBp'];

beforeEach(() => {
  db = createInMemoryOkrDb();
  db.objective.insert({ id: 'obj-1', organizationId: ORG });
});

describe('recomputeProjectAndObjectiveExecution', () => {
  it('2 proyectos sin pesos: promedio simple de tareas y luego de proyectos', async () => {
    addProject('p1');
    addProject('p2');
    addTask('t1', 'p1', 10000);
    addTask('t2', 'p1', 5000); // p1 = 7500
    addTask('t3', 'p2', 2000); // p2 = 2000

    await recompute('p1');
    await recompute('p2');

    expect(projectProgress('p1')).toBe(7500);
    expect(projectProgress('p2')).toBe(2000);
    expect(execution()).toBe(4750); // trunc((7500 + 2000) / 2)
  });

  it('proyectos ponderados: respeta los pesos', async () => {
    addProject('p1', { weightBp: 7000 });
    addProject('p2', { weightBp: 3000 });
    addTask('t1', 'p1', 10000, 2000);
    addTask('t2', 'p1', 0, 8000); // p1 = 2000
    addTask('t3', 'p2', 10000, 10000); // p2 = 10000

    await recompute('p1');
    await recompute('p2');

    expect(projectProgress('p1')).toBe(2000);
    expect(projectProgress('p2')).toBe(10000);
    expect(execution()).toBe(4400); // 0.7 * 2000 + 0.3 * 10000
  });

  it('ignora tareas y proyectos borrados; proyecto sin tareas vale 0', async () => {
    addProject('p1');
    addProject('p2', { deletedAt: new Date() });
    addProject('p3');
    addTask('t1', 'p1', 10000);
    addTask('t2', 'p1', 0, null, { deletedAt: new Date() });
    addTask('t9', 'p2', 0);

    await recompute('p1');
    await recompute('p3');

    expect(projectProgress('p1')).toBe(10000);
    expect(projectProgress('p3')).toBe(0);
    expect(execution()).toBe(5000);
  });

  it('un proyecto from_indicator no toma su avance de las tareas, pero el objetivo se reagrega', async () => {
    addProject('p1', { progressMode: 'from_indicator', progressCachedBp: 3000 });
    addTask('t1', 'p1', 10000);

    await recompute('p1');

    expect(projectProgress('p1')).toBe(3000);
    expect(execution()).toBe(3000);
  });

  it('no toca la lectura de resultado ni el avance del camino KR', async () => {
    db.objective.rows[0] = { ...db.objective.rows[0], progressCachedBp: 1234, resultProgressCachedBp: 5678 };
    addProject('p1');
    addTask('t1', 'p1', 10000);

    await recompute('p1');

    const obj = db.objective.rows[0];
    expect(obj?.['progressCachedBp']).toBe(1234);
    expect(obj?.['resultProgressCachedBp']).toBe(5678);
    expect(obj?.['executionProgressCachedBp']).toBe(10000);
  });

  it('filtra por organizationId: un proyecto de otra org no se encuentra', async () => {
    db.project.insert({ id: 'px', objectiveId: 'obj-1', organizationId: 'org-2' });
    await expect(recompute('px')).rejects.toThrow();
  });
});

describe('recomputeObjectiveExecution', () => {
  it('objetivo sin proyectos vale 0 (nunca NaN)', async () => {
    db.objective.rows[0] = { ...db.objective.rows[0], executionProgressCachedBp: 9000 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recomputeObjectiveExecution(db.tx as any, 'obj-1', ORG, computeExecutionProgress);
    expect(execution()).toBe(0);
  });
});
