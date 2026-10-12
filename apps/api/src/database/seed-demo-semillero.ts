/**
 * Seed demo: "Fundación Semillero del Sur" (sector sin fines de lucro, ADR-0011 D8; plan.md C32).
 *
 * ONG ficticia de inclusión laboral y educativa de jóvenes de 16 a 24 años, con sede en Córdoba. Contenido:
 * 1 plan estratégico institucional (N1) con 4 ejes (N2); una dirección ejecutiva, 4 áreas y 3 programas con
 * visión y misión (N3); 6 objetivos estratégicos (N4) con indicadores y proyectos con tareas (N5). Las dos
 * lecturas de cada objetivo (resultado y gestión) se DERIVAN con las funciones puras de `metrics-domain` /
 * `okr-domain`; no hay cachés hardcodeados.
 *
 * Idempotente: cada corrida BORRA los datos de negocio de la org `semillero` y los recrea con ids
 * determinísticos (prefijo `semillero-`); no toca otras organizaciones, ni el usuario, ni las membresías.
 * `audit.event` no se toca (append-only) y, como el resto de los seeds, no emite audit events.
 *
 * Este archivo lo escanea `sector-terms.guard.spec.ts`: ningún texto puede usar vocabulario de gobierno.
 *
 * Datos pensados para mostrar semáforos variados (a la fecha del seed, con período = año en curso): resultado
 * en tiempo, en riesgo y atrasado; gestión con proyectos en fecha, con retraso y atrasados.
 *
 * "Jóvenes capacitados en oficios" usa `execution_feeds_indicator` + curva `from_projects`: los dos talleres
 * completados (Electricidad y Gastronomía) ya aplicaron su aporte (`appliedEntryId` + carga automática, como
 * el `ProjectContributionApplier`); los otros dos quedan pendientes y los cupos no alcanzan la meta.
 */
import { PrismaClient } from '@prisma/client';
import {
  buildBuckets,
  bucketContaining,
  objectiveIndicatorProgressBp,
  type MetricFrequency,
} from '@gestion-publica/metrics-domain';
import {
  computeExecutionProgress,
  computeProjectProgress,
  computeResultProgress,
} from '@gestion-publica/okr-domain';

/** Cliente inyectado por el orquestador (`seed-demo.ts`) vía `seedSemillero`. */
let prisma: PrismaClient;

const DEMO_USER_ID = 'seed-user-demo-admin';
const ORG_SLUG = 'semillero';
const ORG_ID = 'seed-org-semillero';
const ORG_NAME = 'Fundación Semillero del Sur';
const PERIOD_ID = 'seed-period-semillero';
const ROLE_ORG_ADMIN_ID = 'role_org_admin';
const ROLE_ORG_USER_ID = 'role_org_user';

const YEAR = new Date().getUTCFullYear();

function utc(month: number, day: number, year = YEAR): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// ── Responsables ──────────────────────────────────────────────────────────────

interface SeedPerson {
  key: string;
  name: string;
  unitKey: string;
}

const PEOPLE: SeedPerson[] = [
  { key: 'lcabrera', name: 'Lucía Cabrera', unitKey: 'empleo' },
  { key: 'rpaz', name: 'Rodrigo Paz', unitKey: 'empleo' },
  { key: 'mgimenez', name: 'Marta Giménez', unitKey: 'terminalidad' },
  { key: 'jrios', name: 'Julián Ríos', unitKey: 'emprendedores' },
  { key: 'vsuarez', name: 'Valeria Suárez', unitKey: 'fondos' },
  { key: 'pbustos', name: 'Pablo Bustos', unitKey: 'administracion' },
  { key: 'nmendez', name: 'Natalia Méndez', unitKey: 'voluntariado' },
];

// ── Estructura ────────────────────────────────────────────────────────────────

interface SeedUnit {
  key: string;
  /** `ministry` = Área, `area` = Programa en el diccionario de la ONG. */
  kind: 'ministry' | 'area';
  parentKey: string | null;
  name: string;
  vision: string;
  mission: string;
}

const UNITS: SeedUnit[] = [
  {
    key: 'programas',
    kind: 'ministry',
    parentKey: null,
    name: 'Área de Programas',
    vision: 'Jóvenes con oficio, título y herramientas para proyectar su futuro.',
    mission: 'Diseñar y ejecutar los programas de formación, educación y emprendimiento de la Fundación.',
  },
  {
    key: 'fondos',
    kind: 'ministry',
    parentKey: null,
    name: 'Área de Desarrollo de Fondos',
    vision: 'Una Fundación sostenida por muchos y no por pocos.',
    mission: 'Conseguir y diversificar los recursos que financian los programas.',
  },
  {
    key: 'administracion',
    kind: 'ministry',
    parentKey: null,
    name: 'Área de Administración y Comunicación',
    vision: 'Una organización ordenada, transparente y bien contada.',
    mission: 'Administrar los recursos con transparencia y dar a conocer el trabajo de la Fundación.',
  },
  {
    key: 'voluntariado',
    kind: 'ministry',
    parentKey: null,
    name: 'Área de Voluntariado y Comunidad',
    vision: 'Una comunidad que se involucra y acompaña a los jóvenes.',
    mission: 'Convocar, formar y cuidar a los voluntarios que sostienen la tarea diaria.',
  },
  {
    key: 'empleo',
    kind: 'area',
    parentKey: 'programas',
    name: 'Programa Empleo Joven',
    vision: 'Que cada egresado consiga un trabajo digno.',
    mission: 'Capacitar en oficios y conectar a los jóvenes con empresas que los contraten.',
  },
  {
    key: 'terminalidad',
    kind: 'area',
    parentKey: 'programas',
    name: 'Programa Terminalidad Educativa',
    vision: 'Ningún joven sin su título secundario.',
    mission: 'Acompañar con tutorías y apoyo a quienes retoman sus estudios.',
  },
  {
    key: 'emprendedores',
    kind: 'area',
    parentKey: 'programas',
    name: 'Programa Emprendedores',
    vision: 'Egresados que generan su propio trabajo y el de otros.',
    mission: 'Formar, financiar y acompañar los primeros pasos de microemprendimientos.',
  },
];

const AXES = [
  {
    key: 'laboral',
    name: 'Inclusión laboral',
    description: 'Capacitación en oficios e ingreso al trabajo formal.',
  },
  { key: 'educacion', name: 'Educación', description: 'Terminalidad educativa y acompañamiento.' },
  {
    key: 'sostenibilidad',
    name: 'Sostenibilidad institucional',
    description: 'Fondos diversificados y organización sólida.',
  },
  { key: 'comunidad', name: 'Comunidad', description: 'Voluntariado y vínculo con el entorno.' },
];

// ── Métricas ──────────────────────────────────────────────────────────────────

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
}

const METRICS: SeedMetric[] = [
  {
    key: 'jovenes',
    name: 'Jóvenes capacitados en oficios',
    unit: 'number',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '300',
    target: '600',
    source: 'Programa Empleo Joven',
    description: 'Jóvenes que completan un taller de oficios (acumulado, suma los cupos de cada cohorte).',
    entries: [],
  },
  {
    key: 'empleo',
    name: 'Egresados con empleo a 6 meses',
    unit: 'percent',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'quarterly',
    baseline: '35',
    target: '50',
    source: 'Seguimiento de egresados',
    description: 'Porcentaje de egresados que tienen un empleo formal seis meses después de terminar el taller.',
    entries: [
      { bucketIndex: 0, increment: '2' },
      { bucketIndex: 1, increment: '4', comment: 'Primeras pasantías convertidas en contratos' },
      { bucketIndex: 2, increment: '5' },
    ],
  },
  {
    key: 'secundario',
    name: 'Jóvenes que terminan el secundario',
    unit: 'percent',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'quarterly',
    baseline: '40',
    target: '60',
    source: 'Programa Terminalidad Educativa',
    description: 'Porcentaje de los jóvenes inscriptos que completan el nivel secundario en el año.',
    entries: [
      { bucketIndex: 0, increment: '3' },
      { bucketIndex: 1, increment: '3' },
      { bucketIndex: 2, increment: '4', comment: 'Mesas de examen de julio' },
    ],
  },
  {
    key: 'donantes',
    name: 'Donantes recurrentes',
    unit: 'number',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '800',
    target: '1500',
    source: 'Registro de socios',
    description: 'Personas y empresas que aportan todos los meses.',
    entries: [
      { bucketIndex: 1, increment: '40' },
      { bucketIndex: 3, increment: '60' },
      { bucketIndex: 5, increment: '50', comment: 'Campaña del Día del Niño' },
      { bucketIndex: 7, increment: '55' },
      { bucketIndex: 9, increment: '45' },
    ],
  },
  {
    key: 'emprendimientos',
    name: 'Emprendimientos activos a 12 meses',
    unit: 'number',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'quarterly',
    baseline: '20',
    target: '45',
    source: 'Programa Emprendedores',
    description: 'Microemprendimientos de egresados que siguen funcionando a un año de su inicio.',
    entries: [
      { bucketIndex: 0, increment: '6' },
      { bucketIndex: 1, increment: '6' },
      { bucketIndex: 2, increment: '6', comment: 'Se suma la cohorte 2025' },
    ],
  },
  {
    key: 'voluntarios',
    name: 'Voluntarios activos',
    unit: 'number',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '60',
    target: '120',
    source: 'Área de Voluntariado y Comunidad',
    description: 'Voluntarios que participaron al menos una vez en el último trimestre.',
    entries: [
      { bucketIndex: 1, increment: '5' },
      { bucketIndex: 3, increment: '8' },
      { bucketIndex: 5, increment: '8' },
      { bucketIndex: 7, increment: '9' },
      { bucketIndex: 9, increment: '10' },
    ],
  },
  {
    key: 'horas',
    name: 'Horas de voluntariado',
    unit: 'number',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '0',
    target: '4000',
    source: 'Registro de asistencia',
    description: 'Horas donadas por los voluntarios (indicador de contexto del objetivo de voluntariado).',
    entries: [120, 180, 260, 310, 340, 300, 380, 420, 390, 150].map((h, i) => ({
      bucketIndex: i,
      increment: String(h),
    })),
  },
];

// ── Objetivos, proyectos y tareas ─────────────────────────────────────────────

interface SeedTask {
  title: string;
  ownerKey: string;
  start: [number, number];
  end: [number, number];
  progressBp: number;
  weightBp?: number;
}

interface SeedProject {
  key: string;
  title: string;
  description?: string;
  ownerKey: string;
  weightBp?: number;
  tasks: SeedTask[];
  /** Aporte al indicador del objetivo con esa métrica (RN-P13). */
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
  axisKey: string;
  ownerKey: string;
  indicators: SeedIndicator[];
  projects: SeedProject[];
  contextMetricKeys?: string[];
}

/** Atajo para declarar una tarea: título, responsable, [mes, día] de inicio y fin, avance en bp. */
function t(
  title: string,
  ownerKey: string,
  start: [number, number],
  end: [number, number],
  progressBp: number,
): SeedTask {
  return { title, ownerKey, start, end, progressBp };
}

const OBJECTIVES: SeedObjective[] = [
  {
    key: 'oficios',
    title: 'Ampliar el alcance de los talleres de oficios',
    description: 'Pasar de 300 a 600 jóvenes capacitados en oficios, con una cohorte por taller.',
    unitKey: 'empleo',
    axisKey: 'laboral',
    ownerKey: 'lcabrera',
    indicators: [{ metricKey: 'jovenes', feedsFromProjects: true }],
    projects: [
      {
        key: 'electricidad',
        title: 'Taller de Electricidad domiciliaria',
        ownerKey: 'rpaz',
        contribution: { metricKey: 'jovenes', value: '70' },
        tasks: [
          t('Convocatoria e inscripción de jóvenes', 'lcabrera', [1, 19], [2, 13], 10000),
          t('Dictado del taller (12 semanas)', 'rpaz', [2, 16], [4, 24], 10000),
          t('Evaluación y entrega de certificados', 'rpaz', [4, 27], [4, 30], 10000),
        ],
      },
      {
        key: 'gastronomia',
        title: 'Taller de Gastronomía',
        ownerKey: 'lcabrera',
        contribution: { metricKey: 'jovenes', value: '65' },
        tasks: [
          t('Convocatoria e inscripción de jóvenes', 'lcabrera', [3, 2], [3, 27], 10000),
          t('Equipamiento de la cocina escuela', 'rpaz', [3, 16], [4, 24], 10000),
          t('Dictado del taller (14 semanas)', 'lcabrera', [4, 27], [7, 10], 10000),
          t('Evaluación y entrega de certificados', 'lcabrera', [7, 13], [7, 17], 10000),
        ],
      },
      {
        key: 'programacion',
        title: 'Taller de Programación inicial',
        ownerKey: 'rpaz',
        contribution: { metricKey: 'jovenes', value: '75' },
        tasks: [
          t('Convocatoria e inscripción de jóvenes', 'lcabrera', [6, 1], [6, 26], 10000),
          t('Dictado del taller (16 semanas)', 'rpaz', [7, 6], [10, 30], 6500),
          t('Evaluación y entrega de certificados', 'rpaz', [11, 2], [11, 20], 0),
        ],
      },
      {
        key: 'soldadura',
        title: 'Taller de Soldadura',
        ownerKey: 'lcabrera',
        contribution: { metricKey: 'jovenes', value: '60' },
        tasks: [
          t('Convocatoria e inscripción de jóvenes', 'lcabrera', [8, 3], [8, 28], 10000),
          t('Compra de equipos de soldadura', 'rpaz', [8, 24], [9, 25], 5000),
          t('Dictado del taller (12 semanas)', 'rpaz', [9, 28], [12, 4], 800),
          t('Evaluación y entrega de certificados', 'lcabrera', [12, 7], [12, 18], 0),
        ],
      },
    ],
  },
  {
    key: 'insercion',
    title: 'Mejorar la inserción laboral de los egresados',
    description: 'Que la mitad de los egresados tenga un empleo formal a los seis meses.',
    unitKey: 'empleo',
    axisKey: 'laboral',
    ownerKey: 'lcabrera',
    indicators: [{ metricKey: 'empleo' }],
    projects: [
      {
        key: 'red-empresas',
        title: 'Red de empresas amigas',
        ownerKey: 'lcabrera',
        tasks: [
          t('Mapeo de empresas con vacantes', 'lcabrera', [2, 2], [3, 13], 10000),
          t('Firma de convenios de pasantías', 'lcabrera', [3, 16], [7, 31], 10000),
          t('Pasantías piloto en empresas', 'rpaz', [6, 1], [10, 30], 8000),
          t('Seguimiento de egresados a 6 meses', 'rpaz', [9, 1], [12, 11], 2500),
          t('Feria de empleo joven', 'lcabrera', [11, 2], [11, 27], 0),
        ],
      },
    ],
  },
  {
    key: 'terminalidad',
    title: 'Aumentar la terminalidad educativa',
    description: 'Que el 60 % de los jóvenes inscriptos termine el secundario.',
    unitKey: 'terminalidad',
    axisKey: 'educacion',
    ownerKey: 'mgimenez',
    indicators: [{ metricKey: 'secundario' }],
    projects: [
      {
        key: 'tutorias',
        title: 'Tutorías personalizadas',
        ownerKey: 'mgimenez',
        tasks: [
          t('Diagnóstico de trayectorias educativas', 'mgimenez', [2, 2], [3, 13], 10000),
          t('Formación de tutores voluntarios', 'mgimenez', [3, 16], [5, 29], 10000),
          t('Tutorías semanales en curso', 'mgimenez', [6, 1], [11, 27], 5500),
          t('Evaluación y plan del año siguiente', 'mgimenez', [11, 30], [12, 18], 0),
        ],
      },
    ],
  },
  {
    key: 'fondos',
    title: 'Diversificar el financiamiento',
    description: 'Pasar de 800 a 1500 donantes recurrentes para depender menos de pocos financiadores.',
    unitKey: 'fondos',
    axisKey: 'sostenibilidad',
    ownerKey: 'vsuarez',
    indicators: [{ metricKey: 'donantes' }],
    projects: [
      {
        key: 'socios',
        title: 'Campaña de socios mensuales',
        ownerKey: 'vsuarez',
        tasks: [
          t('Diseño de la campaña y los materiales', 'vsuarez', [2, 2], [3, 27], 10000),
          t('Puesta en marcha del botón de donación', 'pbustos', [4, 1], [7, 31], 5000),
          t('Captación en eventos y en la calle', 'vsuarez', [6, 1], [11, 27], 2000),
          t('Informe de resultados de la campaña', 'vsuarez', [12, 1], [12, 18], 0),
        ],
      },
      {
        key: 'rse',
        title: 'Alianzas con empresas (RSE)',
        ownerKey: 'vsuarez',
        tasks: [
          t('Mapeo de empresas con programas de RSE', 'vsuarez', [2, 16], [4, 10], 10000),
          t('Presentación de propuestas a empresas', 'vsuarez', [4, 13], [8, 28], 4500),
          t('Firma de convenios de aporte mensual', 'vsuarez', [9, 1], [11, 27], 0),
        ],
      },
    ],
  },
  {
    key: 'emprendimientos',
    title: 'Fortalecer los emprendimientos de egresados',
    description: 'Llegar a 45 emprendimientos que sigan activos a los doce meses.',
    unitKey: 'emprendedores',
    axisKey: 'laboral',
    ownerKey: 'jrios',
    indicators: [{ metricKey: 'emprendimientos' }],
    projects: [
      {
        key: 'incubadora',
        title: 'Incubadora de microemprendimientos',
        ownerKey: 'jrios',
        tasks: [
          t('Selección de emprendedores', 'jrios', [3, 2], [4, 17], 10000),
          t('Capacitación en gestión del negocio', 'jrios', [4, 20], [8, 28], 10000),
          t('Microcréditos semilla', 'jrios', [9, 1], [11, 13], 3000),
          t('Acompañamiento individual', 'jrios', [7, 1], [12, 11], 4000),
        ],
      },
    ],
  },
  {
    key: 'voluntariado',
    title: 'Crecer en voluntariado',
    description: 'Duplicar la base de voluntarios activos, de 60 a 120.',
    unitKey: 'voluntariado',
    axisKey: 'comunidad',
    ownerKey: 'nmendez',
    indicators: [{ metricKey: 'voluntarios' }],
    contextMetricKeys: ['horas'],
    projects: [
      {
        key: 'mentores',
        title: 'Programa de mentores',
        ownerKey: 'nmendez',
        tasks: [
          t('Convocatoria de voluntarios', 'nmendez', [2, 2], [3, 13], 10000),
          t('Capacitación de mentores', 'nmendez', [3, 16], [6, 30], 10000),
          t('Emparejamiento con jóvenes', 'nmendez', [7, 1], [9, 30], 10000),
          t('Seguimiento mensual de duplas', 'nmendez', [10, 1], [12, 11], 1000),
          t('Encuentro anual de mentores', 'nmendez', [11, 16], [12, 4], 0),
        ],
      },
    ],
  },
];

/** Fecha de cierre de un proyecto: la última fecha de fin de sus tareas. */
function projectEnd(p: SeedProject): Date {
  return new Date(Math.max(...p.tasks.map((t) => utc(t.end[0], t.end[1]).getTime())));
}

function isComplete(p: SeedProject): boolean {
  return p.tasks.every((t) => t.progressBp === 10000);
}

/** Borra los datos de negocio de la org (descartables). `audit.event` no se toca. */
async function wipeBusinessData(organizationId: string): Promise<void> {
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
  // ── Usuario admin demo (el mismo de la otra org demo) ──────────────────────
  const admin = await prisma.user.upsert({
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

  // ── Organización ───────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    create: { id: ORG_ID, slug: ORG_SLUG, name: ORG_NAME, status: 'active', sector: 'nonprofit' },
    update: { name: ORG_NAME, status: 'active', sector: 'nonprofit' },
  });
  const orgId = org.id;

  await wipeBusinessData(orgId);

  await prisma.userOrganizationRole.upsert({
    where: { userId_organizationId: { userId: admin.id, organizationId: orgId } },
    create: {
      userId: admin.id,
      organizationId: orgId,
      roleId: ROLE_ORG_ADMIN_ID,
      assignedByUserId: admin.id,
    },
    update: { roleId: ROLE_ORG_ADMIN_ID },
  });

  for (const moduleKey of ['okr', 'indicadores-gestion', 'indicadores-okr']) {
    await prisma.organizationModule.upsert({
      where: { organizationId_moduleKey: { organizationId: orgId, moduleKey } },
      create: { organizationId: orgId, moduleKey, enabledByUserId: admin.id, disabledAt: null },
      update: { disabledAt: null, disabledByUserId: null },
    });
  }

  // ── Responsables (usuarios de la org, asignados a su unidad más abajo) ─────
  const userIds: Record<string, string> = { adm: admin.id };
  for (const person of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { id: `seed-user-semillero-${person.key}` },
      create: {
        id: `seed-user-semillero-${person.key}`,
        auth0Sub: `seed|semillero-${person.key}`,
        email: `${person.key}@semillero.local`,
        displayName: person.name,
        isSuperadmin: false,
      },
      update: { displayName: person.name },
    });
    userIds[person.key] = user.id;
  }
  const userId = (key: string): string => {
    const id = userIds[key];
    if (!id) throw new Error(`responsable desconocido: ${key}`);
    return id;
  };

  // ── Período: ejercicio anual ───────────────────────────────────────────────
  const period = await prisma.period.create({
    data: {
      id: PERIOD_ID,
      organizationId: orgId,
      code: `Ejercicio ${YEAR}`,
      status: 'open',
      startsAt: utc(1, 1),
      endsAt: utc(12, 31),
    },
  });
  const range = { startsAt: period.startsAt, endsAt: period.endsAt };

  // ── N1: plan estratégico y N2: ejes ────────────────────────────────────────
  const plan = await prisma.strategicPlan.create({
    data: {
      id: 'semillero-plan',
      organizationId: orgId,
      title: `Plan estratégico institucional ${YEAR}–${YEAR + 2}`,
      vision:
        'Que cada joven de nuestra comunidad tenga un oficio, un título y una oportunidad de trabajo digno.',
      mandateStartsAt: utc(1, 1),
      mandateEndsAt: utc(12, 31, YEAR + 2),
      status: 'active',
    },
  });
  const axisIds: Record<string, string> = {};
  for (const [i, axis] of AXES.entries()) {
    const id = `semillero-axis-${axis.key}`;
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

  // ── N3: dirección general, direcciones y áreas con visión y misión ─────────
  let central = await prisma.orgUnit.findFirst({
    where: { organizationId: orgId, kind: 'central', deletedAt: null },
  });
  const centralData = {
    name: 'Dirección Ejecutiva',
    vision: 'Una Fundación que acompaña a los jóvenes de Córdoba hasta su primer trabajo.',
    mission: 'Conducir la estrategia de la Fundación y coordinar a todas las áreas.',
  };
  central = central
    ? await prisma.orgUnit.update({ where: { id: central.id }, data: centralData })
    : await prisma.orgUnit.create({
        data: { organizationId: orgId, kind: 'central', order: 0, ...centralData },
      });

  const unitIds: Record<string, string> = {};
  for (const [i, def] of UNITS.entries()) {
    const parentId = def.parentKey ? unitIds[def.parentKey] : central.id;
    const unit = await prisma.orgUnit.create({
      data: {
        id: `semillero-unit-${def.key}`,
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
  // Cada responsable tiene alcance de escritura en su unidad.
  for (const person of PEOPLE) {
    const unitId = unitIds[person.unitKey];
    if (!unitId) throw new Error(`unidad desconocida: ${person.unitKey}`);
    await prisma.userOrganizationRole.upsert({
      where: { userId_organizationId: { userId: userId(person.key), organizationId: orgId } },
      create: {
        userId: userId(person.key),
        organizationId: orgId,
        roleId: ROLE_ORG_USER_ID,
        assignedByUserId: admin.id,
        orgUnitId: unitId,
      },
      update: { roleId: ROLE_ORG_USER_ID, orgUnitId: unitId },
    });
  }

  // ── Aportes automáticos de proyectos completos (se crean con el proyecto) ──
  // Mismo criterio que `ProjectContributionApplier`: carga +valor en el bucket de la fecha de cierre.
  const autoIncrementsByMetric = new Map<string, string[]>();
  for (const o of OBJECTIVES) {
    for (const p of o.projects) {
      if (p.contribution && isComplete(p)) {
        const list = autoIncrementsByMetric.get(p.contribution.metricKey) ?? [];
        list.push(p.contribution.value);
        autoIncrementsByMetric.set(p.contribution.metricKey, list);
      }
    }
  }

  // ── Métricas + cargas manuales ─────────────────────────────────────────────
  const now = new Date();
  const incrementsByMetric = new Map<string, string[]>();
  for (const m of METRICS) {
    const id = `semillero-metric-${m.key}`;
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
    const increments: string[] = [...(autoIncrementsByMetric.get(m.key) ?? [])];
    for (const [i, entry] of m.entries.entries()) {
      const bucketDate = buckets[entry.bucketIndex];
      if (!bucketDate || bucketDate.getTime() > now.getTime()) continue; // solo buckets que ya empezaron
      await prisma.metricEntry.create({
        data: {
          id: `semillero-entry-${m.key}-${i}`,
          metricId: id,
          organizationId: orgId,
          bucketDate,
          incrementValue: entry.increment,
          comment: entry.comment ?? null,
          createdByUserId: admin.id,
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
    const axisId = axisIds[o.axisKey];
    if (!orgUnitId) throw new Error(`unidad desconocida: ${o.unitKey}`);
    if (!axisId) throw new Error(`eje desconocido: ${o.axisKey}`);
    const objectiveId = `semillero-obj-${o.key}`;
    await prisma.objective.create({
      data: {
        id: objectiveId,
        organizationId: orgId,
        periodId: period.id,
        title: o.title,
        description: o.description,
        ownerUserId: userId(o.ownerKey),
        orgUnitId,
        axisId,
      },
    });

    // Indicadores -> lectura de resultado
    const indicatorBp: Array<{ weightBp: number | null; progressBp: number }> = [];
    for (const ind of o.indicators) {
      const m = METRICS.find((x) => x.key === ind.metricKey);
      if (!m) throw new Error(`métrica desconocida: ${ind.metricKey}`);
      if (ind.feedsFromProjects && m.kind !== 'output') {
        throw new Error(`${m.key}: el vínculo con proyectos exige una métrica output`);
      }
      const progressBp = objectiveIndicatorProgressBp({
        metricBaseline: m.baseline,
        increments: incrementsByMetric.get(m.key) ?? [],
        baseline: m.baseline,
        target: m.target,
      });
      await prisma.objectiveIndicator.create({
        data: {
          id: `semillero-oi-${o.key}-${m.key}`,
          organizationId: orgId,
          objectiveId,
          metricId: `semillero-metric-${m.key}`,
          baselineValue: m.baseline,
          targetValue: m.target,
          direction: m.direction,
          weightBp: ind.weightBp ?? null,
          expectedCurveMode: ind.feedsFromProjects ? 'from_projects' : 'linear',
          linkMode: ind.feedsFromProjects ? 'execution_feeds_indicator' : 'independent',
          progressCachedBp: progressBp,
        },
      });
      indicatorBp.push({ weightBp: ind.weightBp ?? null, progressBp });
    }

    for (const key of o.contextMetricKeys ?? []) {
      await prisma.metricObjectiveContext.create({
        data: {
          metricId: `semillero-metric-${key}`,
          objectiveId,
          organizationId: orgId,
          createdByUserId: admin.id,
        },
      });
    }

    // Proyectos y tareas -> lectura de gestión
    const projectBp: Array<{ weightBp: number | null; progressBp: number }> = [];
    for (const p of o.projects) {
      const projectId = `semillero-proj-${p.key}`;
      const progressBp = computeProjectProgress(
        p.tasks.map((t) => ({ weightBp: t.weightBp ?? null, progressBp: t.progressBp })),
      );
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
          ownerUserId: userId(p.ownerKey),
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
            ownerUserId: userId(t.ownerKey),
          },
        });
      }
      if (p.contribution) {
        const target = o.indicators.find((i) => i.metricKey === p.contribution?.metricKey);
        const metric = METRICS.find((x) => x.key === p.contribution?.metricKey);
        if (!target?.feedsFromProjects || !metric) {
          throw new Error(
            `${p.key}: aporta a ${p.contribution.metricKey}, que no recibe aportes de proyectos`,
          );
        }
        // Proyecto al 100 %: carga automática aplicada en el bucket de cierre (origen `project_contribution`).
        let appliedEntryId: string | null = null;
        if (progressBp >= 10000) {
          appliedEntryId = `semillero-entry-auto-${p.key}`;
          await prisma.metricEntry.create({
            data: {
              id: appliedEntryId,
              metricId: `semillero-metric-${metric.key}`,
              organizationId: orgId,
              bucketDate: bucketContaining(projectEnd(p), range, metric.frequency),
              incrementValue: p.contribution.value,
              comment: `Aporte automático — Proyecto ${p.title}`,
              origin: 'project_contribution',
              sourceProjectId: projectId,
              createdByUserId: userId(p.ownerKey),
            },
          });
        }
        await prisma.projectContribution.create({
          data: {
            id: `semillero-contrib-${p.key}-${p.contribution.metricKey}`,
            organizationId: orgId,
            projectId,
            objectiveIndicatorId: `semillero-oi-${o.key}-${p.contribution.metricKey}`,
            contributionValue: p.contribution.value,
            appliedEntryId,
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

/** Siembra la org demo sin fines de lucro (ADR-0011 D8). El orquestador maneja la conexión y el manejo de errores. */
export async function seedSemillero(client: PrismaClient): Promise<void> {
  prisma = client;
  await main();
}
