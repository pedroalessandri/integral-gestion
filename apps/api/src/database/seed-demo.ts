/**
 * Seed demo: "Municipalidad de San Carrillo" (planificación de gobierno, ADR-0009; SPEC §6 punto 4).
 *
 * Contenido: 1 plan de gobierno (N1) con 2 ejes (N2); unidad central + 3 unidades operativas (N3: 2
 * secretarías y 1 dirección con visión y misión); 5 objetivos estratégicos (N4) con indicadores `output`
 * y `outcome` (incluye un `outcome` semestral, uno trimestral y uno anual), y proyectos con tareas (N5).
 * Las dos lecturas de cada objetivo (resultado y gestión) se DERIVAN con las funciones puras de
 * `metrics-domain` / `okr-domain`; no hay cachés hardcodeados.
 *
 * Idempotente y re-ejecutable: PA-1 (SPEC §8) confirma que los datos viejos son descartables, así que
 * cada corrida BORRA todos los datos de negocio de la org demo (slug `demo`) y los recrea con ids
 * determinísticos. No borra la organización, el usuario ni las membresías; `audit.event` no se toca
 * (append-only). Se corre después de `prisma migrate deploy` y de compilar:
 *
 *   pnpm --filter api build
 *   pnpm --filter api prisma:seed        # node dist/database/seed-demo.js
 *
 * Usa un PrismaClient plano (sin la extensión de tenant) y escribe `organizationId` explícito: un seed es
 * una operación confiable cross-tenant.
 *
 * Decisiones (para revisión):
 *  - Como las migraciones SQL de catálogo, el seed NO emite audit events (audit.event registra acciones
 *    de usuarios en runtime, no datos de seed).
 *  - La org demo conserva slug `demo` e id `seed-org-demo` (se renombra a "Municipalidad de San Carrillo")
 *    para no romper el acceso del demo desplegado.
 *  - El período es anual y sigue al año en curso (label "<año>"), así las cargas y buckets son vigentes.
 *    Solo se cargan valores en buckets que ya empezaron.
 *  - "3 unidades" se interpreta como 3 unidades operativas bajo la central (los objetivos solo cuelgan
 *    de `ministry` o `area`, RN-P3).
 *
 * El `outcome` semestral ("Viajes diarios en bicicleta") usa curva esperada MANUAL con `IndicatorTargetPoint`
 * (C15); el resto, curva lineal.
 *
 * El `output` "Kilómetros de ciclovía habilitados" usa el vínculo `execution_feeds_indicator` y la curva
 * `from_projects` (F7): sus dos proyectos aportan 8 y 4 km al completarse (`ProjectContribution`). Ninguno está
 * al 100 %, así que los aportes quedan pendientes y no hay cargas automáticas; la suma (12) no llega a la meta
 * (20), para que se vea el aviso de la UI. El resto de los indicadores usa el vínculo `independent`.
 *
 * Fuera del seed: proyectos `from_indicator` (falta habilitarlos en `ProjectService`).
 */
import { PrismaClient } from '@prisma/client';
import {
  buildBuckets,
  objectiveIndicatorProgressBp,
  type MetricFrequency,
} from '@gestion-publica/metrics-domain';
import {
  computeExecutionProgress,
  computeProjectProgress,
  computeResultProgress,
} from '@gestion-publica/okr-domain';

const prisma = new PrismaClient();

const DEMO_USER_ID = 'seed-user-demo-admin';
const DEMO_ORG_SLUG = 'demo';
const DEMO_ORG_ID = 'seed-org-demo';
const DEMO_PERIOD_ID = 'seed-period-demo';
const ROLE_ORG_ADMIN_ID = 'role_org_admin';

const YEAR = new Date().getUTCFullYear();

function utc(month: number, day: number, year = YEAR): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// ── Definición del demo ───────────────────────────────────────────────────────

interface SeedMetric {
  key: string;
  name: string;
  unit: 'number' | 'percent' | 'currency';
  kind: 'output' | 'outcome';
  direction: 'increasing' | 'decreasing';
  frequency: MetricFrequency;
  baseline: string;
  target: string;
  source: string;
  description: string;
  /** Un incremento por bucket usado (índice de bucket). Los buckets futuros se omiten. */
  entries: Array<{ bucketIndex: number; increment: string; comment?: string }>;
  /**
   * Curva esperada MANUAL (RN-P17): acumulado esperado por índice de bucket. El último punto debe ser igual a
   * la meta (lo exige la API; el seed lo respeta). Sin esto, el indicador usa la curva lineal.
   */
  curvePoints?: Array<{ bucketIndex: number; expected: string }>;
}

const METRICS: SeedMetric[] = [
  {
    key: 'ciclovias',
    name: 'Kilómetros de ciclovía habilitados',
    unit: 'number',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '0',
    target: '20',
    source: 'Dirección de Tránsito',
    description: 'Suma de kilómetros de ciclovía protegida habilitados al uso.',
    entries: [
      { bucketIndex: 0, increment: '1.5' },
      { bucketIndex: 1, increment: '2' },
      { bucketIndex: 2, increment: '2.5', comment: 'Tramo Av. Costanera' },
      { bucketIndex: 4, increment: '1' },
    ],
  },
  {
    key: 'bicicleta',
    name: 'Viajes diarios en bicicleta cada mil habitantes',
    unit: 'number',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'semiannual',
    baseline: '12',
    target: '30',
    source: 'Encuesta de movilidad municipal',
    description: 'Viajes en bicicleta por día cada mil habitantes, relevados semestralmente.',
    entries: [
      { bucketIndex: 0, increment: '4', comment: 'Relevamiento de verano' },
      { bucketIndex: 1, increment: '3' },
    ],
    // Metas intermedias por semestre (acumulado esperado); el último punto es la meta (30).
    curvePoints: [
      { bucketIndex: 0, expected: '18' },
      { bucketIndex: 1, expected: '30' },
    ],
  },
  {
    key: 'arboles',
    name: 'Árboles plantados',
    unit: 'number',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '0',
    target: '1500',
    source: 'Dirección de Espacios Verdes',
    description: 'Ejemplares plantados en veredas y espacios públicos.',
    entries: [
      { bucketIndex: 1, increment: '120' },
      { bucketIndex: 2, increment: '210', comment: 'Operativo de otoño' },
      { bucketIndex: 3, increment: '180' },
      { bucketIndex: 5, increment: '150' },
    ],
  },
  {
    key: 'verde',
    name: 'Superficie verde por habitante (m²)',
    unit: 'number',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'annual',
    baseline: '9',
    target: '10.5',
    source: 'Catastro municipal',
    description: 'Metros cuadrados de espacio verde público por habitante, medición anual.',
    entries: [{ bucketIndex: 0, increment: '0.4' }],
  },
  {
    key: 'tramites',
    name: 'Trámites digitalizados',
    unit: 'percent',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '0',
    target: '100',
    source: 'Secretaría de Modernización',
    description: 'Porcentaje del catálogo de trámites disponible de punta a punta en línea.',
    entries: [
      { bucketIndex: 0, increment: '10' },
      { bucketIndex: 1, increment: '15' },
      { bucketIndex: 3, increment: '20', comment: 'Habilitación de trámites de comercio' },
    ],
  },
  {
    key: 'espera',
    name: 'Tiempo promedio de resolución de un trámite (días)',
    unit: 'number',
    kind: 'outcome',
    direction: 'decreasing',
    frequency: 'quarterly',
    baseline: '18',
    target: '8',
    source: 'Mesa de entradas',
    description:
      'Días corridos entre el inicio y la resolución de un trámite, promedio trimestral.',
    entries: [
      { bucketIndex: 0, increment: '-2' },
      { bucketIndex: 1, increment: '-3', comment: 'Efecto de la ventanilla única' },
    ],
  },
  {
    key: 'luminarias',
    name: 'Luminarias LED instaladas',
    unit: 'number',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '0',
    target: '2400',
    source: 'Dirección de Alumbrado',
    description: 'Luminarias de sodio reemplazadas por tecnología LED.',
    entries: [
      { bucketIndex: 2, increment: '300' },
      { bucketIndex: 3, increment: '420' },
      { bucketIndex: 4, increment: '380' },
    ],
  },
  {
    key: 'reclamos',
    name: 'Reclamos pendientes',
    unit: 'number',
    kind: 'outcome',
    direction: 'decreasing',
    frequency: 'monthly',
    baseline: '120',
    target: '40',
    source: 'Línea 147',
    description: 'Reclamos vecinales abiertos al cierre de cada mes.',
    entries: [
      { bucketIndex: 0, increment: '-15' },
      { bucketIndex: 1, increment: '-10', comment: 'Backlog depurado' },
      { bucketIndex: 3, increment: '-18' },
    ],
  },
];

interface SeedTask {
  title: string;
  start: [number, number];
  end: [number, number];
  progressBp: number;
  weightBp?: number;
}

interface SeedProject {
  key: string;
  title: string;
  description?: string;
  weightBp?: number;
  tasks: SeedTask[];
  /** Aporte al indicador del objetivo con esa métrica (RN-P13); el indicador debe tener `feedsFromProjects`. */
  contribution?: { metricKey: string; value: string };
}

interface SeedIndicator {
  metricKey: string;
  weightBp?: number;
  /** `linkMode = execution_feeds_indicator` + curva `from_projects` (solo métricas `output`). */
  feedsFromProjects?: boolean;
}

interface SeedObjective {
  key: string;
  title: string;
  description: string;
  unitKey: string;
  axisKey: string | null;
  indicators: SeedIndicator[];
  projects: SeedProject[];
  contextMetricKeys?: string[];
}

const OBJECTIVES: SeedObjective[] = [
  {
    key: 'ciclovias',
    title: 'Ampliar la red de ciclovías y fomentar la movilidad en bicicleta',
    description:
      'Conectar los barrios con el centro mediante ciclovías protegidas y bicisendas escolares.',
    unitKey: 'obras',
    axisKey: 'urbano',
    indicators: [
      { metricKey: 'ciclovias', weightBp: 7000, feedsFromProjects: true },
      { metricKey: 'bicicleta', weightBp: 3000 },
    ],
    projects: [
      {
        key: 'costanera',
        title: 'Ciclovía de la Av. Costanera',
        description: 'Tramo de 8 km entre el puerto y el parque lineal.',
        weightBp: 6000,
        contribution: { metricKey: 'ciclovias', value: '8' },
        tasks: [
          {
            title: 'Proyecto ejecutivo',
            start: [1, 5],
            end: [2, 28],
            progressBp: 10000,
            weightBp: 2000,
          },
          {
            title: 'Licitación y adjudicación',
            start: [3, 1],
            end: [4, 30],
            progressBp: 10000,
            weightBp: 2000,
          },
          {
            title: 'Obra civil y señalización',
            start: [5, 1],
            end: [10, 31],
            progressBp: 6000,
            weightBp: 6000,
          },
        ],
      },
      {
        key: 'bicisendas',
        title: 'Bicisendas escolares',
        weightBp: 4000,
        contribution: { metricKey: 'ciclovias', value: '4' },
        tasks: [
          {
            title: 'Relevamiento de rutas a escuelas',
            start: [2, 1],
            end: [3, 31],
            progressBp: 10000,
            weightBp: 4000,
          },
          {
            title: 'Demarcación y cartelería',
            start: [4, 1],
            end: [8, 31],
            progressBp: 3000,
            weightBp: 6000,
          },
        ],
      },
    ],
    contextMetricKeys: ['reclamos'],
  },
  {
    key: 'verde',
    title: 'Aumentar el arbolado y la superficie verde por habitante',
    description: 'Plan de forestación barrial y nuevos espacios verdes públicos.',
    unitKey: 'verdes',
    axisKey: 'urbano',
    indicators: [{ metricKey: 'arboles' }, { metricKey: 'verde' }],
    projects: [
      {
        key: 'forestacion',
        title: 'Plan de forestación barrial',
        tasks: [
          {
            title: 'Convenio con vivero provincial',
            start: [1, 10],
            end: [2, 20],
            progressBp: 10000,
          },
          {
            title: 'Operativos de plantación por barrio',
            start: [3, 1],
            end: [11, 15],
            progressBp: 5500,
          },
          {
            title: 'Campaña de cuidado del arbolado',
            start: [4, 1],
            end: [9, 30],
            progressBp: 2000,
          },
        ],
      },
      {
        key: 'parque',
        title: 'Parque lineal del arroyo',
        tasks: [
          { title: 'Estudio de impacto ambiental', start: [2, 1], end: [5, 31], progressBp: 8000 },
          { title: 'Primera etapa de obra', start: [6, 1], end: [12, 15], progressBp: 1000 },
        ],
      },
    ],
  },
  {
    key: 'tramites',
    title: 'Simplificar y digitalizar los trámites municipales',
    description: 'Que el vecino resuelva sus trámites sin ir al municipio y en menos tiempo.',
    unitKey: 'modernizacion',
    axisKey: 'servicios',
    indicators: [{ metricKey: 'tramites' }, { metricKey: 'espera' }],
    projects: [
      {
        key: 'portal',
        title: 'Portal de trámites en línea',
        tasks: [
          {
            title: 'Relevar y rediseñar los 20 trámites más usados',
            start: [1, 15],
            end: [3, 31],
            progressBp: 10000,
          },
          { title: 'Desarrollo del portal', start: [4, 1], end: [8, 31], progressBp: 7000 },
          { title: 'Capacitación del personal', start: [9, 1], end: [10, 31], progressBp: 0 },
        ],
      },
      {
        key: 'ventanilla',
        title: 'Ventanilla única presencial',
        tasks: [
          {
            title: 'Reorganización de la mesa de entradas',
            start: [2, 1],
            end: [4, 30],
            progressBp: 10000,
          },
          {
            title: 'Capacitación en atención al vecino',
            start: [5, 1],
            end: [7, 31],
            progressBp: 4000,
          },
        ],
      },
    ],
  },
  {
    key: 'alumbrado',
    title: 'Modernizar el alumbrado público con tecnología LED',
    description: 'Reemplazo de luminarias de sodio para mejorar la seguridad y reducir el consumo.',
    unitKey: 'obras',
    axisKey: 'servicios',
    indicators: [{ metricKey: 'luminarias' }],
    projects: [
      {
        key: 'led1',
        title: 'Recambio de luminarias LED, etapa 1',
        tasks: [
          { title: 'Licitación de luminarias', start: [1, 20], end: [3, 15], progressBp: 10000 },
          {
            title: 'Instalación en avenidas principales',
            start: [3, 16],
            end: [9, 30],
            progressBp: 7500,
          },
        ],
      },
    ],
  },
  {
    key: 'atencion',
    title: 'Mejorar la atención y la respuesta a los reclamos vecinales',
    description: 'Objetivo sin eje: muestra que el eje es opcional (RN-P2).',
    unitKey: 'modernizacion',
    axisKey: null,
    indicators: [{ metricKey: 'reclamos' }],
    projects: [
      {
        key: 'linea147',
        title: 'Rediseño de la línea 147',
        tasks: [
          {
            title: 'Nuevo sistema de seguimiento de reclamos',
            start: [2, 15],
            end: [6, 30],
            progressBp: 9000,
          },
          { title: 'Tablero público de reclamos', start: [7, 1], end: [10, 15], progressBp: 2500 },
        ],
      },
    ],
  },
];

/** Borra los datos de negocio de la org demo (PA-1: descartables). `audit.event` no se toca. */
async function wipeDemoBusinessData(organizationId: string): Promise<void> {
  const where = { organizationId };
  await prisma.metricObjectiveContext.deleteMany({ where });
  await prisma.projectContribution.deleteMany({ where });
  await prisma.metricEntry.deleteMany({ where });
  await prisma.project.updateMany({ where, data: { sourceObjectiveIndicatorId: null } });
  await prisma.task.deleteMany({ where });
  await prisma.project.deleteMany({ where });
  await prisma.indicatorTargetPoint.deleteMany({ where });
  await prisma.objectiveIndicator.deleteMany({ where });
  await prisma.objective.deleteMany({ where });
  await prisma.metric.deleteMany({ where });
  await prisma.period.deleteMany({ where });
  await prisma.axis.deleteMany({ where });
  await prisma.strategicPlan.deleteMany({ where });
  await prisma.userOrganizationRole.updateMany({ where, data: { orgUnitId: null } });
  await prisma.orgUnit.deleteMany({ where: { organizationId, kind: 'area' } });
  await prisma.orgUnit.deleteMany({ where: { organizationId, kind: 'ministry' } });
}

async function main(): Promise<void> {
  // ── Usuario demo ────────────────────────────────────────────────────────────
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

  // ── Organización (resuelve por slug; la crea si falta) ─────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    create: {
      id: DEMO_ORG_ID,
      slug: DEMO_ORG_SLUG,
      name: 'Municipalidad de San Carrillo',
      status: 'active',
    },
    update: { name: 'Municipalidad de San Carrillo', status: 'active' },
  });
  const orgId = org.id;

  await wipeDemoBusinessData(orgId);

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

  for (const moduleKey of ['okr', 'indicadores-gestion', 'indicadores-okr']) {
    await prisma.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId: orgId, moduleKey } },
      create: { organizationId: orgId, moduleKey, enabledByUserId: user.id, disabledAt: null },
      update: { disabledAt: null, disabledByUserId: null },
    });
  }

  // ── Período anual ───────────────────────────────────────────────────────────
  const period = await prisma.period.create({
    data: {
      id: DEMO_PERIOD_ID,
      organizationId: orgId,
      code: String(YEAR),
      status: 'open',
      startsAt: utc(1, 1),
      endsAt: utc(12, 31),
    },
  });
  const range = { startsAt: period.startsAt, endsAt: period.endsAt };

  // ── N1: plan de gobierno y N2: ejes ────────────────────────────────────────
  const plan = await prisma.strategicPlan.create({
    data: {
      id: 'seed-plan',
      organizationId: orgId,
      title: `Plan de Gobierno ${YEAR - 1}-${YEAR + 3}`,
      vision:
        'San Carrillo, una ciudad cercana, verde y conectada, donde cada vecino accede a servicios públicos de calidad y a una administración transparente.',
      mandateStartsAt: utc(12, 10, YEAR - 1),
      mandateEndsAt: utc(12, 9, YEAR + 3),
      status: 'active',
    },
  });
  const axisIds: Record<string, string> = {};
  for (const [i, axis] of [
    {
      key: 'urbano',
      name: 'Ciudad sostenible',
      description: 'Espacio público, movilidad y ambiente.',
    },
    {
      key: 'servicios',
      name: 'Servicios modernos y cercanos',
      description: 'Gestión digital y servicios urbanos de calidad.',
    },
  ].entries()) {
    const id = `seed-axis-${axis.key}`;
    await prisma.axis.create({
      data: {
        id,
        strategicPlanId: plan.id,
        organizationId: orgId,
        name: axis.name,
        description: axis.description,
        order: i,
      },
    });
    axisIds[axis.key] = id;
  }

  // ── N3: unidades (central + 3 operativas) con visión y misión ──────────────
  let central = await prisma.orgUnit.findFirst({
    where: { organizationId: orgId, kind: 'central', deletedAt: null },
  });
  const centralData = {
    name: 'Municipalidad de San Carrillo',
    vision: 'Un municipio que planifica, mide y rinde cuentas de lo que hace.',
    mission: 'Coordinar la acción de gobierno y velar por el cumplimiento del plan.',
  };
  central = central
    ? await prisma.orgUnit.update({ where: { id: central.id }, data: centralData })
    : await prisma.orgUnit.create({
        data: { organizationId: orgId, kind: 'central', order: 0, ...centralData },
      });

  const unitIds: Record<string, string> = {};
  const unitDefs = [
    {
      key: 'obras',
      kind: 'ministry',
      parentKey: null,
      name: 'Secretaría de Obras y Servicios Públicos',
      vision: 'Una ciudad bien equipada, con obras que mejoran la vida cotidiana.',
      mission: 'Planificar, ejecutar y mantener la infraestructura y los servicios urbanos.',
    },
    {
      key: 'modernizacion',
      kind: 'ministry',
      parentKey: null,
      name: 'Secretaría de Modernización y Atención al Vecino',
      vision: 'Trámites simples y una atención que resuelve.',
      mission: 'Digitalizar la gestión y acercar el municipio al vecino.',
    },
    {
      key: 'verdes',
      kind: 'area',
      parentKey: 'obras',
      name: 'Dirección de Espacios Verdes',
      vision: 'Barrios arbolados y plazas cuidadas.',
      mission: 'Crear y mantener el arbolado y los espacios verdes públicos.',
    },
  ] as const;
  for (const [i, def] of unitDefs.entries()) {
    const parentId = def.parentKey ? unitIds[def.parentKey] : central.id;
    const unit = await prisma.orgUnit.create({
      data: {
        id: `seed-unit-${def.key}`,
        organizationId: orgId,
        kind: def.kind,
        parentId: parentId ?? central.id,
        name: def.name,
        vision: def.vision,
        mission: def.mission,
        order: i,
      },
    });
    unitIds[def.key] = unit.id;
  }

  // ── Métricas + cargas ──────────────────────────────────────────────────────
  const now = new Date();
  const incrementsByMetric = new Map<string, string[]>();
  for (const m of METRICS) {
    const id = `seed-metric-${m.key}`;
    await prisma.metric.create({
      data: {
        id,
        organizationId: orgId,
        periodId: period.id,
        name: m.name,
        unit: m.unit,
        kind: m.kind,
        direction: m.direction,
        frequency: m.frequency,
        source: m.source,
        description: m.description,
        baselineValue: m.baseline,
        targetValue: m.target,
      },
    });
    const buckets = buildBuckets(range, m.frequency);
    const increments: string[] = [];
    for (const [i, entry] of m.entries.entries()) {
      const bucketDate = buckets[entry.bucketIndex];
      if (!bucketDate || bucketDate.getTime() > now.getTime()) continue; // solo buckets que ya empezaron
      await prisma.metricEntry.create({
        data: {
          id: `seed-entry-${m.key}-${i}`,
          metricId: id,
          organizationId: orgId,
          bucketDate,
          incrementValue: entry.increment,
          comment: entry.comment ?? null,
          createdByUserId: user.id,
        },
      });
      increments.push(entry.increment);
    }
    incrementsByMetric.set(m.key, increments);
  }

  // ── N4/N5: objetivos, indicadores, proyectos y tareas ──────────────────────
  const summary: string[] = [];
  for (const o of OBJECTIVES) {
    const orgUnitId = unitIds[o.unitKey];
    if (!orgUnitId) throw new Error(`unidad desconocida: ${o.unitKey}`);
    const objectiveId = `seed-obj-${o.key}`;
    await prisma.objective.create({
      data: {
        id: objectiveId,
        organizationId: orgId,
        periodId: period.id,
        title: o.title,
        description: o.description,
        ownerUserId: user.id,
        orgUnitId,
        axisId: o.axisKey ? (axisIds[o.axisKey] ?? null) : null,
      },
    });

    // Indicadores -> lectura de resultado
    const indicatorBp: Array<{ weightBp: number | null; progressBp: number }> = [];
    for (const ind of o.indicators) {
      const m = METRICS.find((x) => x.key === ind.metricKey);
      if (!m) throw new Error(`métrica desconocida: ${ind.metricKey}`);
      if (ind.feedsFromProjects && (m.kind !== 'output' || m.curvePoints)) {
        throw new Error(
          `${m.key}: el vínculo con proyectos exige una métrica output sin curva manual`,
        );
      }
      const progressBp = objectiveIndicatorProgressBp({
        metricBaseline: m.baseline,
        increments: incrementsByMetric.get(m.key) ?? [],
        baseline: m.baseline,
        target: m.target,
      });
      await prisma.objectiveIndicator.create({
        data: {
          id: `seed-oi-${o.key}-${m.key}`,
          organizationId: orgId,
          objectiveId,
          metricId: `seed-metric-${m.key}`,
          baselineValue: m.baseline,
          targetValue: m.target,
          direction: m.direction,
          weightBp: ind.weightBp ?? null,
          expectedCurveMode: ind.feedsFromProjects
            ? 'from_projects'
            : m.curvePoints
              ? 'manual'
              : 'linear',
          linkMode: ind.feedsFromProjects ? 'execution_feeds_indicator' : 'independent',
          progressCachedBp: progressBp,
        },
      });
      if (m.curvePoints) {
        const metricBuckets = buildBuckets(range, m.frequency);
        for (const point of m.curvePoints) {
          const bucketDate = metricBuckets[point.bucketIndex];
          if (!bucketDate)
            throw new Error(`bucket inexistente en la curva de ${m.key}: ${point.bucketIndex}`);
          await prisma.indicatorTargetPoint.create({
            data: {
              id: `seed-tp-${o.key}-${m.key}-${point.bucketIndex}`,
              organizationId: orgId,
              objectiveIndicatorId: `seed-oi-${o.key}-${m.key}`,
              bucketDate,
              expectedValue: point.expected,
            },
          });
        }
      }
      indicatorBp.push({ weightBp: ind.weightBp ?? null, progressBp });
    }

    for (const key of o.contextMetricKeys ?? []) {
      await prisma.metricObjectiveContext.create({
        data: {
          metricId: `seed-metric-${key}`,
          objectiveId,
          organizationId: orgId,
          createdByUserId: user.id,
        },
      });
    }

    // Proyectos y tareas -> lectura de gestión
    const projectBp: Array<{ weightBp: number | null; progressBp: number }> = [];
    for (const p of o.projects) {
      const projectId = `seed-proj-${p.key}`;
      const taskBp = p.tasks.map((t) => ({
        weightBp: t.weightBp ?? null,
        progressBp: t.progressBp,
      }));
      const progressBp = computeProjectProgress(taskBp);
      const starts = p.tasks.map((t) => utc(t.start[0], t.start[1]).getTime());
      const ends = p.tasks.map((t) => utc(t.end[0], t.end[1]).getTime());
      await prisma.project.create({
        data: {
          id: projectId,
          objectiveId,
          organizationId: orgId,
          orgUnitId,
          title: p.title,
          description: p.description ?? null,
          ownerUserId: user.id,
          weightBp: p.weightBp ?? null,
          startsAt: new Date(Math.min(...starts)),
          endsAt: new Date(Math.max(...ends)),
          progressMode: 'from_tasks',
          progressCachedBp: progressBp,
        },
      });
      for (const [i, t] of p.tasks.entries()) {
        await prisma.task.create({
          data: {
            id: `${projectId}-task-${i}`,
            projectId,
            organizationId: orgId,
            title: t.title,
            weightBp: t.weightBp ?? null,
            progressBp: t.progressBp,
            startsAt: utc(t.start[0], t.start[1]),
            endsAt: utc(t.end[0], t.end[1]),
            ownerUserId: user.id,
          },
        });
      }
      if (p.contribution) {
        const target = o.indicators.find((i) => i.metricKey === p.contribution?.metricKey);
        if (!target?.feedsFromProjects) {
          throw new Error(
            `${p.key}: aporta a ${p.contribution.metricKey}, que no recibe aportes de proyectos`,
          );
        }
        // Un aporte de un proyecto al 100 % generaría una carga automática; el seed no la simula.
        if (progressBp >= 10000)
          throw new Error(`${p.key}: el seed no admite aportes de proyectos completos`);
        await prisma.projectContribution.create({
          data: {
            id: `seed-contrib-${p.key}-${p.contribution.metricKey}`,
            organizationId: orgId,
            projectId,
            objectiveIndicatorId: `seed-oi-${o.key}-${p.contribution.metricKey}`,
            contributionValue: p.contribution.value,
          },
        });
      }
      projectBp.push({ weightBp: p.weightBp ?? null, progressBp });
    }

    const resultProgressCachedBp = computeResultProgress(indicatorBp);
    const executionProgressCachedBp = computeExecutionProgress(projectBp);
    await prisma.objective.update({
      where: { id: objectiveId },
      data: { resultProgressCachedBp, executionProgressCachedBp },
    });
    summary.push(
      `${o.key}: resultado=${(resultProgressCachedBp / 100).toFixed(1)}% gestión=${(executionProgressCachedBp / 100).toFixed(1)}%`,
    );
  }

  console.log(
    `[seed] OK — org=${orgId} (${org.name}) período=${period.code} | ejes=${Object.keys(axisIds).length} unidades=${
      Object.keys(unitIds).length + 1
    } objetivos=${OBJECTIVES.length}\n[seed] ${summary.join('\n[seed] ')}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[seed] FAILED:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
