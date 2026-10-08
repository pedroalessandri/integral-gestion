/**
 * Puerto `PROJECT_LINK_READER` (ADR-0009 D5 / regla 15 de CLAUDE.md): `metrics` lee proyectos de forma sincrónica y
 * sin importar `okr` para validar y armar los aportes de proyectos a indicadores (RN-P12/P14b/P17).
 * Lo implementa `okr` (dueño de `okr.project`), solo lectura y depende únicamente de PrismaService.
 * Devuelve siempre proyectos VIVOS de la organización; un proyecto borrado o de otra org no existe para este puerto.
 */

/** Proyecto visto desde `metrics`. */
export interface ProjectLinkRef {
  id: string;
  objectiveId: string;
  title: string;
  /** Fecha de fin planificada: el paso de la curva `from_projects`. */
  endsAt: Date;
  /** Avance del proyecto en bp (0..10000); 10000 = completo. */
  progressBp: number;
  progressMode: 'from_tasks' | 'from_indicator';
  /** Indicador fuente cuando `progressMode = from_indicator`. */
  sourceObjectiveIndicatorId: string | null;
}

/** Implementa `okr`, inyecta `metrics`. */
export interface ProjectLinkReader {
  /** Proyecto vivo de la organización, o `null` si no existe, está borrado o es de otra org. */
  findLiveProject(organizationId: string, projectId: string): Promise<ProjectLinkRef | null>;
  /** De los ids dados, los proyectos vivos de la organización. */
  findLiveProjects(organizationId: string, projectIds: ReadonlyArray<string>): Promise<ProjectLinkRef[]>;
  /** Proyectos vivos que toman su avance del indicador dado (`from_indicator` con ese indicador fuente). */
  findLiveProjectsBySourceIndicator(organizationId: string, objectiveIndicatorId: string): Promise<ProjectLinkRef[]>;
}

export const PROJECT_LINK_READER = Symbol('PROJECT_LINK_READER');
