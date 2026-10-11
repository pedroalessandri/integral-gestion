import type { OrgUnitKind, OrganizationSector } from '@gestion-publica/shared-types/core';
import type { MetricKind } from '@gestion-publica/shared-types/metrics';
import { LABELS } from './shared';
import { NONPROFIT_LABELS } from './sector/nonprofit';
import { PRIVATE_LABELS } from './sector/private';
import { PUBLIC_LABELS } from './sector/public';

/** Códigos de error cuyo texto depende del sector (ADR-0011 D3). El resto se traduce en `error-messages.ts`. */
export const SECTOR_ERROR_CODES = [
  'OrgUnitInvalidParentKind',
  'OrgUnitKindInvalid',
  'AxisNotInActivePlan',
  'StrategicPlanRequired',
  'StrategicPlanNotFound',
  'MandateRangeInvalid',
] as const;

export type SectorErrorCode = (typeof SECTOR_ERROR_CODES)[number];

/** Etiquetas que dependen del sector de la organización (ADR-0011 D4). Los tres diccionarios la implementan completa. */
export interface SectorLabels {
  plan: {
    /** Nombre del plan (título de la página, diálogos). */
    singular: string;
    /** Nombre corto para la navegación lateral. */
    navLabel: string;
    vision: string;
    /** Nombre de la vigencia del plan. */
    term: string;
    termStart: string;
    termEnd: string;
    termRange: (from: string, to: string) => string;
    rangeInvalid: string;
    formDescription: string;
    titlePlaceholder: string;
    visionPlaceholder: string;
    emptyTitle: string;
    emptyDescription: string;
    emptyCta: string;
    /** Aviso cuando no hay organización activa. */
    noOrg: string;
    /** Frase que completa "Todavía no hay ejes." en el selector de eje. */
    axisCreateHint: string;
  };
  orgUnitKind: Record<OrgUnitKind, string>;
  orgUnit: {
    /** Aviso del selector de unidad del objetivo cuando solo existe la unidad central. */
    noAssignableUnits: string;
  };
  planningTreeText: {
    subtitle: string;
    noPlan: string;
    noPlanHint: string;
  };
  indicatorKind: Record<MetricKind, { label: string; hint: string }>;
  placeholders: {
    orgName: string;
    orgSlug: string;
    unitName: string;
    metricSource: string;
    objectiveTitle: string;
    orgMission: string;
    orgVision: string;
    orgValues: string;
  };
  /** Texto por `code` de error de dominio con vocabulario del sector. */
  errors: Record<SectorErrorCode, string>;
}

const SECTOR_DICTIONARIES: Record<OrganizationSector, SectorLabels> = {
  public: PUBLIC_LABELS,
  private: PRIVATE_LABELS,
  nonprofit: NONPROFIT_LABELS,
};

export function getSectorLabels(sector: OrganizationSector): SectorLabels {
  return SECTOR_DICTIONARIES[sector];
}

/** Diccionario completo que ve la UI: compartido + sector. */
export type Labels = typeof LABELS & SectorLabels;

export function getLabelsForSector(sector: OrganizationSector): Labels {
  return { ...LABELS, ...getSectorLabels(sector) };
}
