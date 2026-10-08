/**
 * ProjectService: reglas RN-P4 (unidad y fechas), RN-P6 (pesos todo-o-nada), modo de avance y audit.
 * Los puertos de `core` y los lectores de `scoped` se mockean; el recálculo corre con la matemática real
 * de `okr-domain` sobre una base en memoria.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { ProjectService } from './project.service.js';
import { createInMemoryOkrDb, type InMemoryOkrDb } from '../testing/in-memory-okr-db.js';

const ORG = 'org-1';
const PERIOD = {
  id: 'period-1',
  code: '2027',
  status: 'open',
  startsAt: new Date('2027-01-01T00:00:00.000Z'),
  endsAt: new Date('2027-12-31T00:00:00.000Z'),
};
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
const scoped = {
  objective: { findFirst: vi.fn() },
  project: { findFirst: vi.fn(), findMany: vi.fn() },
};
const audit = { emit: vi.fn().mockResolvedValue(undefined) };
const members = { isMemberOf: vi.fn().mockResolvedValue(true) };
const unitLookup = { findLiveOrgUnit: vi.fn() };
const hierarchy = { isSelfOrDescendant: vi.fn() };
const prisma = {
  scoped,
  runInTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db.tx)),
};

function build(): ProjectService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ProjectService(prisma as any, audit as any, members as any, unitLookup as any, hierarchy as any);
}

const baseDto = {
  title: 'Ciclovía Av. Y',
  startsAt: '2027-02-01T00:00:00.000Z',
  endsAt: '2027-06-30T00:00:00.000Z',
};

function liveProject(id: string, extra: Record<string, unknown> = {}) {
  return db.project.insert({
    id,
    objectiveId: 'obj-1',
    organizationId: ORG,
    orgUnitId: 'unit-1',
    title: id,
    startsAt: new Date('2027-02-01T00:00:00.000Z'),
    endsAt: new Date('2027-06-30T00:00:00.000Z'),
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db = createInMemoryOkrDb();
  db.objective.insert({ id: 'obj-1', organizationId: ORG });
  scoped.objective.findFirst.mockResolvedValue({ id: 'obj-1', orgUnitId: 'unit-1', period: PERIOD });
  unitLookup.findLiveOrgUnit.mockResolvedValue({ id: 'unit-1', kind: 'ministry' });
  hierarchy.isSelfOrDescendant.mockResolvedValue(true);
  scoped.project.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => {
    const row = db.project.rows.find((r) => r['id'] === where.id && r['deletedAt'] === null);
    if (!row) return null;
    const taskCount = db.task.rows.filter((t) => t['projectId'] === row['id'] && t['deletedAt'] === null).length;
    return { ...row, _count: { tasks: taskCount } };
  });
});

describe('ProjectService.create', () => {
  it('crea el proyecto con la unidad del objetivo, audita y recalcula la gestión del objetivo', async () => {
    const result = await build().create('obj-1', ORG, baseDto, authCtx);

    expect(result.orgUnitId).toBe('unit-1');
    expect(result.weightBp).toBeNull();
    expect(result.progressMode).toBe('from_tasks');
    expect(db.project.rows).toHaveLength(1);
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'project.created', entityType: 'okr.project', entityId: result.id }),
    );
    expect(db.objective.rows[0]?.['executionProgressCachedBp']).toBe(0);
  });

  it('toda query de lectura filtra por organizationId', async () => {
    await build().create('obj-1', ORG, baseDto, authCtx);
    expect(scoped.objective.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, deletedAt: null }) }),
    );
    expect(hierarchy.isSelfOrDescendant).toHaveBeenCalledWith(ORG, 'unit-1', 'unit-1');
  });

  it('objetivo inexistente -> 404', async () => {
    scoped.objective.findFirst.mockResolvedValue(null);
    await expect(build().create('obj-9', ORG, baseDto, authCtx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('período cerrado -> 403', async () => {
    scoped.objective.findFirst.mockResolvedValue({ id: 'obj-1', orgUnitId: 'unit-1', period: { ...PERIOD, status: 'closed' } });
    await expect(build().create('obj-1', ORG, baseDto, authCtx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('progressMode from_indicator -> 422 (no operable todavía)', async () => {
    await expect(
      build().create('obj-1', ORG, { ...baseDto, progressMode: 'from_indicator' }, authCtx),
    ).rejects.toThrow(/ProjectProgressModeNotSupported/);
    expect(db.project.rows).toHaveLength(0);
  });

  it('RN-P4: unidad fuera de la rama del objetivo -> 422', async () => {
    hierarchy.isSelfOrDescendant.mockResolvedValue(false);
    await expect(
      build().create('obj-1', ORG, { ...baseDto, orgUnitId: 'unit-x' }, authCtx),
    ).rejects.toThrow(/ProjectOrgUnitOutOfScope/);
    expect(hierarchy.isSelfOrDescendant).toHaveBeenCalledWith(ORG, 'unit-1', 'unit-x');
  });

  it('RN-P4: unidad descendiente -> ok', async () => {
    unitLookup.findLiveOrgUnit.mockResolvedValue({ id: 'unit-child', kind: 'area' });
    const result = await build().create('obj-1', ORG, { ...baseDto, orgUnitId: 'unit-child' }, authCtx);
    expect(result.orgUnitId).toBe('unit-child');
  });

  it('unidad inexistente -> 422 OrgUnitNotFound', async () => {
    unitLookup.findLiveOrgUnit.mockResolvedValue(null);
    await expect(
      build().create('obj-1', ORG, { ...baseDto, orgUnitId: 'ghost' }, authCtx),
    ).rejects.toThrow(/OrgUnitNotFound/);
  });

  it('objetivo sin unidad -> 422 ObjectiveWithoutOrgUnit', async () => {
    scoped.objective.findFirst.mockResolvedValue({ id: 'obj-1', orgUnitId: null, period: PERIOD });
    await expect(build().create('obj-1', ORG, baseDto, authCtx)).rejects.toThrow(/ObjectiveWithoutOrgUnit/);
  });

  it.each([
    ['inicio antes del período', '2026-12-31T00:00:00.000Z', '2027-03-01T00:00:00.000Z', /ProjectOutsidePeriod/],
    ['fin después del período', '2027-02-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z', /ProjectOutsidePeriod/],
    ['fin antes del inicio', '2027-05-01T00:00:00.000Z', '2027-04-01T00:00:00.000Z', /ProjectDatesInvalid/],
  ])('RN-P4: fechas inválidas (%s) -> 422', async (_name, startsAt, endsAt, pattern) => {
    await expect(build().create('obj-1', ORG, { ...baseDto, startsAt, endsAt }, authCtx)).rejects.toThrow(pattern);
    await expect(build().create('obj-1', ORG, { ...baseDto, startsAt, endsAt }, authCtx)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('fechas iguales a las del período (inclusive) -> ok', async () => {
    const result = await build().create(
      'obj-1',
      ORG,
      { ...baseDto, startsAt: PERIOD.startsAt.toISOString(), endsAt: PERIOD.endsAt.toISOString() },
      authCtx,
    );
    expect(result.id).toBeDefined();
  });

  it('owner que no es miembro -> 422', async () => {
    members.isMemberOf.mockResolvedValueOnce(false);
    await expect(build().create('obj-1', ORG, { ...baseDto, ownerUserId: 'u-x' }, authCtx)).rejects.toThrow(
      /OwnerNotMember/,
    );
  });

  it('RN-P6: crear sin peso en un grupo ponderado -> 422 mixto', async () => {
    liveProject('p1', { weightBp: 10000 });
    await expect(build().create('obj-1', ORG, baseDto, authCtx)).rejects.toThrow(/MixedWeightGroup/);
    expect(audit.emit).not.toHaveBeenCalled();
  });

  it('RN-P6: primer proyecto con peso != 10000 -> 422 suma', async () => {
    await expect(build().create('obj-1', ORG, { ...baseDto, weightBp: 4000 }, authCtx)).rejects.toThrow(
      /WeightSumInvalid/,
    );
  });

  it('RN-P6: peso 10000 como único proyecto -> ok', async () => {
    const result = await build().create('obj-1', ORG, { ...baseDto, weightBp: 10000 }, authCtx);
    expect(result.weightBp).toBe(10000);
  });
});

describe('ProjectService.update', () => {
  it('RN-P6: dejar un grupo mixto -> 422', async () => {
    liveProject('p1');
    liveProject('p2');
    await expect(build().update('p1', ORG, { weightBp: 5000 }, authCtx)).rejects.toThrow(/MixedWeightGroup/);
  });

  it('cambiar el peso de un proyecto del grupo ponderado a una suma válida recalcula el objetivo', async () => {
    liveProject('p1', { weightBp: 10000, progressCachedBp: 5000 });
    // un único hermano: cambiar a 10000 no cambia nada; probamos título + audit
    const result = await build().update('p1', ORG, { title: 'Nuevo' }, authCtx);
    expect(result.title).toBe('Nuevo');
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project.updated',
        diff: { before: { title: 'p1' }, after: { title: 'Nuevo' } },
      }),
    );
  });

  it('cambiar fechas que dejan tareas afuera -> se permite por ahora (decisión 2026-10-07)', async () => {
    liveProject('p1');
    db.task.insert({
      id: 't1',
      projectId: 'p1',
      organizationId: ORG,
      startsAt: new Date('2027-02-10T00:00:00.000Z'),
      endsAt: new Date('2027-06-20T00:00:00.000Z'),
    });
    const result = await build().update('p1', ORG, { endsAt: '2027-04-01T00:00:00.000Z' }, authCtx);
    expect(result.endsAt).toBe('2027-04-01T00:00:00.000Z');
  });

  it('fechas fuera del período -> 422', async () => {
    liveProject('p1');
    await expect(
      build().update('p1', ORG, { endsAt: '2028-06-01T00:00:00.000Z' }, authCtx),
    ).rejects.toThrow(/ProjectOutsidePeriod/);
  });

  it('from_indicator -> 422', async () => {
    liveProject('p1');
    await expect(build().update('p1', ORG, { progressMode: 'from_indicator' }, authCtx)).rejects.toThrow(
      /ProjectProgressModeNotSupported/,
    );
  });

  it('proyecto inexistente -> 404', async () => {
    await expect(build().update('nope', ORG, { title: 'x' }, authCtx)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProjectService.setObjectiveProjectWeights', () => {
  beforeEach(() => {
    scoped.project.findFirst.mockImplementation(async () => null);
  });

  it('pasa de sin pesos a ponderado de forma atómica y recalcula la gestión', async () => {
    liveProject('p1', { progressCachedBp: 10000 });
    liveProject('p2', { progressCachedBp: 0 });

    const result = await build().setObjectiveProjectWeights(
      'obj-1',
      ORG,
      { weights: [{ id: 'p1', weightBp: 7000 }, { id: 'p2', weightBp: 3000 }] },
      authCtx,
    );

    expect(result.map((p) => p.weightBp)).toEqual([7000, 3000]);
    expect(db.objective.rows[0]?.['executionProgressCachedBp']).toBe(7000);
    expect(audit.emit).toHaveBeenCalledTimes(2);
  });

  it('suma != 10000 -> 422 y no persiste', async () => {
    liveProject('p1');
    liveProject('p2');
    await expect(
      build().setObjectiveProjectWeights('obj-1', ORG, { weights: [{ id: 'p1', weightBp: 5000 }, { id: 'p2', weightBp: 4000 }] }, authCtx),
    ).rejects.toThrow(/WeightSumInvalid/);
    expect(db.project.rows.every((p) => p['weightBp'] === null)).toBe(true);
  });

  it('mixto -> 422; set de ids incompleto -> 422', async () => {
    liveProject('p1');
    liveProject('p2');
    await expect(
      build().setObjectiveProjectWeights('obj-1', ORG, { weights: [{ id: 'p1', weightBp: 10000 }, { id: 'p2', weightBp: null }] }, authCtx),
    ).rejects.toThrow(/MixedWeightGroup/);
    await expect(
      build().setObjectiveProjectWeights('obj-1', ORG, { weights: [{ id: 'p1', weightBp: 10000 }] }, authCtx),
    ).rejects.toThrow(/WeightsSetMismatch/);
  });

  it('todos null quita los pesos', async () => {
    liveProject('p1', { weightBp: 5000 });
    liveProject('p2', { weightBp: 5000 });
    const result = await build().setObjectiveProjectWeights(
      'obj-1',
      ORG,
      { weights: [{ id: 'p1', weightBp: null }, { id: 'p2', weightBp: null }] },
      authCtx,
    );
    expect(result.every((p) => p.weightBp === null)).toBe(true);
  });
});

describe('ProjectService.softDelete', () => {
  it('con tareas activas -> borra el proyecto y sus tareas, audita cada una', async () => {
    liveProject('p1');
    db.task.insert({ id: 't1', projectId: 'p1', organizationId: ORG });
    db.task.insert({ id: 't2', projectId: 'p1', organizationId: ORG });
    db.task.insert({ id: 't3', projectId: 'p1', organizationId: ORG, deletedAt: new Date('2027-01-05T00:00:00.000Z') });

    const result = await build().softDelete('p1', ORG, authCtx);

    expect(result).toEqual({ deletedTaskCount: 2, deletedTaskIds: ['t1', 't2'] });
    expect(db.task.rows.filter((t) => t['id'] !== 't3').every((t) => t['deletedAt'] instanceof Date)).toBe(true);
    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.deleted', entityId: 't1' }));
    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'task.deleted', entityId: 't2' }));
    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'project.deleted',
        entityId: 'p1',
        diff: expect.objectContaining({ after: expect.objectContaining({ deletedTaskIds: ['t1', 't2'] }) }),
      }),
    );
  });

  it('borra, audita y recalcula la gestión del objetivo', async () => {
    liveProject('p1', { progressCachedBp: 10000 });
    liveProject('p2', { progressCachedBp: 0 });
    db.objective.rows[0] = { ...db.objective.rows[0], executionProgressCachedBp: 5000 };

    await build().softDelete('p1', ORG, authCtx);

    expect(db.project.rows.find((r) => r['id'] === 'p1')?.['deletedAt']).toBeInstanceOf(Date);
    expect(db.objective.rows[0]?.['executionProgressCachedBp']).toBe(0);
    expect(audit.emit).toHaveBeenCalledWith(expect.objectContaining({ action: 'project.deleted', entityId: 'p1' }));
  });

  it('RN-P6: borrar uno de un grupo ponderado que dejaría la suma != 10000 -> 422', async () => {
    liveProject('p1', { weightBp: 5000 });
    liveProject('p2', { weightBp: 3000 });
    liveProject('p3', { weightBp: 2000 });
    await expect(build().softDelete('p1', ORG, authCtx)).rejects.toThrow(/WeightSumInvalid/);
    expect(db.project.rows.find((r) => r['id'] === 'p1')?.['deletedAt']).toBeNull();
  });

  it('borrar el último proyecto de un grupo ponderado -> ok y gestión 0', async () => {
    liveProject('p1', { weightBp: 10000, progressCachedBp: 4000 });
    await build().softDelete('p1', ORG, authCtx);
    expect(db.objective.rows[0]?.['executionProgressCachedBp']).toBe(0);
  });
});
