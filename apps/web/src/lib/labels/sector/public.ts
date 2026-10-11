import { SECTOR_TERMS } from '@gestion-publica/shared-types/core';
import type { SectorLabels } from '../sector-labels';

const T = SECTOR_TERMS.public;
const RANGE_INVALID = 'El fin del mandato tiene que ser posterior al inicio.';

/** Sector público: el vocabulario de planificación de gobierno (ADR-0009). Único archivo que puede usarlo (ADR-0011 D7). */
export const PUBLIC_LABELS = {
  plan: {
    singular: T.plan,
    navLabel: 'Plan de gobierno',
    vision: T.visionPlan,
    term: T.term,
    termStart: 'Inicio del mandato',
    termEnd: 'Fin del mandato',
    termRange: (from, to) => `Mandato: ${from} al ${to}`,
    rangeInvalid: RANGE_INVALID,
    formDescription: 'Es la visión general de gobierno del mandato. Solo hay un plan vigente por organización.',
    titlePlaceholder: 'Ej: Plan de gobierno 2026-2029',
    visionPlaceholder: 'Hacia dónde va el gobierno durante este mandato...',
    emptyTitle: 'Aún no hay plan de gobierno',
    emptyDescription:
      'Creá el plan con la visión general y el período del mandato. Después vas a poder agregar los ejes.',
    emptyCta: 'Crear plan de gobierno',
    noOrg: 'Para ver el plan de gobierno, primero elegí una organización activa en el selector de arriba.',
    axisCreateHint: 'Podés crearlos en Plan de gobierno.',
  },
  orgUnitKind: T.orgUnitKind,
  orgUnit: {
    noAssignableUnits: 'Todavía no hay ministerios ni áreas. Creá la estructura en Configuración → Estructura.',
  },
  planningTreeText: {
    subtitle:
      'Cómo avanza el plan de gobierno, por eje o por unidad. El resultado y la gestión se leen por separado.',
    noPlan: 'Sin plan de gobierno activo',
    noPlanHint:
      'Podés ver igual los objetivos del período por unidad. Creá el plan en Plan de gobierno para agruparlos por eje.',
  },
  indicatorKind: {
    output: { label: 'Producto', hint: 'lo que se entrega (km, obras, cantidad)' },
    outcome: { label: 'Resultado', hint: 'el cambio que se busca (alfabetización, calidad)' },
  },
  placeholders: {
    orgName: 'Ej: Ministerio de Salud',
    orgSlug: 'ej-ministerio-salud',
    unitName: 'Ej: Secretaría de Obras Públicas',
    metricSource: 'Ej: Registro de obras de la Secretaría',
    objectiveTitle: 'Ej: Mejorar atención ciudadana',
    orgMission: 'Ej: Facilitar el acceso de los ciudadanos a los servicios públicos mediante tecnología accesible...',
    orgVision: 'Ej: Ser la organización líder en servicios públicos digitales del país...',
    orgValues: 'Ej: Transparencia, cercanía, innovación, respeto por el ciudadano...',
  },
  errors: {
    OrgUnitInvalidParentKind:
      'Ese tipo de unidad no puede depender de la unidad padre elegida. Una unidad central o un ministerio admiten ministerios y áreas; un área solo admite áreas.',
    OrgUnitKindInvalid:
      'Un objetivo solo se puede asignar a un ministerio/secretaría o a un área/dirección, no a la unidad central.',
    AxisNotInActivePlan: 'El eje elegido no pertenece al plan de gobierno vigente.',
    StrategicPlanRequired: 'Primero tenés que crear el plan de gobierno para poder agregar ejes.',
    StrategicPlanNotFound: 'La organización todavía no tiene un plan de gobierno.',
    MandateRangeInvalid: RANGE_INVALID,
  },
} satisfies SectorLabels;
