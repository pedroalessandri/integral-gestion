/**
 * Aportes de proyectos a indicadores (RN-P12, RN-P13, RN-P14; ADR-0009 D2/D5). Decimales como string.
 * Un aporte solo existe sobre un indicador `output` con `linkMode = execution_feeds_indicator`.
 */

export interface ProjectContributionDto {
  id: string;
  projectId: string;
  /** Título del proyecto (lectura por el puerto de `okr`). */
  projectTitle: string;
  objectiveIndicatorId: string;
  /** Decimal string, distinto de cero. Lo que suma el proyecto al indicador al llegar al 100 %. */
  contributionValue: string;
  /** Avance actual del proyecto en bp (0..10000). */
  projectProgressBp: number;
  /** Fecha de fin planificada del proyecto (ISO-8601 UTC): el paso de la curva `from_projects` (RN-P17). */
  projectEndsAt: string;
  /** `true` si el aporte ya se aplicó al indicador (hay una carga automática vigente). */
  applied: boolean;
  /** Id de la carga automática vigente, o `null` si todavía no se aplicó. */
  appliedEntryId: string | null;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/** POST /okr/indicators/:indicatorId/contributions */
export interface CreateProjectContributionDto {
  projectId: string;
  /** Decimal string, distinto de cero. */
  contributionValue: string;
}

/** PATCH /okr/contributions/:id (solo si el aporte todavía no se aplicó). */
export interface UpdateProjectContributionDto {
  contributionValue: string;
}

/** Proyecto vinculado a un indicador, en el 422 que impide cambiar el vínculo o borrar el indicador. */
export interface LinkedProjectRefDto {
  id: string;
  title: string;
  /** Por qué el proyecto está vinculado. */
  link: 'contribution' | 'source_indicator';
}
