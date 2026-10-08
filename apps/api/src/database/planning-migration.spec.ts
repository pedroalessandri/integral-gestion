import { describe, expect, it } from 'vitest';
import { computeExecutionProgress, computeProjectProgress, computeResultProgress } from '@gestion-publica/okr-domain';
import {
  planObjectiveMigration,
  resolveGroupWeights,
  type LegacyKeyResult,
  type LegacyTask,
} from './planning-migration';

const PERIOD = { startsAt: new Date('2027-01-01T00:00:00Z'), endsAt: new Date('2027-12-31T00:00:00Z') };

function task(id: string, weightBp: number | null, startsAt: string, endsAt: string, progressBp = 0): LegacyTask {
  return { id, weightBp, progressBp, startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
}

function auto(id: string, weightBp: number, metricId: string, tasks: LegacyTask[] = []): LegacyKeyResult {
  return {
    id,
    title: `KR ${id}`,
    description: null,
    ownerUserId: 'u1',
    weightBp,
    progressMode: 'automatic',
    link: { metricId, baselineValue: '8.0000', targetValue: '6.0000', direction: 'decreasing' },
    tasks,
  };
}

function manual(id: string, weightBp: number, tasks: LegacyTask[] = []): LegacyKeyResult {
  return {
    id,
    title: `KR ${id}`,
    description: 'desc',
    ownerUserId: null,
    weightBp,
    progressMode: 'manual',
    link: null,
    tasks,
  };
}

const base = { period: PERIOD, existingIndicatorWeights: [], existingProjectWeights: [], existingMetricIds: [] };

describe('resolveGroupWeights', () => {
  it('conserva los pesos de un grupo vacío si están todos y suman 10000', () => {
    expect(resolveGroupWeights([], [6000, 4000])).toEqual({ ok: true, weights: [6000, 4000], reset: false });
  });

  it('quita todos los pesos si la suma no cierra (todo-o-nada)', () => {
    expect(resolveGroupWeights([], [5000, 2000])).toEqual({ ok: true, weights: [null, null], reset: true });
  });

  it('quita todos los pesos si el grupo es mixto', () => {
    expect(resolveGroupWeights([], [10000, null])).toEqual({ ok: true, weights: [null, null], reset: true });
  });

  it('un grupo sin nada nuevo no cambia', () => {
    expect(resolveGroupWeights([5000, 5000], [])).toEqual({ ok: true, weights: [], reset: false });
  });

  it('los nuevos entran sin peso si los existentes no ponderan', () => {
    expect(resolveGroupWeights([null], [3000])).toEqual({ ok: true, weights: [null], reset: true });
  });

  it('es conflicto si los existentes están ponderados', () => {
    expect(resolveGroupWeights([10000], [3000])).toEqual({ ok: false, reason: 'existing_weighted' });
  });
});

describe('planObjectiveMigration', () => {
  it('KR automático con vínculo -> indicador con la misma métrica, base, meta, dirección y peso', () => {
    const plan = planObjectiveMigration({ ...base, krs: [auto('a', 10000, 'm1')] });
    expect(plan.indicators).toEqual([
      {
        krId: 'a',
        metricId: 'm1',
        baselineValue: '8.0000',
        targetValue: '6.0000',
        direction: 'decreasing',
        weightBp: 10000,
      },
    ]);
    expect(plan.projects).toEqual([]);
  });

  it('las tareas del KR automático van a un proyecto "Tareas de <KR>" sin peso propio', () => {
    const t = [task('t1', 6000, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z'), task('t2', 4000, '2027-01-15T00:00:00Z', '2027-05-01T00:00:00Z')];
    const plan = planObjectiveMigration({ ...base, krs: [auto('a', 10000, 'm1', t)] });
    expect(plan.projects).toHaveLength(1);
    const p = plan.projects[0]!;
    expect(p.title).toBe('Tareas de KR a');
    expect(p.origin).toBe('tasks_of_automatic_kr');
    expect(p.weightBp).toBeNull();
    expect(p.startsAt).toEqual(new Date('2027-01-15T00:00:00Z'));
    expect(p.endsAt).toEqual(new Date('2027-05-01T00:00:00Z'));
    expect(p.tasks.map((x) => x.weightBp)).toEqual([6000, 4000]);
  });

  it('KR manual -> proyecto con título, owner, peso y fechas min/max de sus tareas', () => {
    const t = [task('t1', 10000, '2027-03-01T00:00:00Z', '2027-04-01T00:00:00Z')];
    const plan = planObjectiveMigration({ ...base, krs: [manual('m', 10000, t)] });
    expect(plan.indicators).toEqual([]);
    expect(plan.projects[0]).toMatchObject({
      origin: 'manual_kr',
      title: 'KR m',
      description: 'desc',
      weightBp: 10000,
      startsAt: new Date('2027-03-01T00:00:00Z'),
      endsAt: new Date('2027-04-01T00:00:00Z'),
    });
  });

  it('KR manual sin tareas usa las fechas del período', () => {
    const plan = planObjectiveMigration({ ...base, krs: [manual('m', 10000)] });
    expect(plan.projects[0]).toMatchObject({ startsAt: PERIOD.startsAt, endsAt: PERIOD.endsAt, tasks: [] });
  });

  it('KR automático sin vínculo se trata como proyecto', () => {
    const kr: LegacyKeyResult = { ...auto('a', 10000, 'm1'), link: null };
    const plan = planObjectiveMigration({ ...base, krs: [kr] });
    expect(plan.indicators).toEqual([]);
    expect(plan.projects[0]?.origin).toBe('automatic_kr_without_link');
  });

  it('un objetivo con KR automático y manual parte los pesos: ningún grupo suma 10000 -> sin pesos', () => {
    const plan = planObjectiveMigration({ ...base, krs: [auto('a', 5000, 'm1'), manual('m', 5000)] });
    expect(plan.indicators.map((i) => i.weightBp)).toEqual([null]);
    expect(plan.projects.map((p) => p.weightBp)).toEqual([null]);
    expect(plan.weightGroupsReset).toEqual({ indicators: 1, projects: 1, tasks: 0 });
  });

  it('si todos los KR son del mismo tipo, los pesos se conservan', () => {
    const plan = planObjectiveMigration({ ...base, krs: [manual('x', 7000), manual('y', 3000)] });
    expect(plan.projects.map((p) => p.weightBp)).toEqual([7000, 3000]);
    expect(plan.weightGroupsReset).toEqual({ indicators: 0, projects: 0, tasks: 0 });
  });

  it('el proyecto "Tareas de" sin peso fuerza al grupo de proyectos a quedar sin pesos', () => {
    const t = [task('t1', 10000, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z')];
    const plan = planObjectiveMigration({
      ...base,
      krs: [auto('a', 4000, 'm1', t), manual('x', 3000), manual('y', 3000)],
    });
    expect(plan.projects.map((p) => p.weightBp)).toEqual([null, null, null]);
  });

  it('pesos de tareas que no suman 10000 se quitan; los que cierran se conservan', () => {
    const bad = [task('t1', 5000, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z'), task('t2', 2000, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z')];
    const good = [task('t3', 10000, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z')];
    const plan = planObjectiveMigration({ ...base, krs: [manual('bad', 5000, bad), manual('good', 5000, good)] });
    expect(plan.projects[0]?.tasks.map((t) => t.weightBp)).toEqual([null, null]);
    expect(plan.projects[1]?.tasks.map((t) => t.weightBp)).toEqual([10000]);
    expect(plan.weightGroupsReset.tasks).toBe(1);
  });

  it('dos KR con la misma métrica en el objetivo: el segundo es conflicto', () => {
    const plan = planObjectiveMigration({ ...base, krs: [auto('a', 5000, 'm1'), auto('b', 5000, 'm1')] });
    expect(plan.indicators.map((i) => i.krId)).toEqual(['a']);
    expect(plan.conflicts).toEqual([{ krId: 'b', reason: 'metric_already_linked_to_objective' }]);
  });

  it('una métrica ya medida por un indicador existente es conflicto', () => {
    const plan = planObjectiveMigration({ ...base, existingMetricIds: ['m1'], krs: [auto('a', 10000, 'm1')] });
    expect(plan.indicators).toEqual([]);
    expect(plan.conflicts).toHaveLength(1);
  });

  it('hermanos existentes ponderados: el objetivo entero queda como conflicto', () => {
    const plan = planObjectiveMigration({
      ...base,
      existingProjectWeights: [10000],
      krs: [manual('x', 5000), manual('y', 5000)],
    });
    expect(plan.projects).toEqual([]);
    expect(plan.conflicts.map((c) => c.krId)).toEqual(['x', 'y']);
  });

  it('el resultado cierra con la cascada de okr-domain sin tirar errores de pesos (todo-o-nada)', () => {
    const t = [task('t1', 6000, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z', 5000), task('t2', 4000, '2027-02-01T00:00:00Z', '2027-03-01T00:00:00Z', 10000)];
    const plan = planObjectiveMigration({
      ...base,
      krs: [auto('a', 3000, 'm1', t), auto('b', 2000, 'm2'), manual('x', 5000, t)],
    });
    const projectBp = plan.projects.map((p) => computeProjectProgress(p.tasks));
    expect(projectBp).toEqual([7000, 7000]);
    expect(() =>
      computeExecutionProgress(plan.projects.map((p, i) => ({ weightBp: p.weightBp, progressBp: projectBp[i] ?? 0 }))),
    ).not.toThrow();
    expect(() =>
      computeResultProgress(plan.indicators.map((i) => ({ weightBp: i.weightBp, progressBp: 0 }))),
    ).not.toThrow();
  });
});
