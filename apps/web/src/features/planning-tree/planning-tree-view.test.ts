import { describe, expect, it } from 'vitest';
import type {
  PlanningAggregateDto,
  PlanningObjectiveDto,
  PlanningTreeDto,
} from '@gestion-publica/shared-types/okr';
import {
  buildAxesTree,
  buildAxisBoards,
  buildTree,
  buildUnitsTree,
  expandableKeys,
  type TreeNode,
} from './planning-tree-view';

const agg = (
  n: number,
  resultBp: number | null = null,
  execBp: number | null = null,
): PlanningAggregateDto => ({
  objectivesCount: n,
  result: { progressBp: resultBp, deviationBp: null, semaphore: null, pendingBucketsCount: 0 },
  execution: { progressBp: execBp, deviationBp: null, semaphore: null },
});

const objective = (
  id: string,
  orgUnitId: string,
  axisId: string | null,
): PlanningObjectiveDto =>
  ({
    id,
    title: `Objetivo ${id}`,
    orgUnitId,
    axisId,
    result: { progressBp: 4000, deviationBp: -3000, semaphore: 'red', pendingBucketsCount: 2 },
    execution: { progressBp: 6000, plannedBp: 5000, deviationBp: 1000, semaphore: 'green' },
  }) as PlanningObjectiveDto;

const dto: PlanningTreeDto = {
  asOf: '2026-10-09T00:00:00.000Z',
  periodId: 'p1',
  filters: { axisId: null, orgUnitId: null },
  plan: { id: 'plan1', title: 'Plan 2026', aggregate: agg(3, 4000, 6000) },
  axes: [
    {
      id: 'a1',
      name: 'Eje Salud',
      order: 1,
      aggregate: agg(2, 4000, 6000),
      objectiveIds: ['o1', 'o2'],
      units: [
        { orgUnitId: 'u2', aggregate: agg(1, 4000, 6000) },
        { orgUnitId: 'u3', aggregate: agg(1, 4000, 6000) },
      ],
    },
    { id: 'a2', name: 'Eje vacío', order: 2, aggregate: agg(0), objectiveIds: [], units: [] },
  ],
  withoutAxis: {
    aggregate: agg(1, 4000, 6000),
    objectiveIds: ['o3'],
    units: [{ orgUnitId: 'u2', aggregate: agg(1, 4000, 6000) }],
  },
  units: [
    {
      id: 'u1',
      name: 'Central',
      kind: 'central',
      order: 0,
      aggregate: agg(2, 4000, 6000),
      directAggregate: agg(0),
      objectiveIds: [],
      children: [
        {
          id: 'u2',
          name: 'Ministerio de Salud',
          kind: 'ministry',
          order: 0,
          aggregate: agg(1, 4000, 6000),
          directAggregate: agg(1, 4000, 6000),
          objectiveIds: ['o1'],
          children: [],
        },
        {
          id: 'u3',
          name: 'Área vacía',
          kind: 'area',
          order: 1,
          aggregate: agg(0),
          directAggregate: agg(0),
          objectiveIds: [],
          children: [],
        },
      ],
    },
  ],
  objectives: [
    objective('o1', 'u2', 'a1'),
    objective('o2', 'u3', 'a1'),
    objective('o3', 'u2', null),
  ],
} as PlanningTreeDto;

const labels = (nodes: TreeNode[]) => nodes.map((n) => n.label);

describe('buildAxesTree', () => {
  const root = buildAxesTree(dto);

  it('arma Plan → Ejes (incluso vacíos) → "Sin eje"', () => {
    expect(root.label).toBe('Plan 2026');
    expect(labels(root.children)).toEqual(['Eje Salud', 'Eje vacío', 'Sin eje']);
  });

  it('cada eje agrupa sus objetivos bajo la unidad correspondiente', () => {
    const salud = root.children[0]!;
    expect(labels(salud.children)).toEqual(['Ministerio de Salud', 'Área vacía']);
    expect(labels(salud.children[0]!.children)).toEqual(['Objetivo o1']);
  });

  it('el eje sin objetivos queda marcado como vacío y sin números inventados', () => {
    const empty = root.children[1]!;
    expect(empty.isEmpty).toBe(true);
    expect(empty.caption).toBe('Sin objetivos');
    expect(empty.readings.result.progressBp).toBeNull();
    expect(empty.readings.execution.progressBp).toBeNull();
  });

  it('"Sin eje" agrupa sus objetivos bajo la unidad correspondiente', () => {
    const sinEje = root.children[2]!;
    expect(sinEje.kind).toBe('withoutAxis');
    expect(labels(sinEje.children)).toEqual(['Ministerio de Salud']);
  });

  it('muestra "Sin eje" aunque no tenga objetivos', () => {
    const tree = buildAxesTree({
      ...dto,
      withoutAxis: { aggregate: agg(0), objectiveIds: [], units: [] },
    });
    expect(labels(tree.children)).toEqual(['Eje Salud', 'Eje vacío', 'Sin eje']);
  });
});

describe('buildUnitsTree', () => {
  const root = buildUnitsTree(dto);

  it('arma Plan → unidades anidadas → objetivos directos', () => {
    expect(labels(root.children)).toEqual(['Central']);
    const central = root.children[0]!;
    expect(labels(central.children)).toEqual(['Ministerio de Salud', 'Área vacía']);
    expect(labels(central.children[0]!.children)).toEqual(['Objetivo o1']);
  });

  it('las unidades sin objetivos se marcan vacías', () => {
    expect(root.children[0]!.children[1]!.isEmpty).toBe(true);
  });

  it('usa el agregado del subárbol en la unidad', () => {
    expect(root.children[0]!.caption).toBe('2 objetivos');
  });
});

describe('nodos objetivo', () => {
  it('llevan las dos lecturas por separado y el link a la ficha', () => {
    const o = buildUnitsTree(dto).children[0]!.children[0]!.children[0]!;
    expect(o.href).toBe('/objectives/o1');
    expect(o.readings.result).toMatchObject({
      progressBp: 4000,
      semaphore: 'red',
      pendingBucketsCount: 2,
    });
    expect(o.readings.execution).toMatchObject({ progressBp: 6000, semaphore: 'green' });
  });

  it('las keys son únicas dentro de cada vista', () => {
    for (const view of ['axes', 'units'] as const) {
      const keys: string[] = [];
      const walk = (n: TreeNode) => {
        keys.push(n.key);
        n.children.forEach(walk);
      };
      walk(buildTree(dto, view));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('plan sin plan activo', () => {
  it('muestra el rótulo de sin plan', () => {
    const tree = buildAxesTree({ ...dto, plan: { ...dto.plan, id: null, title: null }, axes: [] });
    expect(tree.label).toBe('Sin plan de gobierno activo');
  });
});

describe('expandableKeys', () => {
  it('solo incluye nodos con hijos', () => {
    const keys = expandableKeys(buildUnitsTree(dto));
    expect(keys).toContain('plan');
    expect(keys).toContain('plan/u:u1/u:u2');
    expect(keys).not.toContain('plan/u:u1/u:u3');
  });
});

describe('buildAxisBoards', () => {
  const boards = buildAxisBoards(dto);

  it('da el tablero de cada eje con su desglose por unidad', () => {
    const b = boards['a1']!;
    expect(b.objectivesCount).toBe(2);
    expect(b.units.map((u) => u.name)).toEqual(['Ministerio de Salud', 'Área vacía']);
  });

  it('el eje vacío no tiene unidades ni valores', () => {
    expect(boards['a2']!.units).toEqual([]);
    expect(boards['a2']!.readings.result.progressBp).toBeNull();
  });
});
