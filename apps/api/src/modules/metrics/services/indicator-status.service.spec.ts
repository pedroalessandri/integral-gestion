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
let contributions: Row[];

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
  projectContribution: table(() => contributions),
  period: table(() => [{ id: 'period-1', organizationId: ORG, startsAt: d('2027-01-01'), endsAt: d('2027-12-31') }]),
};
const lookup = { findLiveObjective: vi.fn(), filterLiveObjectiveIds: vi.fn() };
const reader = { readObjectiveProgress: vi.fn() };
/** Puerto `PROJECT_LINK_READER` fake: proyectos vivos por id. */
let liveProjects: Row[];
const projectLinks = {
  findLiveProjects: vi.fn(async (_org: string, ids: string[]) => liveProjects.filter((p) => ids.includes(p['id'] as string))),
};

function build(): IndicatorStatusService {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new IndicatorStatusService({ scoped } as any, lookup as any, reader as any, projectLinks as any);
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
    linkMode: 'independent',
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
  contributions = [];
  liveProjects = [];
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

describe('curva from_projects y aportes (RN-P12, RN-P17)', () => {
  const contribution = (projectId: string, value: string, indicatorId = 'oi-1'): Row => ({
    objectiveIndicatorId: indicatorId,
    organizationId: ORG,
    projectId,
    contributionValue: D(value),
  });
  const project = (id: string, endsAt: string): Row => ({ id, endsAt: new Date(`${endsAt}T12:00:00Z`) });

  it('los pasos salen del endsAt planificado del proyecto y su contributionValue', async () => {
    indicators.push(indicator('oi-1', 'm-1', { expectedCurveMode: 'from_projects', linkMode: 'execution_feeds_indicator', baselineValue: D('5'), targetValue: D('35') }));
    contributions.push(contribution('p-1', '10'), contribution('p-2', '20'));
    liveProjects.push(project('p-1', '2027-03-15'), project('p-2', '2027-10-01'));
    // Carga en junio (bucket 1/6): ya cerró p-1 (15/3) pero no p-2 (1/10): esperado = 5 + 10.
    entries.push(entry('m-1', '2027-06-01', '5'));

    const status = await build().getIndicatorStatus('oi-1', ORG, NOW);
    expect(status.expectedCurveMode).toBe('from_projects');
    expect(status.expectedValue).toBe('15');
    // Hoy (20/8) todavía falta p-2.
    expect(status.expectedToday).toBe('15');
    expect(status.contributions).toEqual({ count: 2, total: '30', projectedValue: '35', coversTarget: true });
    expect(projectLinks.findLiveProjects).toHaveBeenCalledWith(ORG, expect.arrayContaining(['p-1', 'p-2']));
  });

  it('ignora el aporte de un proyecto que ya no existe y avisa si los aportes no alcanzan la meta', async () => {
    indicators.push(indicator('oi-1', 'm-1', { expectedCurveMode: 'from_projects', linkMode: 'execution_feeds_indicator', baselineValue: D('5'), targetValue: D('35') }));
    contributions.push(contribution('p-1', '4'), contribution('p-dead', '20'));
    liveProjects.push(project('p-1', '2027-03-15'));

    const status = await build().getIndicatorStatus('oi-1', ORG, NOW);
    expect(status.contributions).toEqual({ count: 1, total: '4', projectedValue: '9', coversTarget: false });
    expect(status.expectedToday).toBe('9');
  });

  it('indicador sin vínculo de ejecución: contributions es null y no consulta aportes', async () => {
    indicators.push(indicator('oi-1', 'm-1', { expectedCurveMode: 'linear' }));
    const status = await build().getIndicatorStatus('oi-1', ORG, NOW);
    expect(status.contributions).toBeNull();
    expect(scoped.projectContribution.findMany).not.toHaveBeenCalled();
  });

  it('execution_feeds_indicator con curva lineal igual resume los aportes (aviso de C18)', async () => {
    indicators.push(indicator('oi-1', 'm-1', { expectedCurveMode: 'linear', linkMode: 'execution_feeds_indicator' }));
    const status = await build().getIndicatorStatus('oi-1', ORG, NOW);
    expect(status.contributions).toEqual({ count: 0, total: '0', projectedValue: '0', coversTarget: false });
  });
});

describe('getObjectivesStatusSummaries (lote, sin N+1)', () => {
  const reading = (id: string, extra: Row = {}) => ({
    id,
    title: id,
    orgUnitId: null,
    axisId: null,
    resultProgressBp: 3000,
    executionProgressBp: 4000,
    plannedExecutionProgressBp: 5000,
    ...extra,
  });

  it('da, por objetivo, lo mismo que getObjectiveStatus (sin el detalle por indicador)', async () => {
    indicators.push(
      indicator('oi-1', 'm-1'),
      indicator('oi-2', 'm-2', { objectiveId: 'obj-2', expectedCurveMode: 'linear' }),
    );
    entries.push(entry('m-1', '2027-06-01', '30'));
    const svc = build();

    const single1 = await svc.getObjectiveStatus('obj-1', ORG, NOW);
    reader.readObjectiveProgress.mockResolvedValue({ resultProgressBp: 100, executionProgressBp: 200, plannedExecutionProgressBp: 200 });
    lookup.findLiveObjective.mockResolvedValue({ id: 'obj-2' });
    const single2 = await svc.getObjectiveStatus('obj-2', ORG, NOW);

    const batch = await svc.getObjectivesStatusSummaries(
      ORG,
      [reading('obj-1'), reading('obj-2', { resultProgressBp: 100, executionProgressBp: 200, plannedExecutionProgressBp: 200 })],
      NOW,
    );

    for (const [id, single] of [['obj-1', single1], ['obj-2', single2]] as const) {
      const { indicators: _i, ...result } = single.result;
      void _i;
      expect(batch.get(id)).toEqual({ result, execution: single.execution });
    }
    expect(batch.get('obj-1')?.result.deviationBp).toBe(-2000);
    expect(batch.get('obj-2')?.result.deviationBp).toBeNull();
  });

  it('la cantidad de queries no depende de la cantidad de objetivos', async () => {
    const run = async (n: number) => {
      indicators = [];
      metrics = [];
      entries = [];
      points = [];
      const readings = [];
      for (let i = 0; i < n; i++) {
        metrics.push(metric(`m-${i}`));
        indicators.push(indicator(`oi-${i}`, `m-${i}`, { objectiveId: `obj-${i}`, expectedCurveMode: 'linear' }));
        entries.push(entry(`m-${i}`, '2027-06-01', '10'));
        readings.push(reading(`obj-${i}`));
      }
      vi.clearAllMocks();
      await build().getObjectivesStatusSummaries(ORG, readings, NOW);
      return Object.values(scoped).reduce((acc, t) => acc + t.findMany.mock.calls.length, 0);
    };
    const few = await run(2);
    const many = await run(40);
    expect(many).toBe(few);
  });

  it('sin lecturas no consulta nada', async () => {
    const out = await build().getObjectivesStatusSummaries(ORG, [], NOW);
    expect(out.size).toBe(0);
    expect(scoped.objectiveIndicator.findMany).not.toHaveBeenCalled();
  });
});
