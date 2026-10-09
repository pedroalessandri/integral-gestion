import { describe, expect, it } from 'vitest';
import {
  aggregateObjectiveReadings,
  aggregateObjectiveReadingsBy,
  buildUnitAggregates,
  unitSubtreeIds,
  type ObjectiveReadingInput,
  type OrgUnitTreeInput,
} from './planning-tree';

const obj = (id: string, over: Partial<ObjectiveReadingInput> = {}): ObjectiveReadingInput => ({
  id,
  orgUnitId: null,
  axisId: null,
  resultProgressBp: 0,
  executionProgressBp: 0,
  resultDeviationBp: null,
  executionDeviationBp: 0,
  pendingBucketsCount: 0,
  ...over,
});

describe('aggregateObjectiveReadings', () => {
  it('sin objetivos: cero objetivos y todo null (no hay promedio)', () => {
    const a = aggregateObjectiveReadings([]);
    expect(a.objectivesCount).toBe(0);
    expect(a.result).toEqual({ progressBp: null, deviationBp: null, semaphore: null, pendingBucketsCount: 0 });
    expect(a.execution).toEqual({ progressBp: null, deviationBp: null, semaphore: null });
  });

  it('promedio simple por lectura, sin mezclar resultado con gestión', () => {
    const a = aggregateObjectiveReadings([
      obj('a', { resultProgressBp: 10000, executionProgressBp: 0 }),
      obj('b', { resultProgressBp: 5000, executionProgressBp: 2000 }),
      obj('c', { resultProgressBp: 0, executionProgressBp: 1000 }),
    ]);
    expect(a.result.progressBp).toBe(5000);
    expect(a.execution.progressBp).toBe(1000);
  });

  it('trunca el promedio hacia cero (enteros)', () => {
    const a = aggregateObjectiveReadings([obj('a', { resultProgressBp: 1 }), obj('b', { resultProgressBp: 0 }), obj('c', { resultProgressBp: 1 })]);
    expect(a.result.progressBp).toBe(0);
  });

  it('el desvío de resultado excluye a los objetivos sin datos; el semáforo sale del desvío medio', () => {
    const a = aggregateObjectiveReadings([
      obj('a', { resultDeviationBp: -3000 }),
      obj('b', { resultDeviationBp: -1000 }),
      obj('c', { resultDeviationBp: null, resultProgressBp: 9000 }),
    ]);
    expect(a.result.deviationBp).toBe(-2000);
    expect(a.result.semaphore).toBe('yellow');
    // el progreso sí cuenta a los tres
    expect(a.result.progressBp).toBe(3000);
  });

  it('si ningún objetivo tiene datos de resultado, desvío y semáforo son null', () => {
    const a = aggregateObjectiveReadings([obj('a'), obj('b')]);
    expect(a.result.deviationBp).toBeNull();
    expect(a.result.semaphore).toBeNull();
    expect(a.execution.deviationBp).toBe(0);
    expect(a.execution.semaphore).toBe('green');
  });

  it('suma las cargas pendientes y el semáforo de gestión usa su propio desvío', () => {
    const a = aggregateObjectiveReadings([
      obj('a', { pendingBucketsCount: 2, executionDeviationBp: -3000 }),
      obj('b', { pendingBucketsCount: 1, executionDeviationBp: -2500 }),
    ]);
    expect(a.result.pendingBucketsCount).toBe(3);
    expect(a.execution.deviationBp).toBe(-2750);
    expect(a.execution.semaphore).toBe('red');
    expect(a.result.semaphore).toBeNull();
  });

  it('rechaza bp no enteros', () => {
    expect(() => aggregateObjectiveReadings([obj('a', { resultProgressBp: 0.5 })])).toThrow(RangeError);
  });
});

describe('aggregateObjectiveReadingsBy', () => {
  it('agrupa por clave, con null para los sin asignar', () => {
    const m = aggregateObjectiveReadingsBy(
      [obj('a', { axisId: 'x', resultProgressBp: 100 }), obj('b', { axisId: null }), obj('c', { axisId: 'x', resultProgressBp: 300 })],
      (o) => o.axisId,
    );
    expect(m.get('x')?.result.progressBp).toBe(200);
    expect(m.get(null)?.objectivesCount).toBe(1);
    expect(m.size).toBe(2);
  });
});

const unit = (id: string, parentId: string | null, order = 0, name = id): OrgUnitTreeInput => ({ id, parentId, order, name });

describe('buildUnitAggregates', () => {
  const units = [unit('central', null), unit('min', 'central'), unit('area1', 'min', 1), unit('area2', 'min', 0), unit('empty', 'central', 5)];

  it('el agregado de una unidad es el promedio de los objetivos del subárbol, no el promedio de promedios', () => {
    const r = buildUnitAggregates(units, [
      obj('o1', { orgUnitId: 'min', resultProgressBp: 0 }),
      obj('o2', { orgUnitId: 'area1', resultProgressBp: 3000 }),
      obj('o3', { orgUnitId: 'area1', resultProgressBp: 3000 }),
    ]);
    const central = r.roots[0];
    const min = central?.children.find((c) => c.orgUnitId === 'min');
    expect(min?.aggregate.objectivesCount).toBe(3);
    expect(min?.aggregate.result.progressBp).toBe(2000); // (0 + 3000 + 3000) / 3, no (0 + 3000) / 2
    expect(min?.directAggregate.objectivesCount).toBe(1);
    expect(min?.directAggregate.result.progressBp).toBe(0);
    expect(min?.objectiveIds).toEqual(['o1']);
    expect(central?.aggregate.objectivesCount).toBe(3);
  });

  it('incluye las unidades sin objetivos y ordena hermanos por order y nombre', () => {
    const r = buildUnitAggregates(units, []);
    const central = r.roots[0];
    expect(central?.children.map((c) => c.orgUnitId)).toEqual(['min', 'empty']);
    const min = central?.children[0];
    expect(min?.children.map((c) => c.orgUnitId)).toEqual(['area2', 'area1']);
    const empty = central?.children[1];
    expect(empty?.aggregate.objectivesCount).toBe(0);
    expect(empty?.aggregate.result.progressBp).toBeNull();
  });

  it('los objetivos sin unidad o con una unidad desconocida van a withoutUnit', () => {
    const r = buildUnitAggregates(units, [obj('a'), obj('b', { orgUnitId: 'borrada' }), obj('c', { orgUnitId: 'min' })]);
    expect(r.withoutUnit.objectiveIds).toEqual(['a', 'b']);
    expect(r.withoutUnit.aggregate.objectivesCount).toBe(2);
    expect(r.roots[0]?.aggregate.objectivesCount).toBe(1);
  });

  it('tolera ciclos sin colgarse', () => {
    const r = buildUnitAggregates([unit('a', 'b'), unit('b', 'a')], [obj('o', { orgUnitId: 'a' })]);
    expect(r.roots).toEqual([]);
    expect(r.withoutUnit.objectiveIds).toEqual(['o']);
  });
});

describe('unitSubtreeIds', () => {
  const units = [unit('c', null), unit('m', 'c'), unit('a', 'm'), unit('m2', 'c')];
  it('devuelve la unidad y sus descendientes', () => {
    expect([...unitSubtreeIds(units, 'm')].sort()).toEqual(['a', 'm']);
    expect(unitSubtreeIds(units, 'c').size).toBe(4);
  });
  it('vacío si la unidad no existe', () => {
    expect(unitSubtreeIds(units, 'zz').size).toBe(0);
  });
});
