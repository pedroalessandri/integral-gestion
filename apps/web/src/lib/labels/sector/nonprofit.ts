import { SECTOR_TERMS } from '@gestion-publica/shared-types/core';
import type { SectorLabels } from '../sector-labels';

const T = SECTOR_TERMS.nonprofit;
const RANGE_INVALID = 'El fin de la vigencia tiene que ser posterior al inicio.';

/** Organizaciones sin fines de lucro (fundaciones, asociaciones civiles, cooperativas). */
export const NONPROFIT_LABELS = {
  plan: {
    singular: T.plan,
    navLabel: 'Plan institucional',
    vision: T.visionPlan,
    term: T.term,
    termStart: 'Inicio de la vigencia',
    termEnd: 'Fin de la vigencia',
    termRange: (from, to) => `Vigencia: ${from} al ${to}`,
    rangeInvalid: RANGE_INVALID,
    formDescription:
      'Es la visión institucional de la organización para el horizonte del plan. Solo hay un plan vigente por organización.',
    titlePlaceholder: 'Ej: Plan estratégico institucional 2026-2028',
    visionPlaceholder: 'Qué cambio busca la organización en su comunidad en los próximos años...',
    emptyTitle: 'Aún no hay plan estratégico institucional',
    emptyDescription:
      'Creá el plan con la visión institucional y su vigencia. Después vas a poder agregar los ejes.',
    emptyCta: 'Crear plan estratégico institucional',
    noOrg:
      'Para ver el plan estratégico institucional, primero elegí una organización activa en el selector de arriba.',
    axisCreateHint: 'Podés crearlos en Plan estratégico institucional.',
  },
  orgUnitKind: T.orgUnitKind,
  orgUnit: {
    noAssignableUnits: 'Todavía no hay áreas ni programas. Creá la estructura en Configuración → Estructura.',
  },
  planningTreeText: {
    subtitle:
      'Cómo avanza el plan estratégico institucional, por eje o por unidad. El resultado y la gestión se leen por separado.',
    noPlan: 'Sin plan estratégico institucional activo',
    noPlanHint:
      'Podés ver igual los objetivos del período por unidad. Creá el plan en Plan estratégico institucional para agruparlos por eje.',
  },
  indicatorKind: {
    output: { label: 'Producto', hint: 'lo que se entrega (personas alcanzadas, talleres dictados, cantidad)' },
    outcome: {
      label: 'Resultado',
      hint: 'el cambio que se busca (inserción laboral, donantes recurrentes, calidad de vida)',
    },
  },
  placeholders: {
    orgName: 'Ej: Fundación Puentes',
    orgSlug: 'ej-fundacion-puentes',
    unitName: 'Ej: Programa de Empleo Joven',
    metricSource: 'Ej: Registro de beneficiarios del programa',
    objectiveTitle: 'Ej: Ampliar el alcance de los talleres en la comunidad',
    orgMission: 'Ej: Acompañar a jóvenes de la comunidad en su inserción laboral...',
    orgVision: 'Ej: Una comunidad donde cada joven accede a un trabajo digno...',
    orgValues: 'Ej: Compromiso, transparencia, solidaridad, respeto por la comunidad...',
  },
  errors: {
    OrgUnitInvalidParentKind:
      'Ese tipo de unidad no puede depender de la unidad padre elegida. La Dirección Ejecutiva o un área admiten áreas y programas; un programa solo admite programas.',
    OrgUnitKindInvalid:
      'Un objetivo solo se puede asignar a un área o a un programa, no a la Dirección Ejecutiva.',
    AxisNotInActivePlan: 'El eje elegido no pertenece al plan estratégico institucional vigente.',
    StrategicPlanRequired: 'Primero tenés que crear el plan estratégico institucional para poder agregar ejes.',
    StrategicPlanNotFound: 'La organización todavía no tiene un plan estratégico institucional.',
    MandateRangeInvalid: RANGE_INVALID,
  },
} satisfies SectorLabels;
