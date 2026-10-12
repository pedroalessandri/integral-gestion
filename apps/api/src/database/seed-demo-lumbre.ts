/**
 * Seed demo: "Lumbre Electrodomésticos S.A." (sector privado, ADR-0011 D8; plan.md C31).
 *
 * Fábrica ficticia de heladeras, lavarropas y cocinas con planta en Rosario. Contenido: 1 plan estratégico
 * (N1) con 5 ejes (N2); una dirección general, 4 direcciones y 6 áreas con visión y misión (N3); 7 objetivos
 * estratégicos (N4) con indicadores y proyectos con tareas (N5). Las dos lecturas de cada objetivo (resultado y
 * gestión) se DERIVAN con las funciones puras de `metrics-domain` / `okr-domain`; no hay cachés hardcodeados.
 *
 * Idempotente: cada corrida BORRA los datos de negocio de la org `lumbre` y los recrea con ids determinísticos
 * (prefijo `lumbre-`); no toca otras organizaciones, ni el usuario, ni las membresías. `audit.event` no se toca
 * (append-only) y, como el resto de los seeds, no emite audit events.
 *
 * Este archivo lo escanea `sector-terms.guard.spec.ts`: ningún texto puede usar vocabulario de gobierno.
 *
 * Datos pensados para mostrar semáforos variados (a la fecha del seed, con período = año en curso):
 *  - resultado: en tiempo (reclamos, accidentes, modelos inverter), en riesgo (OEE, NPS), atrasado (canal online,
 *    energía por unidad);
 *  - gestión: proyectos en fecha, con retraso y atrasados (tienda online, marketplaces).
 *
 * "Modelos inverter lanzados" usa `execution_feeds_indicator` + curva `from_projects`: los dos proyectos
 * completados (heladera y lavarropas) ya aplicaron su aporte (`appliedEntryId` + carga automática, como el
 * `ProjectContributionApplier`); los otros dos quedan pendientes.
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

/** Cliente inyectado por el orquestador (`seed-demo.ts`) vía `seedLumbre`. */
let prisma: PrismaClient;

const DEMO_USER_ID = 'seed-user-demo-admin';
const ORG_SLUG = 'lumbre';
const ORG_ID = 'seed-org-lumbre';
const ORG_NAME = 'Lumbre Electrodomésticos S.A.';
const PERIOD_ID = 'seed-period-lumbre';
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
  { key: 'mrodriguez', name: 'Martín Rodríguez', unitKey: 'planta' },
  { key: 'lfernandez', name: 'Laura Fernández', unitKey: 'calidad' },
  { key: 'cpereyra', name: 'Carolina Pereyra', unitKey: 'ecommerce' },
  { key: 'dsosa', name: 'Diego Sosa', unitKey: 'posventa' },
  { key: 'aibarra', name: 'Ana Ibarra', unitKey: 'ingenieria' },
  { key: 'gmolina', name: 'Gustavo Molina', unitKey: 'personas' },
  { key: 'sbenitez', name: 'Sofía Benítez', unitKey: 'operaciones' },
];

// ── Estructura ────────────────────────────────────────────────────────────────

interface SeedUnit {
  key: string;
  kind: 'ministry' | 'area';
  parentKey: string | null;
  name: string;
  vision: string;
  mission: string;
}

const UNITS: SeedUnit[] = [
  {
    key: 'operaciones',
    kind: 'ministry',
    parentKey: null,
    name: 'Dirección de Operaciones',
    vision: 'Una planta eficiente, segura y con calidad consistente en cada unidad.',
    mission: 'Fabricar y abastecer en tiempo y forma, con el menor desperdicio posible.',
  },
  {
    key: 'comercial',
    kind: 'ministry',
    parentKey: null,
    name: 'Dirección Comercial',
    vision: 'Estar donde el cliente compra y acompañarlo después de la compra.',
    mission: 'Vender en todos los canales y sostener la relación con el cliente.',
  },
  {
    key: 'ingenieria',
    kind: 'ministry',
    parentKey: null,
    name: 'Dirección de Ingeniería y Producto',
    vision: 'Productos más duraderos y eficientes que los de la competencia.',
    mission: 'Diseñar, ensayar y homologar la línea de productos de Lumbre.',
  },
  {
    key: 'personas',
    kind: 'ministry',
    parentKey: null,
    name: 'Dirección de Personas y Finanzas',
    vision: 'Equipos que quieren quedarse y números que sostienen el crecimiento.',
    mission: 'Cuidar a las personas, ordenar los recursos y financiar el plan.',
  },
  {
    key: 'planta',
    kind: 'area',
    parentKey: 'operaciones',
    name: 'Planta Rosario',
    vision: 'Líneas que producen sin paradas inesperadas.',
    mission: 'Producir heladeras, lavarropas y cocinas cumpliendo el programa de producción.',
  },
  {
    key: 'calidad',
    kind: 'area',
    parentKey: 'operaciones',
    name: 'Calidad',
    vision: 'Cero defectos que lleguen al hogar del cliente.',
    mission: 'Prevenir, detectar y corregir fallas desde la línea hasta el uso.',
  },
  {
    key: 'abastecimiento',
    kind: 'area',
    parentKey: 'operaciones',
    name: 'Abastecimiento y Logística',
    vision: 'El material justo, en el momento justo.',
    mission: 'Asegurar insumos y distribuir producto terminado a costo competitivo.',
  },
  {
    key: 'ventas',
    kind: 'area',
    parentKey: 'comercial',
    name: 'Ventas mayoristas',
    vision: 'Ser el proveedor preferido de las grandes cadenas y distribuidores.',
    mission: 'Desarrollar y mantener la cartera de clientes mayoristas.',
  },
  {
    key: 'ecommerce',
    kind: 'area',
    parentKey: 'comercial',
    name: 'E-commerce',
    vision: 'Que comprar un Lumbre online sea tan simple como usarlo.',
    mission: 'Operar la tienda propia y los canales digitales de venta.',
  },
  {
    key: 'posventa',
    kind: 'area',
    parentKey: 'comercial',
    name: 'Posventa y Service',
    vision: 'Un service que resuelve a la primera.',
    mission: 'Atender reclamos, reparaciones y repuestos en todo el país.',
  },
];

const AXES = [
  {
    key: 'excelencia',
    name: 'Excelencia operativa',
    description: 'Eficiencia y calidad de la fábrica.',
  },
  { key: 'crecimiento', name: 'Crecimiento comercial', description: 'Más ventas en más canales.' },
  {
    key: 'innovacion',
    name: 'Innovación y eficiencia energética',
    description: 'Productos nuevos y de menor consumo.',
  },
  {
    key: 'sustentabilidad',
    name: 'Sustentabilidad',
    description: 'Menor huella energética de la planta.',
  },
  { key: 'personas', name: 'Personas', description: 'Seguridad y desarrollo del equipo.' },
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
    key: 'oee',
    name: 'OEE de la línea de heladeras',
    unit: 'percent',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '62',
    target: '75',
    source: 'Planta Rosario',
    description:
      'Eficiencia global del equipo (disponibilidad x rendimiento x calidad) de la línea de heladeras.',
    entries: [
      { bucketIndex: 1, increment: '1' },
      { bucketIndex: 3, increment: '2', comment: 'Primeras rutinas de mantenimiento autónomo' },
      { bucketIndex: 5, increment: '2' },
      { bucketIndex: 7, increment: '1.5' },
      { bucketIndex: 9, increment: '1.5' },
    ],
  },
  {
    key: 'reclamos-garantia',
    name: 'Reclamos en garantía cada 1000 unidades',
    unit: 'number',
    kind: 'outcome',
    direction: 'decreasing',
    frequency: 'quarterly',
    baseline: '18',
    target: '10',
    source: 'Calidad / Posventa',
    description: 'Reclamos de garantía recibidos cada 1000 unidades vendidas, medición trimestral.',
    entries: [
      { bucketIndex: 0, increment: '-1' },
      { bucketIndex: 1, increment: '-2' },
      { bucketIndex: 2, increment: '-2.5', comment: 'Cambio de proveedor de válvulas' },
      { bucketIndex: 3, increment: '-0.5' },
    ],
  },
  {
    key: 'online',
    name: 'Participación del canal online en las ventas',
    unit: 'percent',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '12',
    target: '20',
    source: 'E-commerce',
    description: 'Porcentaje de las ventas totales que se concreta por canales online.',
    entries: [
      { bucketIndex: 2, increment: '0.5' },
      { bucketIndex: 4, increment: '0.5' },
      { bucketIndex: 6, increment: '0.5', comment: 'Campaña de invierno' },
      { bucketIndex: 8, increment: '0.5' },
    ],
  },
  {
    key: 'nps',
    name: 'NPS de posventa',
    unit: 'number',
    kind: 'outcome',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '32',
    target: '45',
    source: 'Encuesta posterior a la reparación',
    description: 'Net Promoter Score de los clientes que usaron el service.',
    entries: [
      { bucketIndex: 1, increment: '1' },
      { bucketIndex: 3, increment: '2' },
      { bucketIndex: 5, increment: '1' },
      { bucketIndex: 7, increment: '2' },
      { bucketIndex: 9, increment: '1' },
    ],
  },
  {
    key: 'inverter',
    name: 'Modelos inverter lanzados',
    unit: 'number',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '0',
    target: '4',
    source: 'Dirección de Ingeniería y Producto',
    description: 'Modelos de la línea inverter A+++ liberados a la venta.',
    entries: [],
  },
  {
    key: 'kwh',
    name: 'Consumo de energía por unidad producida (kWh)',
    unit: 'number',
    kind: 'outcome',
    direction: 'decreasing',
    frequency: 'monthly',
    baseline: '38',
    target: '30',
    source: 'Medición de energía de la planta',
    description:
      'Kilovatios hora consumidos por la planta dividido las unidades producidas en el mes.',
    entries: [
      { bucketIndex: 2, increment: '-0.6' },
      { bucketIndex: 4, increment: '-0.8' },
      { bucketIndex: 6, increment: '-0.8' },
      { bucketIndex: 8, increment: '-0.7' },
      { bucketIndex: 9, increment: '-0.5' },
    ],
  },
  {
    key: 'accidentes',
    name: 'Accidentes con baja',
    unit: 'number',
    kind: 'outcome',
    direction: 'decreasing',
    frequency: 'quarterly',
    baseline: '6',
    target: '0',
    source: 'Higiene y seguridad',
    description: 'Accidentes laborales con días de baja, medición trimestral.',
    entries: [
      { bucketIndex: 0, increment: '-1' },
      { bucketIndex: 1, increment: '-1' },
      { bucketIndex: 2, increment: '-1' },
      { bucketIndex: 3, increment: '-1' },
    ],
  },
  {
    key: 'capacitacion',
    name: 'Horas de capacitación',
    unit: 'number',
    kind: 'output',
    direction: 'increasing',
    frequency: 'monthly',
    baseline: '0',
    target: '1800',
    source: 'Personas',
    description:
      'Horas de capacitación dictadas al personal de planta (indicador de contexto de seguridad).',
    entries: [120, 150, 200, 180, 160, 220, 140, 210, 190, 80].map((h, i) => ({
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

const OBJECTIVES: SeedObjective[] = [
  {
    key: 'oee',
    title: 'Aumentar la eficiencia de la línea de heladeras',
    description:
      'Llevar el OEE de la línea de heladeras del 62 % al 75 % reduciendo paradas y tiempos de cambio.',
    unitKey: 'planta',
    axisKey: 'excelencia',
    ownerKey: 'mrodriguez',
    indicators: [{ metricKey: 'oee' }],
    projects: [
      {
        key: 'tpm',
        title: 'TPM en la línea de heladeras',
        description:
          'Mantenimiento productivo total con operarios y mantenimiento trabajando juntos.',
        ownerKey: 'mrodriguez',
        weightBp: 6000,
        tasks: [
          {
            title: 'Diagnóstico de pérdidas de la línea',
            ownerKey: 'mrodriguez',
            start: [1, 12],
            end: [2, 27],
            progressBp: 10000,
            weightBp: 2000,
          },
          {
            title: 'Capacitación de operarios en mantenimiento autónomo',
            ownerKey: 'mrodriguez',
            start: [3, 2],
            end: [5, 29],
            progressBp: 10000,
            weightBp: 2000,
          },
          {
            title: 'Implementación de rutinas de mantenimiento autónomo',
            ownerKey: 'mrodriguez',
            start: [6, 1],
            end: [9, 30],
            progressBp: 6000,
            weightBp: 3500,
          },
          {
            title: 'Medición y estandarización de resultados',
            ownerKey: 'mrodriguez',
            start: [10, 1],
            end: [12, 18],
            progressBp: 0,
            weightBp: 2500,
          },
        ],
      },
      {
        key: 'smed',
        title: 'Cambio rápido de matrices (SMED)',
        ownerKey: 'mrodriguez',
        weightBp: 4000,
        tasks: [
          {
            title: 'Filmación y análisis de los cambios de matriz',
            ownerKey: 'mrodriguez',
            start: [2, 2],
            end: [3, 13],
            progressBp: 10000,
            weightBp: 2000,
          },
          {
            title: 'Rediseño de matrices y fijaciones',
            ownerKey: 'sbenitez',
            start: [3, 16],
            end: [7, 31],
            progressBp: 10000,
            weightBp: 3000,
          },
          {
            title: 'Pruebas piloto en la prensa 2',
            ownerKey: 'mrodriguez',
            start: [8, 3],
            end: [10, 30],
            progressBp: 5000,
            weightBp: 3000,
          },
          {
            title: 'Capacitación y estándar de cambio',
            ownerKey: 'mrodriguez',
            start: [11, 2],
            end: [12, 11],
            progressBp: 0,
            weightBp: 2000,
          },
        ],
      },
    ],
  },
  {
    key: 'garantia',
    title: 'Reducir los reclamos en garantía',
    description:
      'Bajar de 18 a 10 los reclamos cada 1000 unidades detectando las fallas antes de la venta.',
    unitKey: 'calidad',
    axisKey: 'excelencia',
    ownerKey: 'lfernandez',
    indicators: [{ metricKey: 'reclamos-garantia' }],
    projects: [
      {
        key: 'vida-acelerada',
        title: 'Ensayos de vida acelerada en lavarropas',
        ownerKey: 'lfernandez',
        tasks: [
          {
            title: 'Diseño del plan de ensayos',
            ownerKey: 'lfernandez',
            start: [1, 19],
            end: [3, 6],
            progressBp: 10000,
          },
          {
            title: 'Construcción del banco de ensayos',
            ownerKey: 'lfernandez',
            start: [3, 9],
            end: [6, 19],
            progressBp: 10000,
          },
          {
            title: 'Ciclos de ensayo por lote',
            ownerKey: 'lfernandez',
            start: [6, 22],
            end: [11, 13],
            progressBp: 7500,
          },
          {
            title: 'Informe y acciones correctivas',
            ownerKey: 'sbenitez',
            start: [11, 16],
            end: [12, 18],
            progressBp: 0,
          },
        ],
      },
    ],
  },
  {
    key: 'online',
    title: 'Crecer en el canal online',
    description:
      'Pasar del 12 % al 20 % de las ventas por canales online con tienda propia y marketplaces.',
    unitKey: 'ecommerce',
    axisKey: 'crecimiento',
    ownerKey: 'cpereyra',
    indicators: [{ metricKey: 'online' }],
    projects: [
      {
        key: 'tienda',
        title: 'Nueva tienda online',
        ownerKey: 'cpereyra',
        tasks: [
          {
            title: 'Selección de la plataforma de comercio',
            ownerKey: 'cpereyra',
            start: [2, 2],
            end: [3, 13],
            progressBp: 10000,
          },
          {
            title: 'Diseño y desarrollo de la tienda',
            ownerKey: 'cpereyra',
            start: [3, 16],
            end: [8, 14],
            progressBp: 7000,
          },
          {
            title: 'Carga de catálogo y fotos',
            ownerKey: 'cpereyra',
            start: [7, 1],
            end: [9, 11],
            progressBp: 2500,
          },
          {
            title: 'Lanzamiento y campaña',
            ownerKey: 'cpereyra',
            start: [9, 14],
            end: [11, 30],
            progressBp: 0,
          },
        ],
      },
      {
        key: 'marketplaces',
        title: 'Integración con marketplaces',
        ownerKey: 'cpereyra',
        tasks: [
          {
            title: 'Acuerdos comerciales con los marketplaces',
            ownerKey: 'cpereyra',
            start: [3, 2],
            end: [5, 29],
            progressBp: 10000,
          },
          {
            title: 'Integración de stock y precios',
            ownerKey: 'cpereyra',
            start: [6, 1],
            end: [10, 16],
            progressBp: 3500,
          },
          {
            title: 'Logística de despacho a clientes finales',
            ownerKey: 'cpereyra',
            start: [9, 1],
            end: [11, 27],
            progressBp: 0,
          },
          {
            title: 'Gestión de reclamos y devoluciones',
            ownerKey: 'cpereyra',
            start: [11, 2],
            end: [12, 18],
            progressBp: 0,
          },
        ],
      },
    ],
  },
  {
    key: 'posventa',
    title: 'Mejorar la experiencia de posventa',
    description:
      'Subir el NPS de 32 a 45 con un service oficial cercano al cliente en todo el país.',
    unitKey: 'posventa',
    axisKey: 'crecimiento',
    ownerKey: 'dsosa',
    indicators: [{ metricKey: 'nps' }],
    projects: [
      {
        key: 'red-service',
        title: 'Red de service oficial en el interior',
        ownerKey: 'dsosa',
        tasks: [
          {
            title: 'Mapeo de zonas sin cobertura',
            ownerKey: 'dsosa',
            start: [1, 12],
            end: [2, 27],
            progressBp: 10000,
          },
          {
            title: 'Selección y alta de talleres de service',
            ownerKey: 'dsosa',
            start: [3, 2],
            end: [6, 30],
            progressBp: 10000,
          },
          {
            title: 'Capacitación técnica de los talleres',
            ownerKey: 'dsosa',
            start: [7, 1],
            end: [9, 30],
            progressBp: 9000,
          },
          {
            title: 'Sistema regional de repuestos',
            ownerKey: 'sbenitez',
            start: [8, 3],
            end: [11, 27],
            progressBp: 4500,
          },
          {
            title: 'Auditoría de la calidad de atención',
            ownerKey: 'dsosa',
            start: [11, 2],
            end: [12, 18],
            progressBp: 0,
          },
        ],
      },
    ],
  },
  {
    key: 'inverter',
    title: 'Lanzar la línea inverter A+++',
    description:
      'Cuatro modelos con tecnología inverter y clase de eficiencia A+++, uno por proyecto.',
    unitKey: 'ingenieria',
    axisKey: 'innovacion',
    ownerKey: 'aibarra',
    indicators: [{ metricKey: 'inverter', feedsFromProjects: true }],
    projects: [
      {
        key: 'inv-heladera',
        title: 'Heladera inverter A+++',
        ownerKey: 'aibarra',
        contribution: { metricKey: 'inverter', value: '1' },
        tasks: [
          {
            title: 'Diseño del compresor y del gabinete',
            ownerKey: 'aibarra',
            start: [1, 12],
            end: [3, 13],
            progressBp: 10000,
          },
          {
            title: 'Prototipos y ensayos energéticos',
            ownerKey: 'aibarra',
            start: [3, 16],
            end: [5, 15],
            progressBp: 10000,
          },
          {
            title: 'Homologación y etiquetado',
            ownerKey: 'lfernandez',
            start: [5, 18],
            end: [6, 26],
            progressBp: 10000,
          },
          {
            title: 'Puesta en producción',
            ownerKey: 'mrodriguez',
            start: [6, 29],
            end: [7, 31],
            progressBp: 10000,
          },
        ],
      },
      {
        key: 'inv-lavarropas',
        title: 'Lavarropas inverter A+++',
        ownerKey: 'aibarra',
        contribution: { metricKey: 'inverter', value: '1' },
        tasks: [
          {
            title: 'Diseño del motor y del tambor',
            ownerKey: 'aibarra',
            start: [1, 26],
            end: [3, 27],
            progressBp: 10000,
          },
          {
            title: 'Prototipos y ensayos de consumo',
            ownerKey: 'aibarra',
            start: [3, 30],
            end: [6, 5],
            progressBp: 10000,
          },
          {
            title: 'Homologación y etiquetado',
            ownerKey: 'lfernandez',
            start: [6, 8],
            end: [7, 17],
            progressBp: 10000,
          },
          {
            title: 'Puesta en producción',
            ownerKey: 'mrodriguez',
            start: [7, 20],
            end: [8, 21],
            progressBp: 10000,
          },
        ],
      },
      {
        key: 'inv-freezer',
        title: 'Freezer inverter A+++',
        ownerKey: 'aibarra',
        contribution: { metricKey: 'inverter', value: '1' },
        tasks: [
          {
            title: 'Diseño del compresor y del aislamiento',
            ownerKey: 'aibarra',
            start: [3, 2],
            end: [5, 8],
            progressBp: 10000,
          },
          {
            title: 'Prototipos y ensayos energéticos',
            ownerKey: 'aibarra',
            start: [5, 11],
            end: [7, 31],
            progressBp: 10000,
          },
          {
            title: 'Homologación y etiquetado',
            ownerKey: 'lfernandez',
            start: [8, 3],
            end: [9, 18],
            progressBp: 6000,
          },
          {
            title: 'Puesta en producción',
            ownerKey: 'mrodriguez',
            start: [9, 21],
            end: [10, 30],
            progressBp: 0,
          },
        ],
      },
      {
        key: 'inv-aire',
        title: 'Aire acondicionado inverter A+++',
        ownerKey: 'aibarra',
        contribution: { metricKey: 'inverter', value: '1' },
        tasks: [
          {
            title: 'Diseño del circuito frigorífico',
            ownerKey: 'aibarra',
            start: [6, 1],
            end: [8, 14],
            progressBp: 8000,
          },
          {
            title: 'Prototipos y ensayos energéticos',
            ownerKey: 'aibarra',
            start: [8, 17],
            end: [11, 13],
            progressBp: 2000,
          },
          {
            title: 'Homologación y etiquetado',
            ownerKey: 'lfernandez',
            start: [11, 16],
            end: [12, 4],
            progressBp: 0,
          },
          {
            title: 'Puesta en producción',
            ownerKey: 'mrodriguez',
            start: [12, 7],
            end: [12, 22],
            progressBp: 0,
          },
        ],
      },
    ],
  },
  {
    key: 'energia',
    title: 'Reducir la energía por unidad producida',
    description:
      'Bajar el consumo de 38 a 30 kWh por unidad con generación propia y mejores prácticas.',
    unitKey: 'operaciones',
    axisKey: 'sustentabilidad',
    ownerKey: 'sbenitez',
    indicators: [{ metricKey: 'kwh' }],
    projects: [
      {
        key: 'paneles',
        title: 'Paneles solares en el techo de la planta',
        ownerKey: 'sbenitez',
        tasks: [
          {
            title: 'Estudio de factibilidad y cálculo de carga',
            ownerKey: 'sbenitez',
            start: [1, 12],
            end: [2, 20],
            progressBp: 10000,
          },
          {
            title: 'Licitación y contratación del proveedor',
            ownerKey: 'sbenitez',
            start: [2, 23],
            end: [4, 30],
            progressBp: 10000,
          },
          {
            title: 'Montaje de paneles y conexión',
            ownerKey: 'mrodriguez',
            start: [5, 4],
            end: [9, 11],
            progressBp: 8000,
          },
          {
            title: 'Habilitación con la distribuidora eléctrica',
            ownerKey: 'sbenitez',
            start: [9, 14],
            end: [10, 30],
            progressBp: 2000,
          },
          {
            title: 'Puesta en marcha y medición',
            ownerKey: 'sbenitez',
            start: [11, 2],
            end: [11, 27],
            progressBp: 0,
          },
        ],
      },
    ],
  },
  {
    key: 'seguridad',
    title: 'Cero accidentes con baja',
    description:
      'Llegar a cero accidentes con baja con orden, capacitación y disciplina operativa.',
    unitKey: 'personas',
    axisKey: 'personas',
    ownerKey: 'gmolina',
    indicators: [{ metricKey: 'accidentes' }],
    contextMetricKeys: ['capacitacion'],
    projects: [
      {
        key: 'cinco-s',
        title: 'Programa de seguridad 5S',
        ownerKey: 'gmolina',
        tasks: [
          {
            title: 'Diagnóstico 5S por sector',
            ownerKey: 'gmolina',
            start: [2, 2],
            end: [3, 13],
            progressBp: 10000,
          },
          {
            title: 'Clasificación y orden de los puestos',
            ownerKey: 'gmolina',
            start: [3, 16],
            end: [6, 12],
            progressBp: 10000,
          },
          {
            title: 'Limpieza y estandarización',
            ownerKey: 'gmolina',
            start: [6, 15],
            end: [9, 25],
            progressBp: 10000,
          },
          {
            title: 'Auditorías mensuales y disciplina',
            ownerKey: 'gmolina',
            start: [9, 28],
            end: [12, 18],
            progressBp: 2500,
          },
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
    create: { id: ORG_ID, slug: ORG_SLUG, name: ORG_NAME, status: 'active', sector: 'private' },
    update: { name: ORG_NAME, status: 'active', sector: 'private' },
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

  for (const moduleKey of ['okr', 'indicadores-gestion', 'indicadores-okr', 'mcp']) {
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
      where: { id: `seed-user-lumbre-${person.key}` },
      create: {
        id: `seed-user-lumbre-${person.key}`,
        auth0Sub: `seed|lumbre-${person.key}`,
        email: `${person.key}@lumbre.local`,
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
      id: 'lumbre-plan',
      organizationId: orgId,
      title: `Plan estratégico ${YEAR}-${YEAR + 2}`,
      vision:
        'Ser la marca de electrodomésticos preferida de los hogares argentinos por su durabilidad, su eficiencia energética y su servicio.',
      mandateStartsAt: utc(1, 1),
      mandateEndsAt: utc(12, 31, YEAR + 2),
      status: 'active',
    },
  });
  const axisIds: Record<string, string> = {};
  for (const [i, axis] of AXES.entries()) {
    const id = `lumbre-axis-${axis.key}`;
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
    name: 'Dirección General',
    vision: 'Una empresa que crece con productos de los que sus clientes se enorgullecen.',
    mission: 'Conducir la estrategia de Lumbre y coordinar a todas las direcciones.',
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
        id: `lumbre-unit-${def.key}`,
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
    const id = `lumbre-metric-${m.key}`;
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
          id: `lumbre-entry-${m.key}-${i}`,
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
    const objectiveId = `lumbre-obj-${o.key}`;
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
          id: `lumbre-oi-${o.key}-${m.key}`,
          organizationId: orgId,
          objectiveId,
          metricId: `lumbre-metric-${m.key}`,
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
          metricId: `lumbre-metric-${key}`,
          objectiveId,
          organizationId: orgId,
          createdByUserId: admin.id,
        },
      });
    }

    // Proyectos y tareas -> lectura de gestión
    const projectBp: Array<{ weightBp: number | null; progressBp: number }> = [];
    for (const p of o.projects) {
      const projectId = `lumbre-proj-${p.key}`;
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
          appliedEntryId = `lumbre-entry-auto-${p.key}`;
          await prisma.metricEntry.create({
            data: {
              id: appliedEntryId,
              metricId: `lumbre-metric-${metric.key}`,
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
            id: `lumbre-contrib-${p.key}-${p.contribution.metricKey}`,
            organizationId: orgId,
            projectId,
            objectiveIndicatorId: `lumbre-oi-${o.key}-${p.contribution.metricKey}`,
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

/** Siembra la org demo privada (ADR-0011 D8). El orquestador maneja la conexión y el manejo de errores. */
export async function seedLumbre(client: PrismaClient): Promise<void> {
  prisma = client;
  await main();
}
