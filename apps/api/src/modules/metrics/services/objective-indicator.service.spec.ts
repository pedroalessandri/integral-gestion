/**
 * ObjectiveIndicatorService: ABM (RN-P6, RN-P12/P14b, ADR-0009 D2/D8) y avance de RESULTADO (RN-P8).
 * Los puertos de `okr` se reemplazan por un fake sobre una base en memoria que usa la matemática REAL de
 * `okr-domain` y `metrics-domain` (sin mockear la cascada). `metrics` calcula el resultado agregado y avisa por el
 * evento `indicator.progress_changed` DESPUÉS del commit; acá se captura el evento y se prueba el orden.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ObjectiveIndicatorService } from './objective-indicator.service.js';

const ORG = 'org-1';
const D = (v: string) => ({ toString: () => v });
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

type Row = Record<string, unknown>;
let indicators: Row[];
let entries: Row[];
let metrics: Row[];
let points: Row[];
let contributionRows: Row[];
let liveProjectRows: Row[];
let committed: boolean;
let emitted: Array<{ name: string; payload: Record<string, unknown>; afterCommit: boolean }>;
let seq: number;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v !== null && typeof v === 'object' && 'not' in (v as Row)) return row[k] !== (v as Row)['not'];
    if (v !== null && typeof v === 'object' && 'in' in (v as Row)) return ((v as Row)['in'] as unknown[]).includes(row[k]);
    return row[k] === v;
  });
}
function table(rows: () => Row[]) {
  return {
    findMany: vi.fn(async ({ where = {} }: { where?: Row } = {}) => rows().filter((r) => matches(r, where))),
    // Copia: como la base real, lo leído antes de un update no cambia por el update.
    findFirst: vi.fn(async ({ where = {} }: { where?: Row } = {}) => {
      const found = rows().find((r) => matches(r, where));
      return found ? { ...found } : null;
    }),
    findFirstOrThrow: vi.fn(async ({ where = {} }: { where?: Row } = {}) => {
      const r = rows().find((x) => matches(x, where));
      if (!r) throw new Error('not found');
      return r;
    }),
  };
}

const tx = {
  $executeRaw: vi.fn().mockResolvedValue([]),
  objectiveIndicator: {
    ...table(() => indicators),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row: Row = {
        id: `oi-${++seq}`,
        expectedCurveMode: 'linear',
        deletedAt: null,
        createdAt: new Date('2027-01-01T00:00:00Z'),
        updatedAt: new Date('2027-01-01T00:00:00Z'),
        ...data,
        baselineValue: D(String(data['baselineValue'])),
        targetValue: D(String(data['targetValue'])),
      };
      indicators.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = indicators.find((r) => r['id'] === where.id) as Row;
      for (const [k, v] of Object.entries(data)) {
        row[k] = k === 'baselineValue' || k === 'targetValue' ? D(String(v)) : v;
      }
      return row;
    }),
  },
  metric: table(() => metrics),
  metricEntry: table(() => entries),
  projectContribution: table(() => contributionRows),
  indicatorTargetPoint: {
    ...table(() => points),
    deleteMany: vi.fn(async ({ where }: { where: Row }) => {
      points = points.filter((p) => !matches(p, where));
      return { count: 0 };
    }),
    createMany: vi.fn(async ({ data }: { data: Row[] }) => {
      for (const d of data) points.push({ id: `tp-${++seq}`, ...d, expectedValue: D(String(d['expectedValue'])) });
      return { count: data.length };
    }),
  },
};
// Orden de lectura de los DTO dentro del tx: usan las mismas tablas
const scoped = {
  objectiveIndicator: table(() => indicators),
  metric: table(() => metrics),
  metricEntry: table(() => entries),
  indicatorTargetPoint: table(() => points),
  period: {
    findFirst: vi.fn(async () => ({
      startsAt: new Date('2027-01-01T00:00:00Z'),
      endsAt: new Date('2027-12-31T00:00:00Z'),
    })),
  },
};
const prisma = {
  scoped,
  runInTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
    const result = await fn(tx);
    committed = true; // si fn lanza, nunca llega acá (rollback)
    return result;
  }),
};
const audit = { emit: vi.fn().mockResolvedValue(undefined) };
const lookup = { findLiveObjective: vi.fn(), filterLiveObjectiveIds: vi.fn() };
const eventEmitter = {
  emitAsync: vi.fn(async (name: string, payload: Record<string, unknown>) => {
    emitted.push({ name, payload, afterCommit: committed });
    return [];
  }),
};
/** Puerto `PROJECT_LINK_READER` fake (proyectos vivos). `from_indicator` se arma con `sourceObjectiveIndicatorId`. */
const projectLinks = {
  findLiveProjects: vi.fn(async (_org: string, ids: string[]) => liveProjectRows.filter((p) => ids.includes(p['id'] as string))),
  findLiveProjectsBySourceIndicator: vi.fn(async (_org: string, indicatorId: string) =>
    liveProjectRows.filter((p) => p['sourceObjectiveIndicatorId'] === indicatorId),
  ),
  findLiveProject: vi.fn(),
};
const metricService = {
  insertMetric: vi.fn(async (_tx: unknown, orgId: string, periodId: string, input: Row) => {
    const row: Row = {
      id: `m-new-${++seq}`,
      name: input['name'],
      periodId,
      organizationId: orgId,
      unit: input['unit'],
      direction: input['direction'],
      frequency: input['frequency'],
      kind: input['kind'],
      baselineValue: D(String(input['baselineValue'] ?? '0')),
      targetValue: D(String(input['targetValue'])),
    };
    metrics.push(row);
    return row;
  }),
};

function build(): ObjectiveIndicatorService {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new ObjectiveIndicatorService(
    prisma as any,
    audit as any,
    metricService as any,
    lookup as any,
    eventEmitter as any,
    projectLinks as any,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

function metric(id: string, extra: Row = {}): Row {
  return {
    id,
    name: id,
    periodId: 'period-1',
    organizationId: ORG,
    unit: 'number',
    direction: 'increasing',
    frequency: 'monthly',
    kind: 'output',
    baselineValue: D('0'),
    targetValue: D('100'),
    deletedAt: null,
    ...extra,
  };
}
function indicator(id: string, metricId: string, extra: Row = {}): Row {
  return {
    id,
    organizationId: ORG,
    objectiveId: 'obj-1',
    metricId,
    baselineValue: D('0'),
    targetValue: D('100'),
    direction: 'increasing',
    weightBp: null,
    expectedCurveMode: 'linear',
    linkMode: 'independent',
    progressCachedBp: 0,
    deletedAt: null,
    createdAt: new Date('2027-01-01T00:00:00Z'),
    updatedAt: new Date('2027-01-01T00:00:00Z'),
    ...extra,
  };
}
function entry(metricId: string, inc: string, extra: Row = {}): Row {
  return { metricId, organizationId: ORG, incrementValue: D(inc), deletedAt: null, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  indicators = [];
  entries = [];
  points = [];
  contributionRows = [];
  liveProjectRows = [];
  metrics = [metric('m-1'), metric('m-2')];
  committed = false;
  emitted = [];
  lookup.findLiveObjective.mockResolvedValue({
    id: 'obj-1',
    periodId: 'period-1',
    period: { id: 'period-1', code: '2027', status: 'open' },
  });
});

describe('create con métrica existente', () => {
  it('crea el indicador con base/meta/dirección de la métrica por defecto, audita y recalcula el resultado', async () => {
    entries.push(entry('m-1', '25'));
    const dto = await build().create('obj-1', ORG, { metricId: 'm-1' }, authCtx);

    expect(dto).toMatchObject({
      objectiveId: 'obj-1',
      metricId: 'm-1',
      baselineValue: '0',
      targetValue: '100',
      direction: 'increasing',
      weightBp: null,
      linkMode: 'independent',
      progressCachedBp: 2500,
      lastValue: '25',
      hasData: true,
    });
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'objective_indicator.created',
        entityType: 'metrics.objective_indicator',
        entityId: dto.id,
      }),
    );
    // Evento post-commit con el resultado agregado, organización y actor (el oyente no depende del ALS).
    expect(emitted).toEqual([
      {
        name: 'indicator.progress_changed',
        afterCommit: true,
        payload: {
          organizationId: ORG,
          actorId: 'user-1',
          requestId: 'req-1',
          objectiveIndicatorId: dto.id,
          objectiveId: 'obj-1',
          progressBp: 2500,
          objectiveResultProgressBp: 2500,
        },
      },
    ]);
  });

  it('el indicador manda: base y meta propias, no las de la métrica (D8)', async () => {
    entries.push(entry('m-1', '30'));
    const dto = await build().create('obj-1', ORG, { metricId: 'm-1', baselineValue: '10', targetValue: '50' }, authCtx);
    expect(dto.progressCachedBp).toBe(5000); // (30-10)/(50-10)
    expect(tx.objectiveIndicator.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG, baselineValue: '10' }) }),
    );
  });

  it('métrica de otro período -> 422 IndicatorPeriodMismatch', async () => {
    metrics.push(metric('m-x', { periodId: 'period-2' }));
    await expect(build().create('obj-1', ORG, { metricId: 'm-x' }, authCtx)).rejects.toThrow(/IndicatorPeriodMismatch/);
    expect(indicators).toHaveLength(0);
  });

  it('métrica inexistente o de otra org -> 404 (la query filtra por organizationId)', async () => {
    await expect(build().create('obj-1', ORG, { metricId: 'nope' }, authCtx)).rejects.toBeInstanceOf(NotFoundException);
    expect(scoped.metric.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, deletedAt: null }) }),
    );
  });

  it('el par (objetivo, métrica) no se repite -> 409', async () => {
    indicators.push(indicator('oi-0', 'm-1'));
    await expect(build().create('obj-1', ORG, { metricId: 'm-1' }, authCtx)).rejects.toBeInstanceOf(ConflictException);
  });

  it('objetivo inexistente -> 404; período cerrado -> 403', async () => {
    lookup.findLiveObjective.mockResolvedValueOnce(null);
    await expect(build().create('obj-9', ORG, { metricId: 'm-1' }, authCtx)).rejects.toBeInstanceOf(NotFoundException);
    expect(lookup.findLiveObjective).toHaveBeenCalledWith(ORG, 'obj-9');

    lookup.findLiveObjective.mockResolvedValueOnce({
      id: 'obj-1',
      periodId: 'period-1',
      period: { id: 'period-1', code: '2027', status: 'closed' },
    });
    await expect(build().create('obj-1', ORG, { metricId: 'm-1' }, authCtx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('base == meta -> 422', async () => {
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-1', baselineValue: '5', targetValue: '5' }, authCtx),
    ).rejects.toThrow(/IndicatorBaselineEqualsTarget/);
  });

  it('metricId y metric a la vez, o ninguno -> 422', async () => {
    const inline = { name: 'N', unit: 'number', frequency: 'monthly', kind: 'output' } as const;
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-1', metric: inline, targetValue: '1', direction: 'increasing' }, authCtx),
    ).rejects.toThrow(/IndicatorMetricSourceInvalid/);
    await expect(build().create('obj-1', ORG, {}, authCtx)).rejects.toThrow(/IndicatorMetricSourceInvalid/);
  });
});

describe('create con métrica nueva en un solo paso', () => {
  const inline = { name: 'Km de ciclovía', unit: 'number', frequency: 'monthly', kind: 'output' } as const;

  it('crea la métrica en el período del objetivo con base/meta/dirección del indicador, y audita ambas', async () => {
    const dto = await build().create(
      'obj-1',
      ORG,
      { metric: inline, baselineValue: '0', targetValue: '40', direction: 'increasing' },
      authCtx,
    );

    expect(metricService.insertMetric).toHaveBeenCalledWith(
      tx,
      ORG,
      'period-1',
      expect.objectContaining({ name: 'Km de ciclovía', direction: 'increasing', baselineValue: '0', targetValue: '40' }),
    );
    expect(dto.metricName).toBe('Km de ciclovía');
    expect(dto.progressCachedBp).toBe(0);
    expect(dto.hasData).toBe(false);
    expect(indicators).toHaveLength(1);
    expect(prisma.runInTransaction).toHaveBeenCalledTimes(1); // una sola transacción
  });

  it('falta targetValue o direction -> 422 y no se crea nada', async () => {
    await expect(build().create('obj-1', ORG, { metric: inline }, authCtx)).rejects.toThrow(/IndicatorTargetRequired/);
    expect(metricService.insertMetric).not.toHaveBeenCalled();
    expect(indicators).toHaveLength(0);
  });

  it('si falla la creación de la métrica (ej. nombre repetido) no queda el indicador', async () => {
    metricService.insertMetric.mockRejectedValueOnce(new ConflictException('nombre repetido'));
    await expect(
      build().create('obj-1', ORG, { metric: inline, targetValue: '40', direction: 'increasing' }, authCtx),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(indicators).toHaveLength(0);
  });
});

describe('RN-P12 / RN-P14b: execution_feeds_indicator solo con métricas output', () => {
  it('crear sobre una métrica outcome -> 422', async () => {
    metrics.push(metric('m-out', { kind: 'outcome' }));
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-out', linkMode: 'execution_feeds_indicator' }, authCtx),
    ).rejects.toThrow(/LinkModeRequiresOutputMetric/);
    expect(indicators).toHaveLength(0);
  });

  it('crear con métrica nueva outcome -> 422; con output -> ok', async () => {
    const base = { name: 'X', unit: 'number', frequency: 'monthly' } as const;
    await expect(
      build().create(
        'obj-1',
        ORG,
        { metric: { ...base, kind: 'outcome' }, targetValue: '1', direction: 'increasing', linkMode: 'execution_feeds_indicator' },
        authCtx,
      ),
    ).rejects.toThrow(/LinkModeRequiresOutputMetric/);
    const dto = await build().create(
      'obj-1',
      ORG,
      { metric: { ...base, kind: 'output' }, targetValue: '1', direction: 'increasing', linkMode: 'execution_feeds_indicator' },
      authCtx,
    );
    expect(dto.linkMode).toBe('execution_feeds_indicator');
  });

  it('editar el linkMode a execution_feeds_indicator sobre una métrica outcome -> 422; outcome puede ser independent/indicator_feeds_execution', async () => {
    metrics.push(metric('m-out', { kind: 'outcome' }));
    indicators.push(indicator('oi-1', 'm-out'));
    await expect(
      build().update('oi-1', ORG, { linkMode: 'execution_feeds_indicator' }, authCtx),
    ).rejects.toThrow(/LinkModeRequiresOutputMetric/);
    const dto = await build().update('oi-1', ORG, { linkMode: 'indicator_feeds_execution' }, authCtx);
    expect(dto.linkMode).toBe('indicator_feeds_execution');
  });
});

describe('dirección vs signo de (meta - base)', () => {
  it('create: increasing con meta < base, o decreasing con meta > base -> 422 IndicatorDirectionMismatch', async () => {
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-1', baselineValue: '50', targetValue: '10', direction: 'increasing' }, authCtx),
    ).rejects.toThrow(/IndicatorDirectionMismatch/);
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-1', baselineValue: '10', targetValue: '50', direction: 'decreasing' }, authCtx),
    ).rejects.toThrow(/IndicatorDirectionMismatch/);
    expect(indicators).toHaveLength(0);
  });

  it('create: con la dirección por defecto de la métrica (increasing) y una meta menor también falla', async () => {
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-1', baselineValue: '50', targetValue: '10' }, authCtx),
    ).rejects.toThrow(/IndicatorDirectionMismatch/);
  });

  it('create: coherentes (creciente y decreciente) se aceptan', async () => {
    await build().create('obj-1', ORG, { metricId: 'm-1', baselineValue: '10', targetValue: '50', direction: 'increasing' }, authCtx);
    await build().create('obj-1', ORG, { metricId: 'm-2', baselineValue: '50', targetValue: '10', direction: 'decreasing' }, authCtx);
    expect(indicators).toHaveLength(2);
  });

  it('update: valida con los valores efectivos después del merge', async () => {
    indicators.push(indicator('oi-1', 'm-1')); // 0 -> 100 creciente
    await expect(build().update('oi-1', ORG, { targetValue: '-5' }, authCtx)).rejects.toThrow(/IndicatorDirectionMismatch/);
    await expect(build().update('oi-1', ORG, { direction: 'decreasing' }, authCtx)).rejects.toThrow(/IndicatorDirectionMismatch/);
    // cambiar dirección y meta juntos es coherente
    const dto = await build().update('oi-1', ORG, { direction: 'decreasing', targetValue: '-5' }, authCtx);
    expect(dto.direction).toBe('decreasing');
  });
});

describe('pesos todo-o-nada (RN-P6)', () => {
  it('crear sin peso en un grupo ponderado -> 422 MixedWeightGroup', async () => {
    indicators.push(indicator('oi-1', 'm-1', { weightBp: 10000 }));
    await expect(build().create('obj-1', ORG, { metricId: 'm-2' }, authCtx)).rejects.toThrow(/MixedWeightGroup/);
  });

  it('crear con peso en un grupo sin pesos -> 422 MixedWeightGroup', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    await expect(build().create('obj-1', ORG, { metricId: 'm-2', weightBp: 5000 }, authCtx)).rejects.toThrow(
      /MixedWeightGroup/,
    );
  });

  it('primer indicador con peso 10000 es válido', async () => {
    const dto = await build().create('obj-1', ORG, { metricId: 'm-1', weightBp: 10000 }, authCtx);
    expect(dto.weightBp).toBe(10000);
  });

  it('PUT weights: pasa de sin pesos a ponderado y el resultado usa el promedio ponderado', async () => {
    indicators.push(indicator('oi-1', 'm-1', { progressCachedBp: 10000 }), indicator('oi-2', 'm-2', { progressCachedBp: 0 }));
    const items = await build().setWeights(
      'obj-1',
      ORG,
      { weights: [{ id: 'oi-1', weightBp: 7000 }, { id: 'oi-2', weightBp: 3000 }] },
      authCtx,
    );
    expect(items.map((i) => i.weightBp)).toEqual([7000, 3000]);
    expect(emitted.map((e) => e.payload['objectiveResultProgressBp'])).toEqual([7000, 7000]);
    expect(emitted.every((e) => e.afterCommit)).toBe(true);
    expect(audit.emit).toHaveBeenCalledTimes(2);
  });

  it('PUT weights: mixto, suma != 10000 o set de hermanos distinto -> 422', async () => {
    indicators.push(indicator('oi-1', 'm-1'), indicator('oi-2', 'm-2'));
    await expect(
      build().setWeights('obj-1', ORG, { weights: [{ id: 'oi-1', weightBp: 10000 }, { id: 'oi-2', weightBp: null }] }, authCtx),
    ).rejects.toThrow(/MixedWeightGroup/);
    await expect(
      build().setWeights('obj-1', ORG, { weights: [{ id: 'oi-1', weightBp: 5000 }, { id: 'oi-2', weightBp: 4000 }] }, authCtx),
    ).rejects.toThrow(/WeightSumInvalid/);
    await expect(
      build().setWeights('obj-1', ORG, { weights: [{ id: 'oi-1', weightBp: 10000 }] }, authCtx),
    ).rejects.toThrow(/WeightsSetMismatch/);
  });

  it('PUT weights: todos null quita los pesos y vuelve al promedio simple', async () => {
    indicators.push(
      indicator('oi-1', 'm-1', { weightBp: 7000, progressCachedBp: 10000 }),
      indicator('oi-2', 'm-2', { weightBp: 3000, progressCachedBp: 0 }),
    );
    await build().setWeights('obj-1', ORG, { weights: [{ id: 'oi-1', weightBp: null }, { id: 'oi-2', weightBp: null }] }, authCtx);
    expect(emitted.at(-1)?.payload['objectiveResultProgressBp']).toBe(5000);
  });

  it('cambiar el peso de uno solo en un grupo ponderado -> 422 (se usa el PUT en bloque)', async () => {
    indicators.push(indicator('oi-1', 'm-1', { weightBp: 5000 }), indicator('oi-2', 'm-2', { weightBp: 5000 }));
    await expect(build().update('oi-1', ORG, { weightBp: 6000 }, authCtx)).rejects.toThrow(/WeightSumInvalid/);
  });

  it('borrar de un grupo ponderado que no queda en 10000 -> 422; sin pesos -> ok', async () => {
    indicators.push(indicator('oi-1', 'm-1', { weightBp: 5000 }), indicator('oi-2', 'm-2', { weightBp: 5000 }));
    await expect(build().softDelete('oi-1', ORG, authCtx)).rejects.toThrow(/WeightSumInvalid/);

    indicators.forEach((i) => (i['weightBp'] = null));
    await build().softDelete('oi-1', ORG, authCtx);
    expect(indicators.find((i) => i['id'] === 'oi-1')?.['deletedAt']).toBeInstanceOf(Date);
  });
});

describe('update / softDelete', () => {
  it('cambiar base/meta recalcula el avance del indicador y el resultado del objetivo, y audita el diff', async () => {
    entries.push(entry('m-1', '50'));
    indicators.push(indicator('oi-1', 'm-1', { progressCachedBp: 5000 }));
    const dto = await build().update('oi-1', ORG, { targetValue: '200' }, authCtx);

    expect(dto.progressCachedBp).toBe(2500);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ afterCommit: true, payload: { progressBp: 2500, objectiveResultProgressBp: 2500 } });
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'objective_indicator.updated',
        diff: { before: { targetValue: '100' }, after: { targetValue: '200' } },
      }),
    );
  });

  it('un update sin cambios no emite evento', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    await build().update('oi-1', ORG, { targetValue: '100' }, authCtx);
    expect(audit.emit).not.toHaveBeenCalled();
  });

  it('indicador de otra org o inexistente -> 404 (filtra por organizationId)', async () => {
    await expect(build().update('nope', ORG, { weightBp: null }, authCtx)).rejects.toBeInstanceOf(NotFoundException);
    expect(scoped.objectiveIndicator.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, deletedAt: null }) }),
    );
  });

  it('borrar audita objective_indicator.deleted y recalcula el resultado (grupo vacío -> 0)', async () => {
    indicators.push(indicator('oi-1', 'm-1', { progressCachedBp: 8000 }));
    await build().softDelete('oi-1', ORG, authCtx);
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'objective_indicator.deleted', entityId: 'oi-1' }),
    );
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ afterCommit: true, payload: { objectiveIndicatorId: 'oi-1', objectiveResultProgressBp: 0 } });
  });

  it('período cerrado -> 403 en update y delete', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    lookup.findLiveObjective.mockResolvedValue({
      id: 'obj-1',
      periodId: 'period-1',
      period: { id: 'period-1', code: '2027', status: 'closed' },
    });
    await expect(build().update('oi-1', ORG, { weightBp: null }, authCtx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build().softDelete('oi-1', ORG, authCtx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('recomputeForMetric (hook de cargas, RN-P8)', () => {
  const actor = { userId: 'user-1', requestId: 'req-1' };

  it('recalcula cada indicador con SU base/meta y devuelve un evento por indicador con el resultado de su objetivo', async () => {
    indicators.push(
      indicator('oi-1', 'm-1'),
      indicator('oi-2', 'm-1', { objectiveId: 'obj-2', baselineValue: D('0'), targetValue: D('50') }),
    );
    entries.push(entry('m-1', '20'), entry('m-1', '5'));

    const events = await build().recomputeForMetric(tx as never, 'm-1', ORG, actor);

    expect(indicators[0]?.['progressCachedBp']).toBe(2500); // 25 / 100
    expect(indicators[1]?.['progressCachedBp']).toBe(5000); // 25 / 50
    expect(events.map((e) => [e.objectiveId, e.progressBp, e.objectiveResultProgressBp])).toEqual([
      ['obj-1', 2500, 2500],
      ['obj-2', 5000, 5000],
    ]);
    expect(emitted).toHaveLength(0); // no publica: lo hace el llamador después del commit
  });

  it('el resultado del evento es el promedio del grupo del objetivo (simple y ponderado)', async () => {
    indicators.push(
      indicator('oi-1', 'm-1'),
      indicator('oi-2', 'm-2', { progressCachedBp: 10000 }),
    );
    entries.push(entry('m-1', '50'));
    const simple = await build().recomputeForMetric(tx as never, 'm-1', ORG, actor);
    expect(simple[0]?.objectiveResultProgressBp).toBe(7500);

    indicators[0]!['weightBp'] = 2000;
    indicators[1]!['weightBp'] = 8000;
    const weighted = await build().recomputeForMetric(tx as never, 'm-1', ORG, actor);
    expect(weighted[0]?.objectiveResultProgressBp).toBe(9000); // 0.2*5000 + 0.8*10000
  });

  it('bloquea los grupos en orden de objectiveId antes de escribir', async () => {
    indicators.push(
      indicator('oi-1', 'm-1', { objectiveId: 'obj-b' }),
      indicator('oi-2', 'm-1', { objectiveId: 'obj-a' }),
    );
    entries.push(entry('m-1', '10'));
    await build().recomputeForMetric(tx as never, 'm-1', ORG, actor);
    const locked = tx.$executeRaw.mock.calls.map((c) => (c as unknown[])[1]);
    expect(locked).toEqual(['obj-a', 'obj-b']);
  });

  it('borrar la última carga vuelve el avance a 0 (sin datos); las cargas borradas no cuentan', async () => {
    indicators.push(indicator('oi-1', 'm-1', { progressCachedBp: 3000 }));
    entries.push(entry('m-1', '30', { deletedAt: new Date() }));
    const events = await build().recomputeForMetric(tx as never, 'm-1', ORG, actor);
    expect(indicators[0]?.['progressCachedBp']).toBe(0);
    expect(events[0]).toMatchObject({ progressBp: 0, objectiveResultProgressBp: 0 });
  });

  it('indicador decreciente: la meta menor que la base da avance correcto', async () => {
    metrics[0] = metric('m-1', { baselineValue: D('100') });
    indicators.push(
      indicator('oi-1', 'm-1', { baselineValue: D('100'), targetValue: D('20'), direction: 'decreasing' }),
    );
    entries.push(entry('m-1', '-40'));
    await build().recomputeForMetric(tx as never, 'm-1', ORG, actor);
    expect(indicators[0]?.['progressCachedBp']).toBe(5000);
  });

  it('métrica sin indicadores de objetivo: no-op sin eventos', async () => {
    expect(await build().recomputeForMetric(tx as never, 'm-1', ORG, actor)).toEqual([]);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('las queries del hook filtran por organizationId', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    await build().recomputeForMetric(tx as never, 'm-1', ORG, actor);
    expect(tx.objectiveIndicator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
    expect(tx.metricEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
  });
});

describe('publishProgressChanged / emisión después del commit', () => {
  it('si la transacción falla no se emite ningún evento', async () => {
    indicators.push(indicator('oi-1', 'm-1', { weightBp: 5000 }), indicator('oi-2', 'm-2', { weightBp: 5000 }));
    await expect(build().softDelete('oi-1', ORG, authCtx)).rejects.toThrow(/WeightSumInvalid/);
    await expect(build().create('obj-1', ORG, { metricId: 'm-x' }, authCtx)).rejects.toBeDefined();
    expect(emitted).toHaveLength(0);
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('si el oyente falla se loguea y no revierte ni rompe la respuesta (la escritura ya está confirmada)', async () => {
    eventEmitter.emitAsync.mockRejectedValueOnce(new Error('listener down'));
    const dto = await build().create('obj-1', ORG, { metricId: 'm-1' }, authCtx);
    expect(dto.metricId).toBe('m-1');
    expect(indicators).toHaveLength(1);
  });
});

describe('listByObjective', () => {
  it('lista con valor actual, "sin datos" y filtra por organizationId', async () => {
    indicators.push(indicator('oi-1', 'm-1', { progressCachedBp: 2500 }), indicator('oi-2', 'm-2'));
    entries.push(entry('m-1', '25'));
    const items = await build().listByObjective('obj-1', ORG);
    expect(items.map((i) => [i.id, i.lastValue, i.hasData])).toEqual([
      ['oi-1', '25', true],
      ['oi-2', '0', false],
    ]);
    expect(scoped.objectiveIndicator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, deletedAt: null }) }),
    );
  });

  it('objetivo inexistente -> 404', async () => {
    lookup.findLiveObjective.mockResolvedValueOnce(null);
    await expect(build().listByObjective('nope', ORG)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('curva esperada (RN-P17)', () => {
  const valid = [
    { bucketDate: '2027-06-01', expectedValue: '40' },
    { bucketDate: '2027-12-01', expectedValue: '100' },
  ];

  it('create sin modo: queda en linear y no toca puntos', async () => {
    const dto = await build().create('obj-1', ORG, { metricId: 'm-1' }, authCtx);
    expect(dto.expectedCurveMode).toBe('linear');
    expect(points).toHaveLength(0);
    expect(tx.indicatorTargetPoint.createMany).not.toHaveBeenCalled();
  });

  it('create manual con puntos válidos: guarda los puntos ordenados y audita created + replaced', async () => {
    const dto = await build().create(
      'obj-1',
      ORG,
      { metricId: 'm-1', expectedCurveMode: 'manual', targetPoints: [valid[1] as never, valid[0] as never] },
      authCtx,
    );
    expect(dto.expectedCurveMode).toBe('manual');
    expect(points.map((p) => [p['objectiveIndicatorId'], p['organizationId']])).toEqual([
      [dto.id, ORG],
      [dto.id, ORG],
    ]);
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'objective_indicator.created',
        diff: expect.objectContaining({ after: expect.objectContaining({ expectedCurveMode: 'manual' }) }),
      }),
    );
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'indicator_target_points.replaced',
        entityId: dto.id,
        diff: { before: { points: [] }, after: { points: valid } },
      }),
    );
  });

  it('create manual sin puntos -> 422', async () => {
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-1', expectedCurveMode: 'manual' }, authCtx),
    ).rejects.toThrow(/IndicatorTargetPointsInvalid/);
    expect(indicators).toHaveLength(0);
  });

  it('from_projects: solo para output con execution_feeds_indicator; en otro caso 422 ExpectedCurveModeNotAvailable', async () => {
    // Sin vínculo de ejecución (independent), aunque sea output.
    await expect(
      build().create('obj-1', ORG, { metricId: 'm-1', expectedCurveMode: 'from_projects' }, authCtx),
    ).rejects.toThrow(/ExpectedCurveModeNotAvailable/);
    indicators.push(indicator('oi-1', 'm-1'));
    await expect(build().update('oi-1', ORG, { expectedCurveMode: 'from_projects' }, authCtx)).rejects.toThrow(
      /ExpectedCurveModeNotAvailable/,
    );
    // Métrica outcome: ni siquiera con el vínculo (que de por sí se rechaza antes).
    metrics.push(metric('m-out', { kind: 'outcome' }));
    indicators.push(indicator('oi-out', 'm-out'));
    await expect(
      build().update('oi-out', ORG, { expectedCurveMode: 'from_projects', linkMode: 'indicator_feeds_execution' }, authCtx),
    ).rejects.toThrow(/ExpectedCurveModeNotAvailable/);
    expect(indicators.map((i) => i['expectedCurveMode'])).toEqual(['linear', 'linear']);
  });

  it('from_projects se puede crear y editar sobre output con execution_feeds_indicator', async () => {
    const created = await build().create(
      'obj-1',
      ORG,
      { metricId: 'm-1', linkMode: 'execution_feeds_indicator', expectedCurveMode: 'from_projects' },
      authCtx,
    );
    expect(created).toMatchObject({ expectedCurveMode: 'from_projects', linkMode: 'execution_feeds_indicator' });

    indicators.push(indicator('oi-2', 'm-2', { linkMode: 'execution_feeds_indicator' }));
    const updated = await build().update('oi-2', ORG, { expectedCurveMode: 'from_projects' }, authCtx);
    expect(updated.expectedCurveMode).toBe('from_projects');
  });

  it('un indicador en from_projects no puede perder el vínculo de ejecución (curva sin aportes)', async () => {
    indicators.push(indicator('oi-1', 'm-1', { linkMode: 'execution_feeds_indicator', expectedCurveMode: 'from_projects' }));
    await expect(build().update('oi-1', ORG, { linkMode: 'independent' }, authCtx)).rejects.toThrow(
      /ExpectedCurveModeNotAvailable/,
    );
    const dto = await build().update('oi-1', ORG, { linkMode: 'independent', expectedCurveMode: 'linear' }, authCtx);
    expect(dto).toMatchObject({ linkMode: 'independent', expectedCurveMode: 'linear' });
  });

  it('el último punto debe ser igual a la meta (RN-P17)', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    await expect(
      build().setTargetPoints('oi-1', ORG, { points: [{ bucketDate: '2027-12-01', expectedValue: '90' }] }, authCtx),
    ).rejects.toThrow(/último punto.*igual a la meta/);
    expect(points).toHaveLength(0);
  });

  it('fecha que no es inicio de bucket, fecha inexistente y bucket repetido -> 422', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    const set = (p: Array<{ bucketDate: string; expectedValue: string }>) =>
      build().setTargetPoints('oi-1', ORG, { points: p }, authCtx);
    await expect(set([{ bucketDate: '2027-06-15', expectedValue: '100' }])).rejects.toThrow(/no es el inicio de un bucket/);
    await expect(set([{ bucketDate: '2027-02-30', expectedValue: '100' }])).rejects.toThrow(/no es una fecha válida/);
    await expect(
      set([
        { bucketDate: '2027-06-01', expectedValue: '100' },
        { bucketDate: '2027-06-01', expectedValue: '100' },
      ]),
    ).rejects.toThrow(/más de un punto/);
  });

  it('PUT reemplaza los puntos, audita before/after y vuelve a ser no-op si no cambian', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    const svc = build();
    const out = await svc.setTargetPoints('oi-1', ORG, { points: valid }, authCtx);
    expect(out).toEqual(valid);
    expect(points.every((p) => p['organizationId'] === ORG)).toBe(true);
    expect(audit.emit).toHaveBeenCalledTimes(1);

    await svc.setTargetPoints('oi-1', ORG, { points: valid }, authCtx);
    expect(audit.emit).toHaveBeenCalledTimes(1); // sin cambios: sin audit

    await svc.setTargetPoints('oi-1', ORG, { points: [{ bucketDate: '2027-12-01', expectedValue: '100' }] }, authCtx);
    expect(audit.emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'indicator_target_points.replaced',
        diff: { before: { points: valid }, after: { points: [{ bucketDate: '2027-12-01', expectedValue: '100' }] } },
      }),
    );
  });

  it('un indicador manual no puede quedarse sin puntos', async () => {
    indicators.push(indicator('oi-1', 'm-1', { expectedCurveMode: 'manual' }));
    await expect(build().setTargetPoints('oi-1', ORG, { points: [] }, authCtx)).rejects.toThrow(
      /IndicatorTargetPointsInvalid/,
    );
  });

  it('pasar a manual sin puntos guardados -> 422; con puntos guardados válidos -> ok', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    await expect(build().update('oi-1', ORG, { expectedCurveMode: 'manual' }, authCtx)).rejects.toThrow(
      /IndicatorTargetPointsInvalid/,
    );

    points.push(
      { id: 'tp-a', organizationId: ORG, objectiveIndicatorId: 'oi-1', bucketDate: new Date('2027-12-01T00:00:00Z'), expectedValue: D('100') },
    );
    const dto = await build().update('oi-1', ORG, { expectedCurveMode: 'manual' }, authCtx);
    expect(dto.expectedCurveMode).toBe('manual');
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'objective_indicator.updated',
        diff: { before: { expectedCurveMode: 'linear' }, after: { expectedCurveMode: 'manual' } },
      }),
    );
  });

  it('en modo manual, cambiar la meta sin ajustar los puntos -> 422; ajustándolos en el mismo PATCH -> ok', async () => {
    indicators.push(indicator('oi-1', 'm-1', { expectedCurveMode: 'manual' }));
    points.push(
      { id: 'tp-a', organizationId: ORG, objectiveIndicatorId: 'oi-1', bucketDate: new Date('2027-12-01T00:00:00Z'), expectedValue: D('100') },
    );
    await expect(build().update('oi-1', ORG, { targetValue: '200' }, authCtx)).rejects.toThrow(/igual a la meta/);

    const dto = await build().update(
      'oi-1',
      ORG,
      { targetValue: '200', targetPoints: [{ bucketDate: '2027-12-01', expectedValue: '200' }] },
      authCtx,
    );
    expect(dto.targetValue).toBe('200');
    expect(points.map((p) => p['expectedValue']?.toString())).toEqual(['200']);
  });

  it('indicador de otra organización -> 404 al pedir o reemplazar puntos', async () => {
    await expect(build().getTargetPoints('nope', ORG)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build().setTargetPoints('nope', ORG, { points: [] }, authCtx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getTargetPoints filtra por organizationId y devuelve fechas YYYY-MM-DD', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    points.push({ id: 'tp-a', organizationId: ORG, objectiveIndicatorId: 'oi-1', bucketDate: new Date('2027-12-01T00:00:00Z'), expectedValue: D('100') });
    expect(await build().getTargetPoints('oi-1', ORG)).toEqual([{ bucketDate: '2027-12-01', expectedValue: '100' }]);
    expect(scoped.indicatorTargetPoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, objectiveIndicatorId: 'oi-1' }) }),
    );
  });
});

describe('proyectos vinculados vigentes (ADR-0009 D5 regla 3)', () => {
  beforeEach(() => {
    indicators.push(indicator('oi-1', 'm-1', { linkMode: 'execution_feeds_indicator' }));
    contributionRows.push({ id: 'pc-1', organizationId: ORG, objectiveIndicatorId: 'oi-1', projectId: 'p-1' });
    liveProjectRows.push({ id: 'p-1', title: 'Ciclovía Av. Y', sourceObjectiveIndicatorId: null });
  });

  it('cambiar el linkMode con aportes vigentes -> 422 con la lista de proyectos', async () => {
    const error = await build()
      .update('oi-1', ORG, { linkMode: 'independent' }, authCtx)
      .catch((e: unknown) => e as { getResponse(): Record<string, unknown> });
    expect((error as Error).message).toMatch(/IndicatorHasLinkedProjects.*Ciclovía Av\. Y/);
    expect((error.getResponse()['details'] as Record<string, unknown>)['projects']).toEqual([{ id: 'p-1', title: 'Ciclovía Av. Y', link: 'contribution' }]);
    expect(indicators[0]?.['linkMode']).toBe('execution_feeds_indicator');
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('borrar el indicador con aportes vigentes -> 422; el aporte de un proyecto borrado ya no cuenta', async () => {
    await expect(build().softDelete('oi-1', ORG, authCtx)).rejects.toThrow(/IndicatorHasLinkedProjects/);
    expect(indicators[0]?.['deletedAt']).toBeNull();

    liveProjectRows = []; // el proyecto se borró: su aporte no está vigente
    await expect(build().softDelete('oi-1', ORG, authCtx)).resolves.toBeUndefined();
    expect(indicators[0]?.['deletedAt']).toBeInstanceOf(Date);
  });

  it('proyectos from_indicator que toman su avance del indicador también bloquean (lado indicator_feeds_execution)', async () => {
    indicators.push(indicator('oi-2', 'm-2', { linkMode: 'indicator_feeds_execution' }));
    liveProjectRows.push({ id: 'p-2', title: 'Tramo B', sourceObjectiveIndicatorId: 'oi-2' });
    await expect(build().update('oi-2', ORG, { linkMode: 'independent' }, authCtx)).rejects.toThrow(/Tramo B/);
    await expect(build().softDelete('oi-2', ORG, authCtx)).rejects.toThrow(/IndicatorHasLinkedProjects/);
  });

  it('sin proyectos vinculados el cambio de vínculo y el borrado siguen funcionando; editar otros campos no consulta', async () => {
    contributionRows = [];
    const dto = await build().update('oi-1', ORG, { linkMode: 'independent' }, authCtx);
    expect(dto.linkMode).toBe('independent');

    projectLinks.findLiveProjects.mockClear();
    await build().update('oi-1', ORG, { weightBp: null }, authCtx);
    expect(projectLinks.findLiveProjects).not.toHaveBeenCalled();
  });
});
