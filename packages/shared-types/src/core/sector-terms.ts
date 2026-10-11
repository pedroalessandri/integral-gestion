/**
 * Sector de la organización (ADR-0011). Elige el diccionario de terminología de la UI y del conector MCP.
 * No cambia reglas de dominio, permisos, módulos ni cálculos.
 */
export const ORGANIZATION_SECTORS = ['public', 'private', 'nonprofit'] as const;

export type OrganizationSector = (typeof ORGANIZATION_SECTORS)[number];

export const DEFAULT_ORGANIZATION_SECTOR: OrganizationSector = 'public';

/** Términos núcleo que dependen del sector (ADR-0011 D4). Datos puros, sin React. */
export interface SectorTerms {
  /** Nombre del plan de N1 (nav, título). */
  plan: string;
  /** Nombre de la visión del plan. */
  visionPlan: string;
  /** Nombre de la vigencia del plan (`mandateStartsAt/EndsAt`). */
  term: string;
  /** Etiqueta de cada tipo de `OrgUnit.kind`. */
  orgUnitKind: {
    central: string;
    ministry: string;
    area: string;
  };
}

export const SECTOR_TERMS: Record<OrganizationSector, SectorTerms> = {
  public: {
    plan: 'Plan de gobierno',
    visionPlan: 'Visión general de gobierno',
    term: 'Mandato',
    orgUnitKind: {
      central: 'Central',
      ministry: 'Ministerio / Secretaría',
      area: 'Área / Dirección',
    },
  },
  private: {
    plan: 'Plan estratégico',
    visionPlan: 'Visión estratégica',
    term: 'Vigencia',
    orgUnitKind: {
      central: 'Dirección General',
      ministry: 'Dirección',
      area: 'Área',
    },
  },
  nonprofit: {
    plan: 'Plan estratégico institucional',
    visionPlan: 'Visión institucional',
    term: 'Vigencia',
    orgUnitKind: {
      central: 'Dirección Ejecutiva',
      ministry: 'Área',
      area: 'Programa',
    },
  },
};

/**
 * Términos de vocabulario exclusivo del sector público. No pueden aparecer fuera del diccionario público
 * (ADR-0011 D7). Compartida por los tests guard de la web y de la API.
 */
export const FORBIDDEN_PUBLIC_SECTOR_TERMS: readonly RegExp[] = [
  /gobierno/i,
  /mandato/i,
  /ministeri/i,
  /secretar[ií]a/i,
  /municip/i,
  /ciudadan/i,
  /vecin(o|al)/i,
  /intendent/i,
  /concejo/i,
  /servicios? p[uú]blicos?/i,
];
