import { SECTOR_TERMS } from '@gestion-publica/shared-types/core';
import type { SectorLabels } from '../sector-labels';

const T = SECTOR_TERMS.private;
const RANGE_INVALID = 'El fin de la vigencia tiene que ser posterior al inicio.';

/** Sector privado (empresas). */
export const PRIVATE_LABELS = {
  plan: {
    singular: T.plan,
    navLabel: 'Plan estratégico',
    vision: T.visionPlan,
    term: T.term,
    termStart: 'Inicio de la vigencia',
    termEnd: 'Fin de la vigencia',
    termRange: (from, to) => `Vigencia: ${from} al ${to}`,
    rangeInvalid: RANGE_INVALID,
    formDescription:
      'Es la visión estratégica de la empresa para el horizonte del plan. Solo hay un plan vigente por organización.',
    titlePlaceholder: 'Ej: Plan estratégico 2026-2028',
    visionPlaceholder: 'Hacia dónde va la empresa en los próximos años...',
    emptyTitle: 'Aún no hay plan estratégico',
    emptyDescription:
      'Creá el plan con la visión estratégica y su vigencia. Después vas a poder agregar los ejes.',
    emptyCta: 'Crear plan estratégico',
    noOrg: 'Para ver el plan estratégico, primero elegí una organización activa en el selector de arriba.',
    axisCreateHint: 'Podés crearlos en Plan estratégico.',
  },
  orgUnitKind: T.orgUnitKind,
  orgUnit: {
    noAssignableUnits: 'Todavía no hay direcciones ni áreas. Creá la estructura en Configuración → Estructura.',
  },
  planningTreeText: {
    subtitle:
      'Cómo avanza el plan estratégico, por eje o por unidad. El resultado y la gestión se leen por separado.',
    noPlan: 'Sin plan estratégico activo',
    noPlanHint:
      'Podés ver igual los objetivos del período por unidad. Creá el plan en Plan estratégico para agruparlos por eje.',
  },
  indicatorKind: {
    output: { label: 'Producto', hint: 'lo que se entrega (unidades producidas, entregas, cantidad)' },
    outcome: { label: 'Resultado', hint: 'el cambio que se busca (satisfacción, calidad, participación)' },
  },
  placeholders: {
    orgName: 'Ej: Lumbre Electrodomésticos',
    orgSlug: 'ej-lumbre',
    unitName: 'Ej: Dirección Industrial',
    metricSource: 'Ej: Sistema de gestión de planta',
    objectiveTitle: 'Ej: Reducir los reclamos en garantía',
    orgMission: 'Ej: Fabricar electrodomésticos confiables y eficientes para los hogares de la región...',
    orgVision: 'Ej: Ser la marca de electrodomésticos preferida del país...',
    orgValues: 'Ej: Calidad, seguridad, eficiencia, respeto por el cliente...',
  },
  errors: {
    OrgUnitInvalidParentKind:
      'Ese tipo de unidad no puede depender de la unidad padre elegida. La Dirección General o una dirección admiten direcciones y áreas; un área solo admite áreas.',
    OrgUnitKindInvalid:
      'Un objetivo solo se puede asignar a una dirección o a un área, no a la Dirección General.',
    AxisNotInActivePlan: 'El eje elegido no pertenece al plan estratégico vigente.',
    StrategicPlanRequired: 'Primero tenés que crear el plan estratégico para poder agregar ejes.',
    StrategicPlanNotFound: 'La organización todavía no tiene un plan estratégico.',
    MandateRangeInvalid: RANGE_INVALID,
  },
} satisfies SectorLabels;
