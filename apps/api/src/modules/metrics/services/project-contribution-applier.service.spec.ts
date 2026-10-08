/**
 * ProjectContributionApplier (RN-P13, ADR-0009 D5): aplica y compensa los aportes de un proyecto reconciliando contra
 * el estado actual del proyecto. Base en memoria mínima (aportes, cargas, indicadores, métrica); el puerto de `okr` es
 * un fake. La matemática de buckets es la REAL de `metrics-domain`. La prueba con DB real está en
 * `test/project-contribution.e2e-spec.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectContributionApplier } from './project-contribution-applier.service.js';

const ORG = 'org-1';
const D = (v: string) => ({ toString: () => v });

type Row = Record<string, unknown>;
let contributions: Row[];
let entries: Row[];
let indicators: Row[];
let project: { title: string; progressBp: number } | null;
let seq: number;
let committed: boolean;
const published: Array<{ events: unknown[]; afterCommit: boolean }> = [];

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);

const tx = {
  $queryRaw: vi.fn(async () => []),
  projectContribution: {
    findMany: vi.fn(async ({ where }: { where: Row }) => contributions.filter((c) => matches(c, where)).map((c) => ({ id: c['id'] }))),
    findFirst: vi.fn(async ({ where }: { where: Row }) => {
      const c = contributions.find((r) => matches(r, where));
      return c ? { ...c } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      for (const c of contributions.filter((r) => matches(r, where))) Object.assign(c, data);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }: { where: Row }) => {
      contributions = contributions.filter((c) => !matches(c, where));
      return { count: 1 };
    }),
  },
  objectiveIndicator: {
    findFirst: vi.fn(async ({ where }: { where: Row }) => indicators.find((i) => matches(i, where)) ?? null),
  },
  metric: {
    findFirstOrThrow: vi.fn(async () => ({
      frequency: 'monthly',
      period: { startsAt: new Date('2027-01-01T00:00:00Z'), endsAt: new Date('2027-12-31T00:00:00Z') },
    })),
  },
  metricEntry: {
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: `e-${++seq}`, ...data, incrementValue: String(data['incrementValue']) };
      entries.push(row);
      return row;
    }),
    findFirst: vi.fn(async ({ where }: { where: Row }) => {
      const e = entries.find((r) => matches(r, where));
      return e ? { ...e, incrementValue: D(String(e['incrementValue'])) } : null;
    }),
  },
};
const prisma = {
  runInTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => {
    const result = await fn(tx);
    committed = true;
    return result;
  }),
};
const audit = { emit: vi.fn().mockResolvedValue(undefined) };
const objectiveIndicatorService = {
  recomputeForMetric: vi.fn(async () => [{ objectiveId: 'obj-1' }]),
  publishProgressChanged: vi.fn(async (events: unknown[]) => {
    published.push({ events, afterCommit: committed });
  }),
};
const projectLinks = { findLiveProject: vi.fn(async () => project) };

function build(): ProjectContributionApplier {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new ProjectContributionApplier(prisma as any, audit as any, objectiveIndicatorService as any, projectLinks as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const input = (occurredAt: string) => ({
  organizationId: ORG,
  actorId: 'user-1',
  requestId: '11111111-1111-4111-8111-111111111111',
  projectId: 'p-1',
  projectTitle: 'Ciclovía Av. Y',
  occurredAt: new Date(occurredAt),
});

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  committed = false;
  published.length = 0;
  entries = [];
  contributions = [
    { id: 'pc-1', organizationId: ORG, projectId: 'p-1', objectiveIndicatorId: 'oi-1', contributionValue: D('4'), appliedEntryId: null },
  ];
  indicators = [{ id: 'oi-1', organizationId: ORG, metricId: 'm-1', linkMode: 'execution_feeds_indicator', deletedAt: null }];
  project = { title: 'Ciclovía Av. Y', progressBp: 10000 };
});

describe('proyecto al 100 %', () => {
  it('crea la carga automática +X en el bucket de la fecha de cierre, con comentario y origen, y la audita', async () => {
    const result = await build().reconcileProject(input('2027-03-17T15:00:00Z'));

    expect(result).toEqual({ applied: 1, reverted: 0, removed: 0 });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      metricId: 'm-1',
      organizationId: ORG,
      incrementValue: '4',
      comment: 'Aporte automático — Proyecto Ciclovía Av. Y',
      origin: 'project_contribution',
      sourceProjectId: 'p-1',
      createdByUserId: 'user-1',
    });
    expect((entries[0]?.['bucketDate'] as Date).toISOString().slice(0, 10)).toBe('2027-03-01');
    expect(contributions[0]?.['appliedEntryId']).toBe('e-1');
    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'metric.entry.created', entityId: 'e-1' }));
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project_contribution.applied',
        entityId: 'pc-1',
        diff: { before: { appliedEntryId: null }, after: expect.objectContaining({ appliedEntryId: 'e-1', incrementValue: '4', bucketDate: '2027-03-01' }) },
      }),
    );
    // Avance del indicador recalculado en la misma transacción y aviso a okr recién después del commit.
    expect(objectiveIndicatorService.recomputeForMetric).toHaveBeenCalledTimes(1);
    expect(published).toEqual([{ events: [{ objectiveId: 'obj-1' }], afterCommit: true }]);
  });

  it('idempotente: repetir el evento no duplica la carga ni vuelve a auditar', async () => {
    const svc = build();
    await svc.reconcileProject(input('2027-03-17T15:00:00Z'));
    audit.emit.mockClear();
    const again = await svc.reconcileProject(input('2027-03-17T15:00:00Z'));

    expect(again).toEqual({ applied: 0, reverted: 0, removed: 0 });
    expect(entries).toHaveLength(1);
    expect(audit.emit).not.toHaveBeenCalled();
  });

  it('bloquea la fila del aporte (FOR UPDATE) antes de decidir', async () => {
    await build().reconcileProject(input('2027-03-17T15:00:00Z'));
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('cierre fuera del período: la carga cae en el último bucket, nunca fuera del período', async () => {
    await build().reconcileProject(input('2028-02-10T00:00:00Z'));
    expect((entries[0]?.['bucketDate'] as Date).toISOString().slice(0, 10)).toBe('2027-12-01');
  });

  it('un indicador que ya no es execution_feeds_indicator o está borrado no recibe la carga', async () => {
    indicators = [{ id: 'oi-1', organizationId: ORG, metricId: 'm-1', linkMode: 'independent', deletedAt: null }];
    expect(await build().reconcileProject(input('2027-03-17T15:00:00Z'))).toEqual({ applied: 0, reverted: 0, removed: 0 });
    indicators = [];
    expect(await build().reconcileProject(input('2027-03-17T15:00:00Z'))).toEqual({ applied: 0, reverted: 0, removed: 0 });
    expect(entries).toHaveLength(0);
  });

  it('aísla organizaciones: los aportes de otra org con el mismo projectId no se tocan', async () => {
    contributions.push({ id: 'pc-x', organizationId: 'org-2', projectId: 'p-1', objectiveIndicatorId: 'oi-9', contributionValue: D('7'), appliedEntryId: null });
    await build().reconcileProject(input('2027-03-17T15:00:00Z'));
    expect(contributions.find((c) => c['id'] === 'pc-x')?.['appliedEntryId']).toBeNull();
    expect(entries).toHaveLength(1);
  });
});

describe('baja del 100 %', () => {
  async function applyThenDrop() {
    const svc = build();
    await svc.reconcileProject(input('2027-03-17T15:00:00Z'));
    project = { title: 'Ciclovía Av. Y', progressBp: 6000 };
    audit.emit.mockClear();
    return svc;
  }

  it('crea una carga compensatoria −X, no borra la original y deja el aporte sin aplicar', async () => {
    const svc = await applyThenDrop();
    const result = await svc.reconcileProject(input('2027-05-02T10:00:00Z'));

    expect(result).toEqual({ applied: 0, reverted: 1, removed: 0 });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: 'e-1', incrementValue: '4' }); // intacta
    expect(entries[1]).toMatchObject({
      incrementValue: '-4',
      origin: 'project_contribution',
      sourceProjectId: 'p-1',
      comment: expect.stringMatching(/^Aporte revertido — Proyecto Ciclovía Av\. Y/),
    });
    expect((entries[1]?.['bucketDate'] as Date).toISOString().slice(0, 10)).toBe('2027-05-01');
    expect(contributions[0]?.['appliedEntryId']).toBeNull();
    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project_contribution.reverted', entityId: 'pc-1' }));
    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'metric.entry.created' }));
  });

  it('idempotente: repetir el evento no compensa dos veces', async () => {
    const svc = await applyThenDrop();
    await svc.reconcileProject(input('2027-05-02T10:00:00Z'));
    await svc.reconcileProject(input('2027-05-02T10:00:00Z'));
    expect(entries).toHaveLength(2);
  });

  it('compensa lo que se aplicó realmente, no el contributionValue actual', async () => {
    const svc = await applyThenDrop();
    contributions[0]!['contributionValue'] = D('9'); // editado por fuera del flujo
    await svc.reconcileProject(input('2027-05-02T10:00:00Z'));
    expect(entries[1]?.['incrementValue']).toBe('-4');
  });

  it('ida y vuelta: completar de nuevo después de reabrir vuelve a aplicar (neto = +X)', async () => {
    const svc = await applyThenDrop();
    await svc.reconcileProject(input('2027-05-02T10:00:00Z'));
    project = { title: 'Ciclovía Av. Y', progressBp: 10000 };
    await svc.reconcileProject(input('2027-06-10T10:00:00Z'));
    expect(entries.map((e) => e['incrementValue'])).toEqual(['4', '-4', '4']);
    expect(contributions[0]?.['appliedEntryId']).toBe('e-3');
  });

  it('un evento desordenado (completed viejo con el proyecto ya reabierto) no aplica nada', async () => {
    project = { title: 'Ciclovía Av. Y', progressBp: 3000 };
    expect(await build().reconcileProject(input('2027-03-17T15:00:00Z'))).toEqual({ applied: 0, reverted: 0, removed: 0 });
    expect(entries).toHaveLength(0);
  });
});

describe('proyecto borrado', () => {
  it('compensa el aporte aplicado y da de baja el aporte (con audit de cada paso)', async () => {
    const svc = build();
    await svc.reconcileProject(input('2027-03-17T15:00:00Z'));
    project = null;
    audit.emit.mockClear();

    const result = await svc.reconcileProject(input('2027-04-02T10:00:00Z'));
    expect(result).toEqual({ applied: 0, reverted: 1, removed: 1 });
    expect(entries[1]).toMatchObject({ incrementValue: '-4', comment: expect.stringContaining('proyecto eliminado') });
    expect(contributions).toHaveLength(0);
    const actions = audit.emit.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(['metric.entry.created', 'project_contribution.reverted', 'project_contribution.deleted']);
  });

  it('un aporte sin aplicar de un proyecto borrado se da de baja sin crear cargas', async () => {
    project = null;
    const result = await build().reconcileProject(input('2027-04-02T10:00:00Z'));
    expect(result).toEqual({ applied: 0, reverted: 0, removed: 1 });
    expect(entries).toHaveLength(0);
  });
});

describe('fallas', () => {
  it('si la transacción falla no se avisa a okr ni queda nada aplicado', async () => {
    prisma.runInTransaction.mockRejectedValueOnce(new Error('db down'));
    await expect(build().reconcileProject(input('2027-03-17T15:00:00Z'))).rejects.toThrow('db down');
    expect(objectiveIndicatorService.publishProgressChanged).not.toHaveBeenCalled();
  });
});
