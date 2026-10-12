import { SECTOR_TERMS, type OrganizationSector } from '@gestion-publica/shared-types/core';
import type { OrgUnitKind } from '@gestion-publica/shared-types/core';

export interface TerminologiaDto {
  sector: OrganizationSector;
  plan: string;
  visionPlan: string;
  vigencia: string;
  tiposUnidad: { central: string; ministry: string; area: string };
}

function isSector(value: string): value is OrganizationSector {
  return Object.prototype.hasOwnProperty.call(SECTOR_TERMS, value);
}

/** Términos de la organización (ADR-0011): salen de `SECTOR_TERMS`, nunca de un parámetro libre. */
export function terminologiaDeSector(sector: string): TerminologiaDto {
  const key: OrganizationSector = isSector(sector) ? sector : 'public';
  const terms = SECTOR_TERMS[key];
  return {
    sector: key,
    plan: terms.plan,
    visionPlan: terms.visionPlan,
    vigencia: terms.term,
    tiposUnidad: { ...terms.orgUnitKind },
  };
}

export interface UnidadRefDto {
  id: string;
  nombre: string;
  tipo: OrgUnitKind;
  tipoEtiqueta: string;
}
