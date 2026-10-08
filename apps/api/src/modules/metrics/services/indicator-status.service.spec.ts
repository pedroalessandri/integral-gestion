/**
 * IndicatorStatusService: estado de indicador y de objetivo (RN-P9, RN-P15, RN-P17). La matemática es la REAL de
 * `metrics-domain` / `deviation-domain`; solo se fakean las lecturas (tablas en memoria) y el puerto de `okr`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { IndicatorStatusService } from './indicator-status.service.js';

const ORG = 'org-1';
const D = (v: string) => ({ toString: () => v });
const d = (s: string) => new Date(`${s}T00:00:00Z`);

type Row = Record<string, unknown>;
let indicators: Row[];
let metrics: Row[];
let entries: Row[];
let points: Row[];

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v !== null && typeof v === 'object' && 'in' in (v as Row)) return ((v as Row)['in'] as unknown[]).includes(row[k]);
    return row[k] === v;
  });
}
function table(rows: () => Row[]) {
  return {
    findMany: vi.fn(async ({ where = {} }: { where?: Row } = {}) => rows().filter((r) => matches(r, where))),
    findFirst: vi.fn(async ({ where = {} }: { where?: Row } = {}) => rows().find((r) => matches(r, where)) ?? null),
  };
}
const scoped = {
  objectiveIndicator: table(() => indicators),
  metric: table(() => metrics),
  metricEntry: table(() => entries),
  indicatorTargetPoint: table(() => points),
  period: table(() => [{ id: 'period-1', organizationId: ORG, startsAt: d('2027-01-01'), endsAt: d('2027-12-31') }]),
};
const lookup = { findLiveObjective: vi.fn(), filterLiveObjectiveIds: vi.fn() };
const reader = { readObjectiveProgress: vi.fn() };

function build(): IndicatorStatusService {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new IndicatorStatusService({ scoped } as any, lookup as any, reader as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

function metric(id: string, extra: Row = {}): Row {
  return { id, organizationId: ORG, periodId: 'period-1', frequency: 'monthly', baselineValue: D('0'), ...extra };
}
function indicator(id: string, metricId: string, extra: Row = {}): Row {
  return {
    id,
    organizationId: ORG,
    objectiveId: 'obj-1',
    metricId,
    baselineValue: D('0'),
    targetValue: D('100'),
    weightBp: null,
    expectedCurveMode: 'manual',
    deletedAt: null,
    createdAt: d('2027-01-01'),
    ...extra,
  };
}
function entry(metricId: string, bucket: string, inc: string): Row {
  return { metricId, organizationId: ORG, bucketDate: d(bucket), incrementValue: D(inc), deletedAt: null };
}
function point(indicatorId: string, bucket: string, value: string): Row {
  return { objectiveIndicatorId: indicatorId, organizationId: ORG, bucketDate: d(bucket), expectedValue: D(value) };
}

const NOW = new Date('2027-08-20T15:30:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  indicators = [];
  metrics = [metric('m-1'), metric('m-2')];
  entries = [];
  points = [point('oi-1', '2027-06-01', '50'), point('oi-1', '2027-12-01', '100')];
  lookup.findLiveObjective.mockResolvedValue({ id: 'obj-1', periodId: 'period-1', period: { id: 'period-1', code: '2027', status: 'open' } });
  reader.readObjectiveProgress.mockResolvedValue({
    resultProgressBp: 3000,
    executionProgressBp: 4000,
    plannedExecutionProgressBp: 5000,
  });
});

describe('getIndicatorStatus', () => {
  it('mide el desvío en el último bucket cargado contra la curva manual, con semáforo', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    entries.push(entry('m-1', '2027-06-01', '30'));
    const status = await build().getIndicatorStatus('oi-1', ORG, NOW);

    expect(status).toMatchObject({
      objectiveIndicatorId: 'oi-1',
      expectedCurveMode: 'manual',
      hasData: true,
      asOf: '2027-06-01',
      actualValue: '30',
      expectedValue: '50',
      deviationBp: -2000,
      semaphore: 'yellow',
      graceDays: 10,
    });
    // Esperado HOY (20/8): interpolado entre (1/6, 50) y (1/12, 100).
    expect(Number(status.expectedToday)).toBeGreaterThan(50);
    expect(Number(status.expectedToday)).toBeLessThan(100);
  });

  it('bordes del semáforo: -10 puntos exactos verde, -25 exactos amarillo, por debajo rojo; adelantado verde', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    const run = async (value: string) => {
      entries = [entry('m-1', '2027-06-01', value)];
      return build().getIndicatorStatus('oi-1', ORG, NOW);
    };
    expect(await run('40')).toMatchObject({ deviationBp: -1000, semaphore: 'green' });
    expect(await run('25')).toMatchObject({ deviationBp: -2500, semaphore: 'yellow' });
    expect(await run('24.9')).toMatchObject({ deviationBp: -2510, semaphore: 'red' });
    expect(await run('80')).toMatchObject({ deviationBp: 3000, semaphore: 'green' });
  });

  it('sin cargas: sin desvío ni semáforo, y los buckets cerrados están todos pendientes', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    const status = await build().getIndicatorStatus('oi-1', ORG, NOW);
    expect(status).toMatchObject({
      hasData: false,
      asOf: null,
      expectedValue: null,
      deviationBp: null,
      semaphore: null,
      actualValue: '0',
    });
    // 1/ene..1/jul cerraron hace más de 10 días (jul cierra el 1/8; hoy es el 20/8).
    expect(status.pendingBuckets).toEqual([
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-01',
      '2027-05-01',
      '2027-06-01',
      '2027-07-01',
    ]);
  });

  it('buckets pendientes: solo los cerrados hace más de 10 días y sin carga', async () => {
    indicators.push(indicator('oi-1', 'm-1'));
    entries.push(...['01', '02', '03', '04', '06'].map((m) => entry('m-1', `2027-${m}-01`, '1')));
    const status = await build().getIndicatorStatus('oi-1', ORG, NOW);
    expect(status.pendingBuckets).toEqual(['2027-05-01', '2027-07-01']);
    // El bucket de mayo cierra el 1/6: el 8/6 sigue dentro de la gracia (7 días); el 12/6 ya venció (11 días).
    const withinGrace = await build().getIndicatorStatus('oi-1', ORG, new Date('2027-06-08T00:00:00Z'));
    expect(withinGrace.pendingBuckets).toEqual([]);
    const expired = await build().getIndicatorStatus('oi-1', ORG, new Date('2027-06-12T00:00:00Z'));
    expect(expired.pendingBuckets).toEqual(['2027-05-01']);
  });

  it('modo linear usa la recta base -> meta con la base y meta del INDICADOR (D8)', async () => {
    indicators.push(indicator('oi-2', 'm-2', { expectedCurveMode: 'linear', baselineValue: D('10'), targetValue: D('110') }));
    entries.push(entry('m-2', '2027-01-01', '30')); // métrica: base 0 -> acumulado 30
    const status = await build().getIndicatorStatus('oi-2', ORG, NOW);
    expect(status.expectedCurveMode).toBe('linear');
    expect(status.expectedValue).toBe('10'); // en el inicio del período, la base del indicador
    expect(status.deviationBp).toBe(2000); // (30 - 10) / (110 - 10)
    expect(status.semaphore).toBe('green');
  });

  it('indicador inexistente, borrado o de otra org -> 404, y la lectura filtra por organizationId', async () => {
    indicators.push(indicator('oi-1', 'm-1', { organizationId: 'otra-org' }));
    await expect(build().getIndicatorStatus('oi-1', ORG, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(scoped.objectiveIndicator.findFirst).toHaveBeenCalledWith({
      where: { id: 'oi-1', organizationId: ORG, deletedAt: null },
    });
  });
});

describe('getObjectiveStatus', () => {
  it('devuelve las dos lecturas por separado, cada una con su desvío y semáforo', async () => {
    indicators.push(indicator('oi-1', 'm-1'), indicator('oi-2', 'm-2', { expectedCurveMode: 'linear' }));
    entries.push(entry('m-1', '2027-06-01', '30')); // m-2 sin datos
    const status = await build().getObjectiveStatus('obj-1', ORG, NOW);

    expect(status.objectiveId).toBe('obj-1');
    expect(status.asOf).toBe(NOW.toISOString());
    expect(status.result).toMatchObject({
      progressBp: 3000,
      deviationBp: -2000, // el indicador sin datos no cuenta
      semaphore: 'yellow',
    });
    expect(status.result.indicators.map((i) => i.objectiveIndicatorId)).toEqual(['oi-1', 'oi-2']);
    expect(status.result.pendingBucketsCount).toBe(
      (status.result.indicators[0]?.pendingBuckets.length ?? 0) + (status.result.indicators[1]?.pendingBuckets.length ?? 0),
    );
    expect(status.execution).toEqual({ progressBp: 4000, plannedBp: 5000, deviationBp: -1000, semaphore: 'green' });
    // Nunca un número único que mezcle las dos lecturas.
    expect(Object.keys(status).sort()).toEqual(['asOf', 'execution', 'objectiveId', 'result']);
  });

  it('el desvío de resultado pondera con los pesos de los indicadores cuando todos los tienen', async () => {
    indicators.push(
      indicator('oi-1', 'm-1', { weightBp: 7000 }),
      indicator('oi-2', 'm-2', { weightBp: 3000, expectedCurveMode: 'manual' }),
    );
    points.push(point('oi-2', '2027-06-01', '50'), point('oi-2', '2027-12-01', '100'));
    entries.push(entry('m-1', '2027-06-01', '40'), entry('m-2', '2027-06-01', '20')); // -1000 y -3000
    const status = await build().getObjectiveStatus('obj-1', ORG, NOW);
    expect(status.result.deviationBp).toBe(-1600); // (7000*-1000 + 3000*-3000) / 10000
    expect(status.result.semaphore).toBe('yellow');
  });

  it('gestión atrasada más de 25 puntos es roja; objetivo sin indicadores no tiene desvío de resultado', async () => {
    reader.readObjectiveProgress.mockResolvedValue({
      resultProgressBp: 0,
      executionProgressBp: 2000,
      plannedExecutionProgressBp: 5000,
    });
    const status = await build().getObjectiveStatus('obj-1', ORG, NOW);
    expect(status.execution).toMatchObject({ deviationBp: -3000, semaphore: 'red' });
    expect(status.result).toMatchObject({ deviationBp: null, semaphore: null, pendingBucketsCount: 0, indicators: [] });
  });

  it('objetivo inexistente (o de otra org) -> 404 y se consulta por organizationId', async () => {
    lookup.findLiveObjective.mockResolvedValue(null);
    await expect(build().getObjectiveStatus('nope', ORG, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(lookup.findLiveObjective).toHaveBeenCalledWith(ORG, 'nope');

    lookup.findLiveObjective.mockResolvedValue({ id: 'obj-1' });
    reader.readObjectiveProgress.mockResolvedValue(null);
    await expect(build().getObjectiveStatus('obj-1', ORG, NOW)).rejects.toBeInstanceOf(NotFoundException);
    expect(reader.readObjectiveProgress).toHaveBeenCalledWith(ORG, 'obj-1', NOW);
  });
});
