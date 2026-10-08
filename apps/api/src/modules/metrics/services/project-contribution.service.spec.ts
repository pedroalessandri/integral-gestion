/**
 * ProjectContributionService: ABM y validaciones 422 tipadas de los aportes de proyectos (RN-P12/P14b, ADR-0009 D5).
 * Los puertos de `okr` (objetivo y proyecto) son fakes; el aplicador se mockea (su lógica se prueba aparte).
 */
import { allowAllScope } from '../../../common/testing/org-unit-scope.stub.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ProjectContributionService } from './project-contribution.service.js';

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
let contributions: Row[];
let indicators: Row[];
let metrics: Row[];
let project: Row | null;
let seq: number;

const matches = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
const table = (rows: () => Row[]) => ({
  findMany: vi.fn(async ({ where = {} }: { where?: Row } = {}) => rows().filter((r) => matches(r, where))),
  // Copia: como la base real, lo leído antes de un update no cambia por el update.
  findFirst: vi.fn(async ({ where = {} }: { where?: Row } = {}) => {
    const found = rows().find((r) => matches(r, where));
    return found ? { ...found } : null;
  }),
});
const contributionTable = {
  ...table(() => contributions),
  create: vi.fn(async ({ data }: { data: Row }) => {
    const row: Row = {
      id: `pc-${++seq}`,
      appliedEntryId: null,
      createdAt: new Date('2027-01-01T00:00:00Z'),
      updatedAt: new Date('2027-01-01T00:00:00Z'),
      ...data,
      contributionValue: D(String(data['contributionValue'])),
    };
    contributions.push(row);
    return row;
  }),
  updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
    for (const c of contributions.filter((r) => matches(r, where))) {
      Object.assign(c, data, data['contributionValue'] ? { contributionValue: D(String(data['contributionValue'])) } : {});
    }
    return { count: 1 };
  }),
  deleteMany: vi.fn(async ({ where }: { where: Row }) => {
    contributions = contributions.filter((c) => !matches(c, where));
    return { count: 1 };
  }),
};
const tx = {
  $executeRaw: vi.fn(async () => 1),
  $queryRaw: vi.fn(async () => []),
  projectContribution: contributionTable,
  objectiveIndicator: table(() => indicators),
};
const scoped = {
  projectContribution: table(() => contributions),
  objectiveIndicator: table(() => indicators),
  metric: table(() => metrics),
};
const prisma = { scoped, runInTransaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) };
const audit = { emit: vi.fn().mockResolvedValue(undefined) };
const applier = { reconcileProject: vi.fn().mockResolvedValue({ applied: 0, reverted: 0, removed: 0 }) };
const objectiveLookup = { findLiveObjective: vi.fn(), filterLiveObjectiveIds: vi.fn() };
const projectLinks = {
  findLiveProject: vi.fn(async () => project),
  findLiveProjects: vi.fn(async (_o: string, ids: string[]) => (project && ids.includes(project['id'] as string) ? [project] : [])),
  findLiveProjectsBySourceIndicator: vi.fn(),
};

function build(): ProjectContributionService {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return new ProjectContributionService(prisma as any, audit as any, applier as any, objectiveLookup as any, projectLinks as any, allowAllScope());
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

const indicator = (extra: Row = {}): Row => ({
  id: 'oi-1',
  organizationId: ORG,
  objectiveId: 'obj-1',
  metricId: 'm-1',
  linkMode: 'execution_feeds_indicator',
  deletedAt: null,
  ...extra,
});
const projectRow = (extra: Row = {}): Row => ({
  id: 'p-1',
  objectiveId: 'obj-1',
  title: 'Ciclovía Av. Y',
  endsAt: new Date('2027-06-30T00:00:00Z'),
  progressBp: 0,
  progressMode: 'from_tasks',
  sourceObjectiveIndicatorId: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  contributions = [];
  indicators = [indicator()];
  metrics = [{ id: 'm-1', organizationId: ORG, kind: 'output', deletedAt: null }];
  project = projectRow();
  objectiveLookup.findLiveObjective.mockResolvedValue({
    id: 'obj-1',
    periodId: 'period-1',
    period: { id: 'period-1', code: '2027', status: 'open' },
  });
});

describe('create', () => {
  it('crea el aporte, audita y lo devuelve sin aplicar (proyecto incompleto: no reconcilia)', async () => {
    const dto = await build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx);

    expect(dto).toMatchObject({
      projectId: 'p-1',
      projectTitle: 'Ciclovía Av. Y',
      objectiveIndicatorId: 'oi-1',
      contributionValue: '4',
      applied: false,
      appliedEntryId: null,
      projectProgressBp: 0,
      projectEndsAt: '2027-06-30T00:00:00.000Z',
    });
    expect(contributions[0]).toMatchObject({ organizationId: ORG });
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project_contribution.created',
        entityType: 'metrics.project_contribution',
        diff: { before: null, after: { projectId: 'p-1', objectiveIndicatorId: 'oi-1', contributionValue: '4' } },
      }),
    );
    expect(applier.reconcileProject).not.toHaveBeenCalled();
  });

  it('proyecto que ya está al 100 %: se aplica enseguida con la misma reconciliación del evento', async () => {
    project = projectRow({ progressBp: 10000 });
    await build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx);
    expect(applier.reconcileProject).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, actorId: 'user-1', projectId: 'p-1', projectTitle: 'Ciclovía Av. Y' }),
    );
  });

  it('indicador de una métrica outcome -> 422 ContributionRequiresOutputMetric', async () => {
    metrics = [{ id: 'm-1', organizationId: ORG, kind: 'outcome', deletedAt: null }];
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).rejects.toThrow(
      /ContributionRequiresOutputMetric/,
    );
    expect(contributions).toHaveLength(0);
  });

  it('linkMode distinto de execution_feeds_indicator -> 422 ContributionRequiresExecutionFeedsMode', async () => {
    indicators = [indicator({ linkMode: 'independent' })];
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).rejects.toThrow(
      /ContributionRequiresExecutionFeedsMode/,
    );
  });

  it('proyecto inexistente, borrado o de otra org (el puerto devuelve null) -> 422 ContributionProjectNotFound', async () => {
    project = null;
    await expect(build().create('oi-1', ORG, { projectId: 'p-9', contributionValue: '4' }, authCtx)).rejects.toThrow(
      /ContributionProjectNotFound/,
    );
    expect(projectLinks.findLiveProject).toHaveBeenCalledWith(ORG, 'p-9');
  });

  it('proyecto de otro objetivo -> 422 ContributionProjectObjectiveMismatch', async () => {
    project = projectRow({ objectiveId: 'obj-2' });
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).rejects.toThrow(
      /ContributionProjectObjectiveMismatch/,
    );
  });

  it('proyecto from_indicator hacia ese mismo indicador -> 422 (un par no usa los dos sentidos)', async () => {
    project = projectRow({ progressMode: 'from_indicator', sourceObjectiveIndicatorId: 'oi-1' });
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).rejects.toThrow(
      /ContributionProjectFeedsFromIndicator/,
    );
    // Hacia otro indicador sí puede aportar.
    project = projectRow({ progressMode: 'from_indicator', sourceObjectiveIndicatorId: 'oi-other' });
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).resolves.toBeDefined();
  });

  it('par repetido -> 409 ContributionAlreadyExists', async () => {
    await build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx);
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '5' }, authCtx)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('indicador inexistente o de otra org -> 404; período cerrado -> 403', async () => {
    await expect(build().create('nope', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    objectiveLookup.findLiveObjective.mockResolvedValue({
      id: 'obj-1',
      periodId: 'period-1',
      period: { id: 'period-1', code: '2027', status: 'closed' },
    });
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).rejects.toThrow();
    expect(contributions).toHaveLength(0);
  });

  it('el vínculo cambió entre la validación y el lock (carrera con un PATCH del indicador) -> 422 y no crea', async () => {
    const original = tx.objectiveIndicator.findFirst.getMockImplementation();
    tx.objectiveIndicator.findFirst.mockImplementationOnce(async () => ({ linkMode: 'independent' }));
    await expect(build().create('oi-1', ORG, { projectId: 'p-1', contributionValue: '4' }, authCtx)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(contributions).toHaveLength(0);
    expect(original).toBeDefined();
  });
});

describe('update / remove', () => {
  beforeEach(() => {
    contributions.push({
      id: 'pc-1',
      organizationId: ORG,
      projectId: 'p-1',
      objectiveIndicatorId: 'oi-1',
      contributionValue: D('4'),
      appliedEntryId: null,
      createdAt: new Date('2027-01-01T00:00:00Z'),
      updatedAt: new Date('2027-01-01T00:00:00Z'),
    });
  });

  it('update audita before/after del valor', async () => {
    const dto = await build().update('pc-1', ORG, { contributionValue: '6.5' }, authCtx);
    expect(dto.contributionValue).toBe('6.5');
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project_contribution.updated',
        diff: { before: { contributionValue: '4' }, after: { contributionValue: '6.5' } },
      }),
    );
  });

  it('aporte ya aplicado: no se edita ni se borra (422 ContributionAlreadyApplied), hay que reabrir el proyecto', async () => {
    contributions[0]!['appliedEntryId'] = 'e-1';
    await expect(build().update('pc-1', ORG, { contributionValue: '6' }, authCtx)).rejects.toThrow(/ContributionAlreadyApplied/);
    await expect(build().remove('pc-1', ORG, authCtx)).rejects.toThrow(/ContributionAlreadyApplied/);
    expect(contributions).toHaveLength(1);
  });

  it('remove borra la fila y audita con el valor previo', async () => {
    await build().remove('pc-1', ORG, authCtx);
    expect(contributions).toHaveLength(0);
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project_contribution.deleted',
        diff: { before: { projectId: 'p-1', objectiveIndicatorId: 'oi-1', contributionValue: '4' }, after: null },
      }),
    );
  });

  it('aporte de otra org o inexistente -> 404', async () => {
    contributions[0]!['organizationId'] = 'org-2';
    await expect(build().update('pc-1', ORG, { contributionValue: '6' }, authCtx)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build().remove('pc-1', ORG, authCtx)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('listados', () => {
  it('listByIndicator oculta los aportes de proyectos que ya no existen; listByProject exige proyecto vivo (404)', async () => {
    contributions.push(
      { id: 'pc-1', organizationId: ORG, projectId: 'p-1', objectiveIndicatorId: 'oi-1', contributionValue: D('4'), appliedEntryId: 'e-1', createdAt: new Date(), updatedAt: new Date() },
      { id: 'pc-2', organizationId: ORG, projectId: 'p-dead', objectiveIndicatorId: 'oi-1', contributionValue: D('9'), appliedEntryId: null, createdAt: new Date(), updatedAt: new Date() },
    );
    const items = await build().listByIndicator('oi-1', ORG);
    expect(items.map((i) => i.id)).toEqual(['pc-1']);
    expect(items[0]).toMatchObject({ applied: true, appliedEntryId: 'e-1' });

    expect((await build().listByProject('p-1', ORG)).map((i) => i.id)).toEqual(['pc-1']);
    project = null;
    await expect(build().listByProject('p-1', ORG)).rejects.toBeInstanceOf(NotFoundException);
  });
});
