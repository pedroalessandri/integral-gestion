/**
 * Migración KR -> planificación de gobierno (SPEC §6 punto 2, ADR-0009 D6; fase "migrate" del
 * expand -> migrate -> contract).
 *
 * Por cada organización:
 *  1. Asegura la unidad `central` y crea "Sin asignar" (`ministry`, hija de la central) para asignarle
 *     los objetivos vivos que no tienen unidad.
 *  2. Por cada KR vivo todavía no migrado:
 *       - `automatic` con `MetricKrLink` -> `ObjectiveIndicator` (misma métrica, base, meta, dirección y
 *         peso) y sus tareas pasan a un proyecto "Tareas de <KR>".
 *       - el resto (`manual`, o automático sin vínculo) -> `Project` (título, owner, peso, fechas
 *         min/max de sus tareas o las del período) con sus tareas re-parentadas.
 *  3. Recalcula las dos lecturas (resultado y gestión) de todos los objetivos vivos de la org con las
 *     funciones puras de `metrics-domain` / `okr-domain`.
 *  4. Escribe un evento `migration.*` en `audit.event` por cada entidad creada o modificada, con actor
 *     `system:migration` (un `request_id` por corrida). Nunca hace UPDATE/DELETE sobre `audit.event`.
 *
 * Idempotente: el KR migrado queda marcado con `legacy_key_result_id` en el indicador o el proyecto
 * creado (único parcial, ADR-0009 D6) y se saltea en la próxima corrida; "Sin asignar" se reutiliza por
 * nombre; el recálculo solo escribe (y audita) si el valor cambia. `KeyResult` y `MetricKrLink` no se
 * tocan (siguen vivos hasta el contract, F10).
 *
 * Uso (después de `pnpm --filter api build`):
 *   node dist/database/migrate-to-planning.js --dry-run     # hace todo en una transacción y la revierte
 *   node dist/database/migrate-to-planning.js               # real
 *   node dist/database/migrate-to-planning.js --org <slug>  # una sola organización
 *
 * Cliente Prisma plano (SIN la extensión de tenant): es una operación confiable cross-tenant, y escribe
 * `organizationId` explícito en cada fila. Una transacción por organización.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { computeExecutionProgress, computeProjectProgress, computeResultProgress } from '@gestion-publica/okr-domain';
import { objectiveIndicatorProgressBp } from '@gestion-publica/metrics-domain';
import {
  planObjectiveMigration,
  type Direction,
  type LegacyKeyResult,
  type PlanConflict,
} from './planning-migration';

export const MIGRATION_ACTOR_ID = 'system:migration';
export const UNASSIGNED_UNIT_NAME = 'Sin asignar';

type Tx = Prisma.TransactionClient;

export interface OrgCounts {
  orgSlug: string;
  centralUnitsCreated: number;
  unassignedUnitsCreated: number;
  objectivesAssigned: number;
  keyResultsLive: number;
  keyResultsAlreadyMigrated: number;
  indicatorsCreated: number;
  projectsFromManualKr: number;
  projectsFromAutomaticKrTasks: number;
  tasksReparented: number;
  weightGroupsReset: number;
  conflicts: PlanConflict[];
  objectivesRecomputed: number;
  recomputeErrors: string[];
  auditEvents: number;
}

class DryRunRollback extends Error {
  constructor() {
    super('dry-run: rollback');
  }
}

function emptyCounts(orgSlug: string): OrgCounts {
  return {
    orgSlug,
    centralUnitsCreated: 0,
    unassignedUnitsCreated: 0,
    objectivesAssigned: 0,
    keyResultsLive: 0,
    keyResultsAlreadyMigrated: 0,
    indicatorsCreated: 0,
    projectsFromManualKr: 0,
    projectsFromAutomaticKrTasks: 0,
    tasksReparented: 0,
    weightGroupsReset: 0,
    conflicts: [],
    objectivesRecomputed: 0,
    recomputeErrors: [],
    auditEvents: 0,
  };
}

interface AuditInput {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: string;
  before: Prisma.InputJsonValue | null;
  after: Prisma.InputJsonValue;
}

async function audit(tx: Tx, requestId: string, counts: OrgCounts, e: AuditInput): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: MIGRATION_ACTOR_ID,
      organizationId: e.organizationId,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      diff: { before: e.before ?? null, after: e.after, source: 'migration-f5' },
      requestId,
    },
  });
  counts.auditEvents += 1;
}

/** `audit.event.actor_id` tiene FK a `core.user`; la migración de F2 ya lo crea, esto es red de seguridad. */
async function ensureSystemUser(tx: Tx): Promise<void> {
  await tx.user.upsert({
    where: { id: MIGRATION_ACTOR_ID },
    create: {
      id: MIGRATION_ACTOR_ID,
      auth0Sub: MIGRATION_ACTOR_ID,
      email: 'system-migration@system.invalid',
      displayName: 'System migration',
      isSuperadmin: false,
    },
    update: {},
  });
}

function iso(d: Date): string {
  return d.toISOString();
}

async function migrateOrganization(
  tx: Tx,
  org: { id: string; slug: string; name: string },
  requestId: string,
): Promise<OrgCounts> {
  const counts = emptyCounts(org.slug);
  const organizationId = org.id;
  await ensureSystemUser(tx);

  // ── 1. Unidades ─────────────────────────────────────────────────────────────
  let central = await tx.orgUnit.findFirst({ where: { organizationId, kind: 'central', deletedAt: null } });
  if (!central) {
    central = await tx.orgUnit.create({
      data: { organizationId, kind: 'central', name: org.name, parentId: null, order: 0 },
    });
    counts.centralUnitsCreated += 1;
    await audit(tx, requestId, counts, {
      organizationId,
      entityType: 'core.org_unit',
      entityId: central.id,
      action: 'migration.org_unit_created',
      before: null,
      after: { kind: 'central', name: central.name, parentId: null, order: 0 },
    });
  }

  const objectives = await tx.objective.findMany({
    where: { organizationId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, orgUnitId: true, periodId: true },
  });

  const unassigned = objectives.filter((o) => o.orgUnitId === null);
  const unitOf = new Map<string, string>(); // objectiveId -> orgUnitId
  for (const o of objectives) if (o.orgUnitId) unitOf.set(o.id, o.orgUnitId);

  if (unassigned.length > 0) {
    let sinAsignar = await tx.orgUnit.findFirst({
      where: { organizationId, kind: 'ministry', parentId: central.id, name: UNASSIGNED_UNIT_NAME, deletedAt: null },
    });
    if (!sinAsignar) {
      sinAsignar = await tx.orgUnit.create({
        data: { organizationId, kind: 'ministry', name: UNASSIGNED_UNIT_NAME, parentId: central.id, order: 0 },
      });
      counts.unassignedUnitsCreated += 1;
      await audit(tx, requestId, counts, {
        organizationId,
        entityType: 'core.org_unit',
        entityId: sinAsignar.id,
        action: 'migration.org_unit_created',
        before: null,
        after: { kind: 'ministry', name: UNASSIGNED_UNIT_NAME, parentId: central.id, order: 0 },
      });
    }
    for (const o of unassigned) {
      await tx.objective.update({ where: { id: o.id }, data: { orgUnitId: sinAsignar.id } });
      unitOf.set(o.id, sinAsignar.id);
      counts.objectivesAssigned += 1;
      await audit(tx, requestId, counts, {
        organizationId,
        entityType: 'okr.objective',
        entityId: o.id,
        action: 'migration.objective_unit_assigned',
        before: { orgUnitId: null },
        after: { orgUnitId: sinAsignar.id },
      });
    }
  }

  // ── 2. KR -> indicador / proyecto ──────────────────────────────────────────
  for (const objective of objectives) {
    const orgUnitId = unitOf.get(objective.id);
    if (!orgUnitId) continue;

    const krs = await tx.keyResult.findMany({
      where: { organizationId, objectiveId: objective.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    counts.keyResultsLive += krs.length;
    if (krs.length === 0) continue;
    const krIds = krs.map((k) => k.id);

    // El único parcial cubre también filas soft-deleted: un KR migrado y después dado de baja no se rehace.
    const [doneIndicators, doneProjects] = await Promise.all([
      tx.objectiveIndicator.findMany({
        where: { organizationId, legacyKeyResultId: { in: krIds } },
        select: { legacyKeyResultId: true },
      }),
      tx.project.findMany({
        where: { organizationId, legacyKeyResultId: { in: krIds } },
        select: { legacyKeyResultId: true },
      }),
    ]);
    const done = new Set<string>();
    for (const r of [...doneIndicators, ...doneProjects]) if (r.legacyKeyResultId) done.add(r.legacyKeyResultId);
    counts.keyResultsAlreadyMigrated += krs.filter((k) => done.has(k.id)).length;
    const pending = krs.filter((k) => !done.has(k.id));
    if (pending.length === 0) continue;

    const pendingIds = pending.map((k) => k.id);
    const [links, tasks, period, existingIndicators, existingProjects] = await Promise.all([
      tx.metricKrLink.findMany({ where: { organizationId, keyResultId: { in: pendingIds } } }),
      tx.task.findMany({
        where: { organizationId, keyResultId: { in: pendingIds }, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      tx.period.findUniqueOrThrow({ where: { id: objective.periodId } }),
      tx.objectiveIndicator.findMany({
        where: { organizationId, objectiveId: objective.id, deletedAt: null },
        select: { weightBp: true, metricId: true },
      }),
      tx.project.findMany({
        where: { organizationId, objectiveId: objective.id, deletedAt: null },
        select: { weightBp: true },
      }),
    ]);
    const linkByKr = new Map(links.map((l) => [l.keyResultId, l]));

    const legacy: LegacyKeyResult[] = pending.map((kr) => {
      const link = linkByKr.get(kr.id);
      return {
        id: kr.id,
        title: kr.title,
        description: kr.description,
        ownerUserId: kr.ownerUserId,
        weightBp: kr.weightBp,
        progressMode: kr.progressMode,
        link: link
          ? {
              metricId: link.metricId,
              baselineValue: link.baselineValue.toFixed(4),
              targetValue: link.targetValue.toFixed(4),
              direction: link.direction as Direction,
            }
          : null,
        tasks: tasks
          .filter((t) => t.keyResultId === kr.id)
          .map((t) => ({
            id: t.id,
            weightBp: t.weightBp,
            progressBp: t.progressBp,
            startsAt: t.startsAt,
            endsAt: t.endsAt,
          })),
      };
    });

    const plan = planObjectiveMigration({
      krs: legacy,
      period: { startsAt: period.startsAt, endsAt: period.endsAt },
      existingIndicatorWeights: existingIndicators.map((i) => i.weightBp),
      existingProjectWeights: existingProjects.map((p) => p.weightBp),
      existingMetricIds: existingIndicators.map((i) => i.metricId),
    });
    counts.conflicts.push(...plan.conflicts);
    counts.weightGroupsReset +=
      plan.weightGroupsReset.indicators + plan.weightGroupsReset.projects + plan.weightGroupsReset.tasks;

    for (const ind of plan.indicators) {
      const metric = await tx.metric.findFirstOrThrow({ where: { id: ind.metricId, organizationId } });
      const entries = await tx.metricEntry.findMany({
        where: { metricId: ind.metricId, organizationId, deletedAt: null },
        select: { incrementValue: true },
      });
      const progressCachedBp = objectiveIndicatorProgressBp({
        metricBaseline: metric.baselineValue.toFixed(4),
        increments: entries.map((e) => e.incrementValue.toFixed(4)),
        baseline: ind.baselineValue,
        target: ind.targetValue,
      });
      const created = await tx.objectiveIndicator.create({
        data: {
          organizationId,
          objectiveId: objective.id,
          metricId: ind.metricId,
          baselineValue: ind.baselineValue,
          targetValue: ind.targetValue,
          direction: ind.direction,
          weightBp: ind.weightBp,
          expectedCurveMode: 'linear',
          linkMode: 'independent',
          progressCachedBp,
          legacyKeyResultId: ind.krId,
        },
      });
      counts.indicatorsCreated += 1;
      await audit(tx, requestId, counts, {
        organizationId,
        entityType: 'metrics.objective_indicator',
        entityId: created.id,
        action: 'migration.objective_indicator_created',
        before: null,
        after: {
          objectiveId: objective.id,
          metricId: ind.metricId,
          baselineValue: ind.baselineValue,
          targetValue: ind.targetValue,
          direction: ind.direction,
          weightBp: ind.weightBp,
          linkMode: 'independent',
          legacyKeyResultId: ind.krId,
        },
      });
    }

    for (const proj of plan.projects) {
      const progressCachedBp = computeProjectProgress(proj.tasks);
      const created = await tx.project.create({
        data: {
          organizationId,
          objectiveId: objective.id,
          orgUnitId,
          title: proj.title,
          description: proj.description,
          ownerUserId: proj.ownerUserId,
          weightBp: proj.weightBp,
          startsAt: proj.startsAt,
          endsAt: proj.endsAt,
          progressMode: 'from_tasks',
          progressCachedBp,
          legacyKeyResultId: proj.krId,
        },
      });
      if (proj.origin === 'tasks_of_automatic_kr') counts.projectsFromAutomaticKrTasks += 1;
      else counts.projectsFromManualKr += 1;
      await audit(tx, requestId, counts, {
        organizationId,
        entityType: 'okr.project',
        entityId: created.id,
        action: 'migration.project_created',
        before: null,
        after: {
          objectiveId: objective.id,
          orgUnitId,
          title: proj.title,
          description: proj.description,
          ownerUserId: proj.ownerUserId,
          weightBp: proj.weightBp,
          startsAt: iso(proj.startsAt),
          endsAt: iso(proj.endsAt),
          progressMode: 'from_tasks',
          legacyKeyResultId: proj.krId,
          origin: proj.origin,
        },
      });

      for (const t of proj.tasks) {
        // XOR proyecto / KR (chk_task_parent_xor): un solo UPDATE que cambia de padre.
        await tx.task.update({
          where: { id: t.id },
          data: { projectId: created.id, keyResultId: null, weightBp: t.weightBp },
        });
        counts.tasksReparented += 1;
        await audit(tx, requestId, counts, {
          organizationId,
          entityType: 'okr.task',
          entityId: t.id,
          action: 'migration.task_reparented',
          before: { keyResultId: proj.krId, projectId: null },
          after: { keyResultId: null, projectId: created.id, weightBp: t.weightBp },
        });
      }
    }
  }

  // ── 3. Recalcular las dos lecturas (no se fusionan) ─────────────────────────
  for (const objective of objectives) {
    try {
      await recomputeObjective(tx, organizationId, objective.id, requestId, counts);
    } catch (err) {
      counts.recomputeErrors.push(`${objective.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return counts;
}

async function recomputeObjective(
  tx: Tx,
  organizationId: string,
  objectiveId: string,
  requestId: string,
  counts: OrgCounts,
): Promise<void> {
  // Indicadores: progreso desde la métrica (valor acumulado de sus cargas vivas).
  const indicators = await tx.objectiveIndicator.findMany({
    where: { organizationId, objectiveId, deletedAt: null },
    include: { metric: { select: { baselineValue: true } } },
  });
  const indicatorBp: Array<{ weightBp: number | null; progressBp: number }> = [];
  for (const ind of indicators) {
    const entries = await tx.metricEntry.findMany({
      where: { metricId: ind.metricId, organizationId, deletedAt: null },
      select: { incrementValue: true },
    });
    const progressBp = objectiveIndicatorProgressBp({
      metricBaseline: ind.metric.baselineValue.toFixed(4),
      increments: entries.map((e) => e.incrementValue.toFixed(4)),
      baseline: ind.baselineValue.toFixed(4),
      target: ind.targetValue.toFixed(4),
    });
    if (progressBp !== ind.progressCachedBp) {
      await tx.objectiveIndicator.update({ where: { id: ind.id }, data: { progressCachedBp: progressBp } });
    }
    indicatorBp.push({ weightBp: ind.weightBp, progressBp });
  }

  // Proyectos desde tareas; los `from_indicator` toman su avance del indicador (F7) y no se tocan.
  const projects = await tx.project.findMany({ where: { organizationId, objectiveId, deletedAt: null } });
  const projectBp: Array<{ weightBp: number | null; progressBp: number }> = [];
  for (const p of projects) {
    let progressBp = p.progressCachedBp;
    if (p.progressMode === 'from_tasks') {
      const tasks = await tx.task.findMany({
        where: { organizationId, projectId: p.id, deletedAt: null },
        select: { weightBp: true, progressBp: true },
      });
      progressBp = computeProjectProgress(tasks);
      if (progressBp !== p.progressCachedBp) {
        await tx.project.update({ where: { id: p.id }, data: { progressCachedBp: progressBp } });
      }
    }
    projectBp.push({ weightBp: p.weightBp, progressBp });
  }

  const resultProgressCachedBp = computeResultProgress(indicatorBp);
  const executionProgressCachedBp = computeExecutionProgress(projectBp);
  const current = await tx.objective.findFirstOrThrow({
    where: { id: objectiveId, organizationId },
    select: { resultProgressCachedBp: true, executionProgressCachedBp: true },
  });
  if (
    current.resultProgressCachedBp === resultProgressCachedBp &&
    current.executionProgressCachedBp === executionProgressCachedBp
  ) {
    return;
  }
  await tx.objective.update({
    where: { id: objectiveId },
    data: { resultProgressCachedBp, executionProgressCachedBp },
  });
  counts.objectivesRecomputed += 1;
  await audit(tx, requestId, counts, {
    organizationId,
    entityType: 'okr.objective',
    entityId: objectiveId,
    action: 'migration.objective_progress_recomputed',
    before: {
      resultProgressCachedBp: current.resultProgressCachedBp,
      executionProgressCachedBp: current.executionProgressCachedBp,
    },
    after: { resultProgressCachedBp, executionProgressCachedBp },
  });
}

export interface RunOptions {
  dryRun: boolean;
  orgSlug?: string;
}

export async function runMigration(prisma: PrismaClient, options: RunOptions): Promise<OrgCounts[]> {
  const requestId = randomUUID();
  const orgs = await prisma.organization.findMany({
    where: options.orgSlug ? { slug: options.orgSlug } : {},
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true, name: true },
  });
  const results: OrgCounts[] = [];
  for (const org of orgs) {
    let captured: OrgCounts | undefined;
    try {
      await prisma.$transaction(
        async (tx) => {
          captured = await migrateOrganization(tx, org, requestId);
          if (options.dryRun) throw new DryRunRollback();
        },
        { timeout: 120_000, maxWait: 20_000 },
      );
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }
    if (captured) results.push(captured);
  }
  return results;
}

function printReport(results: OrgCounts[], dryRun: boolean): void {
  console.log(dryRun ? '[migrate] DRY-RUN (nada se persiste)' : '[migrate] REAL');
  const total = emptyCounts('TOTAL');
  for (const r of results) {
    console.log(`\n[migrate] org=${r.orgSlug}`);
    console.log(`  unidades: central creada=${r.centralUnitsCreated}, "Sin asignar" creada=${r.unassignedUnitsCreated}, objetivos asignados=${r.objectivesAssigned}`);
    console.log(`  KR vivos=${r.keyResultsLive} (ya migrados=${r.keyResultsAlreadyMigrated})`);
    console.log(`  indicadores creados=${r.indicatorsCreated}`);
    console.log(`  proyectos creados=${r.projectsFromManualKr + r.projectsFromAutomaticKrTasks} (de KR manual=${r.projectsFromManualKr}, "Tareas de <KR>"=${r.projectsFromAutomaticKrTasks})`);
    console.log(`  tareas re-parentadas=${r.tasksReparented}, grupos sin pesos por no cerrar en 10000=${r.weightGroupsReset}`);
    console.log(`  objetivos recalculados=${r.objectivesRecomputed}, eventos de auditoría=${r.auditEvents}`);
    for (const c of r.conflicts) console.log(`  CONFLICTO kr=${c.krId}: ${c.reason}`);
    for (const e of r.recomputeErrors) console.log(`  ERROR de recálculo ${e}`);
    total.centralUnitsCreated += r.centralUnitsCreated;
    total.unassignedUnitsCreated += r.unassignedUnitsCreated;
    total.objectivesAssigned += r.objectivesAssigned;
    total.keyResultsLive += r.keyResultsLive;
    total.keyResultsAlreadyMigrated += r.keyResultsAlreadyMigrated;
    total.indicatorsCreated += r.indicatorsCreated;
    total.projectsFromManualKr += r.projectsFromManualKr;
    total.projectsFromAutomaticKrTasks += r.projectsFromAutomaticKrTasks;
    total.tasksReparented += r.tasksReparented;
    total.weightGroupsReset += r.weightGroupsReset;
    total.objectivesRecomputed += r.objectivesRecomputed;
    total.auditEvents += r.auditEvents;
    total.conflicts.push(...r.conflicts);
    total.recomputeErrors.push(...r.recomputeErrors);
  }
  console.log(
    `\n[migrate] TOTAL orgs=${results.length} | KR vivos=${total.keyResultsLive} (ya migrados=${total.keyResultsAlreadyMigrated}) | indicadores=${total.indicatorsCreated} | proyectos=${total.projectsFromManualKr + total.projectsFromAutomaticKrTasks} | tareas=${total.tasksReparented} | objetivos asignados=${total.objectivesAssigned} | recalculados=${total.objectivesRecomputed} | auditoría=${total.auditEvents} | conflictos=${total.conflicts.length} | errores de recálculo=${total.recomputeErrors.length}`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const orgIdx = args.indexOf('--org');
  const orgSlug = orgIdx >= 0 ? args[orgIdx + 1] : undefined;
  const prisma = new PrismaClient();
  try {
    const results = await runMigration(prisma, { dryRun, ...(orgSlug ? { orgSlug } : {}) });
    printReport(results, dryRun);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[migrate] FAILED:', err);
    process.exit(1);
  });
}
