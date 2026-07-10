/**
 * Demo seed for the "indicadores" axis (Módulo 1 + Módulo 2).
 *
 * Idempotent and re-runnable: every row uses a deterministic id and is written
 * via `upsert`, so running the seed twice never duplicates data. Run it after
 * `prisma migrate deploy` with the compiled output:
 *
 *   pnpm --filter api build
 *   node dist/database/seed-demo.js        # (or: pnpm --filter api prisma:seed)
 *
 * It uses a plain PrismaClient (NOT the tenant-scoped extension), writing
 * organizationId explicitly — a seed is a trusted, cross-tenant operation.
 *
 * Progress caches are DERIVED with the same pure domain functions the runtime
 * uses (metrics-domain / okr-domain), never hardcoded — so the first cascade
 * request shows the values that the recompute hook would have produced, and any
 * later MetricEntry loaded through the API recomputes consistently.
 *
 * Decisions (recorded for review):
 *  - Like the existing SQL seed migrations, this seed does NOT emit audit events
 *    (audit.event records runtime user actions, not seed/catalog data).
 *  - The demo org is resolved by slug 'demo' (find-or-create); the open period is
 *    reused if the org already has one, else a ±90-day open period is created.
 */
import { PrismaClient } from '@prisma/client';
import {
  buildBuckets,
  parseDecimal4,
  formatDecimal4,
  computeAutomaticKrProgressBp,
  type MetricFrequency,
} from '@gestion-publica/metrics-domain';
import { computeKrProgress, computeObjectiveProgress } from '@gestion-publica/okr-domain';

const prisma = new PrismaClient();

const DEMO_USER_ID = 'seed-user-demo-admin';
const DEMO_ORG_SLUG = 'demo';
const DEMO_ORG_ID = 'seed-org-demo';
const DEMO_PERIOD_ID = 'seed-period-demo';
const ROLE_ORG_ADMIN_ID = 'role_org_admin';

/** Sum increments over a baseline using the exact decimal path the backend uses. */
function accumulate(baseline: string, increments: string[]): string {
  let running = parseDecimal4(baseline);
  for (const inc of increments) running += parseDecimal4(inc);
  return formatDecimal4(running);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

interface SeedMetric {
  id: string;
  name: string;
  unit: 'number' | 'percent' | 'currency';
  direction: 'increasing' | 'decreasing';
  frequency: MetricFrequency;
  baselineValue: string;
  targetValue: string;
  /** One increment per used bucket index (null = leave that bucket empty). */
  entries: Array<{ bucketIndex: number; increment: string; comment?: string }>;
}

const METRICS: SeedMetric[] = [
  {
    id: 'seed-metric-arboles',
    name: 'Árboles podados',
    unit: 'number',
    direction: 'increasing',
    frequency: 'weekly',
    baselineValue: '0',
    targetValue: '500',
    entries: [
      { bucketIndex: 0, increment: '40' },
      { bucketIndex: 1, increment: '55', comment: 'Cuadrilla reforzada esta semana' },
      // bucket 2 intentionally empty (RN-O6 / flat curve segment)
      { bucketIndex: 3, increment: '30' },
    ],
  },
  {
    id: 'seed-metric-desempleo',
    name: 'Tasa de desempleo juvenil',
    unit: 'percent',
    direction: 'decreasing',
    frequency: 'monthly',
    baselineValue: '8',
    targetValue: '6',
    entries: [
      { bucketIndex: 0, increment: '-0.5', comment: 'Programa de primer empleo' },
      // bucket 1 intentionally empty
      { bucketIndex: 2, increment: '-0.3' },
    ],
  },
  {
    id: 'seed-metric-reclamos',
    name: 'Reclamos pendientes',
    unit: 'number',
    direction: 'decreasing',
    frequency: 'weekly',
    baselineValue: '120',
    targetValue: '40',
    entries: [
      { bucketIndex: 0, increment: '-15' },
      { bucketIndex: 1, increment: '-10', comment: 'Backlog depurado' },
      // bucket 2 empty
      { bucketIndex: 3, increment: '-8' },
    ],
  },
  {
    id: 'seed-metric-tramites',
    name: 'Trámites digitalizados',
    unit: 'percent',
    direction: 'increasing',
    frequency: 'monthly',
    baselineValue: '0',
    targetValue: '100',
    entries: [
      { bucketIndex: 0, increment: '20' },
      // bucket 1 empty
      { bucketIndex: 2, increment: '15', comment: 'Nuevos trámites online' },
    ],
  },
];

async function main(): Promise<void> {
  // ── Demo user ──────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: {
      id: DEMO_USER_ID,
      auth0Sub: 'seed|demo-admin',
      email: 'demo-admin@demo.local',
      displayName: 'Demo Admin',
      isSuperadmin: false,
    },
    update: {},
  });

  // ── Demo org (resolve by slug; create if missing) ─────────────────────────
  let org = await prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        id: DEMO_ORG_ID,
        slug: DEMO_ORG_SLUG,
        name: 'Organización Demo',
        status: 'active',
      },
    });
  }
  const orgId = org.id;

  // ── Membership (org-admin) ────────────────────────────────────────────────
  await prisma.userOrganizationRole.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
    create: {
      userId: user.id,
      organizationId: orgId,
      roleId: ROLE_ORG_ADMIN_ID,
      assignedByUserId: user.id,
    },
    update: {},
  });

  // ── Enable modules (okr + both indicadores) ───────────────────────────────
  for (const moduleKey of ['okr', 'indicadores-gestion', 'indicadores-okr']) {
    await prisma.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId: orgId, moduleKey } },
      create: { organizationId: orgId, moduleKey, enabledByUserId: user.id, disabledAt: null },
      update: { disabledAt: null, disabledByUserId: null },
    });
  }

  // ── Open period (reuse existing, else create a ±90-day one) ────────────────
  let period = await prisma.period.findFirst({
    where: { organizationId: orgId, status: 'open', deletedAt: null },
  });
  if (!period) {
    const now = new Date();
    period = await prisma.period.upsert({
      where: { id: DEMO_PERIOD_ID },
      create: {
        id: DEMO_PERIOD_ID,
        organizationId: orgId,
        code: 'DEMO',
        status: 'open',
        startsAt: addDays(now, -90),
        endsAt: addDays(now, 90),
      },
      update: {},
    });
  }
  const range = { startsAt: period.startsAt, endsAt: period.endsAt };

  // ── Metrics + entries ─────────────────────────────────────────────────────
  const actualByMetricId = new Map<string, string>();
  for (const m of METRICS) {
    await prisma.metric.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        organizationId: orgId,
        periodId: period.id,
        name: m.name,
        unit: m.unit,
        direction: m.direction,
        frequency: m.frequency,
        baselineValue: m.baselineValue,
        targetValue: m.targetValue,
      },
      update: {
        periodId: period.id,
        baselineValue: m.baselineValue,
        targetValue: m.targetValue,
      },
    });

    const buckets = buildBuckets(range, m.frequency);
    for (const [i, entry] of m.entries.entries()) {
      const bucketDate = buckets[entry.bucketIndex];
      if (!bucketDate) continue; // period too short for this bucket — skip safely
      const entryId = `seed-entry-${m.id}-${i}`;
      await prisma.metricEntry.upsert({
        where: { id: entryId },
        create: {
          id: entryId,
          metricId: m.id,
          organizationId: orgId,
          bucketDate,
          incrementValue: entry.increment,
          comment: entry.comment ?? null,
          createdByUserId: user.id,
        },
        update: { bucketDate, incrementValue: entry.increment, comment: entry.comment ?? null },
      });
    }

    actualByMetricId.set(m.id, accumulate(m.baselineValue, m.entries.map((e) => e.increment)));
  }

  // ── Demo objective with one automatic KR + one manual KR ──────────────────
  const desempleo = METRICS.find((m) => m.id === 'seed-metric-desempleo')!;
  const autoBaseline = '8';
  const autoTarget = '6';
  const autoActual = actualByMetricId.get('seed-metric-desempleo')!;
  // Derived — same interpolation the runtime hook uses (RN-O2/§3), not hardcoded.
  const autoKrProgressBp = computeAutomaticKrProgressBp({
    actual: autoActual,
    baseline: autoBaseline,
    target: autoTarget,
  });

  // Manual KR: single task at 60% weight-10000 → KR progress = computeKrProgress.
  const manualTaskProgressBp = 6000;
  const manualKrProgressBp = computeKrProgress([{ weightBp: 10000, progressBp: manualTaskProgressBp }]);

  const objectiveProgressBp = computeObjectiveProgress([
    { weightBp: 5000, progressBp: autoKrProgressBp },
    { weightBp: 5000, progressBp: manualKrProgressBp },
  ]);

  await prisma.objective.upsert({
    where: { id: 'seed-obj-demo' },
    create: {
      id: 'seed-obj-demo',
      organizationId: orgId,
      periodId: period.id,
      title: 'Mejorar la empleabilidad juvenil del municipio',
      description: 'Objetivo demo con un KR automático (indicador) y uno manual (tareas).',
      ownerUserId: user.id,
      progressCachedBp: objectiveProgressBp,
    },
    update: { periodId: period.id, progressCachedBp: objectiveProgressBp },
  });

  await prisma.keyResult.upsert({
    where: { id: 'seed-kr-auto' },
    create: {
      id: 'seed-kr-auto',
      objectiveId: 'seed-obj-demo',
      organizationId: orgId,
      title: 'Reducir la tasa de desempleo juvenil a 6%',
      weightBp: 5000,
      progressMode: 'automatic',
      progressCachedBp: autoKrProgressBp,
      ownerUserId: user.id,
    },
    update: { progressMode: 'automatic', progressCachedBp: autoKrProgressBp },
  });

  await prisma.keyResult.upsert({
    where: { id: 'seed-kr-manual' },
    create: {
      id: 'seed-kr-manual',
      objectiveId: 'seed-obj-demo',
      organizationId: orgId,
      title: 'Ejecutar el plan de capacitación en oficios',
      weightBp: 5000,
      progressMode: 'manual',
      progressCachedBp: manualKrProgressBp,
      ownerUserId: user.id,
    },
    update: { progressMode: 'manual', progressCachedBp: manualKrProgressBp },
  });

  // Manual KR task (dates within the period)
  const taskStart = period.startsAt;
  const taskEnd = new Date(Math.min(addDays(period.startsAt, 45).getTime(), period.endsAt.getTime()));
  await prisma.task.upsert({
    where: { id: 'seed-task-manual' },
    create: {
      id: 'seed-task-manual',
      keyResultId: 'seed-kr-manual',
      organizationId: orgId,
      title: 'Dictar 3 cursos de oficios',
      weightBp: 10000,
      progressBp: manualTaskProgressBp,
      startsAt: taskStart,
      endsAt: taskEnd,
      ownerUserId: user.id,
    },
    update: { progressBp: manualTaskProgressBp },
  });

  // ── Automatic KR ↔ metric link ────────────────────────────────────────────
  await prisma.metricKrLink.upsert({
    where: { keyResultId: 'seed-kr-auto' },
    create: {
      id: 'seed-link-auto',
      metricId: desempleo.id,
      keyResultId: 'seed-kr-auto',
      organizationId: orgId,
      baselineValue: autoBaseline,
      targetValue: autoTarget,
      direction: 'decreasing',
      createdByUserId: user.id,
    },
    update: { baselineValue: autoBaseline, targetValue: autoTarget, direction: 'decreasing' },
  });

  // ── Objective context metric (visual only, RN-O10) ────────────────────────
  await prisma.metricObjectiveContext.upsert({
    where: { metricId_objectiveId: { metricId: 'seed-metric-reclamos', objectiveId: 'seed-obj-demo' } },
    create: {
      metricId: 'seed-metric-reclamos',
      objectiveId: 'seed-obj-demo',
      organizationId: orgId,
      createdByUserId: user.id,
    },
    update: {},
  });

  // eslint-disable-next-line no-console
  console.log(
    `[seed] OK — org=${orgId} period=${period.id} | KR automático=${(autoKrProgressBp / 100).toFixed(
      1,
    )}% (actual ${autoActual}) | objetivo=${(objectiveProgressBp / 100).toFixed(1)}%`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error('[seed] FAILED:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
