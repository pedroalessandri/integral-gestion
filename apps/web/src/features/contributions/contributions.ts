import type {
  IndicatorStatusDto,
  MetricEntryDto,
  ObjectiveIndicatorDto,
  ProjectContributionDto,
} from '@gestion-publica/shared-types/metrics';
import { scaleDecimal } from '@/features/indicators/decimal';

/** Valor de un aporte: decimal (hasta 4 decimales) y distinto de cero; el signo no se valida (decisión de Pedro). */
export function validateContributionValue(raw: string): string | null {
  const scaled = scaleDecimal(raw);
  if (scaled === null || scaled === BigInt(0)) return 'Ingresá un número distinto de cero (hasta 4 decimales).';
  return null;
}

/** Indicadores a los que un proyecto puede aportar: `output` + `execution_feeds_indicator` (RN-P12, RN-P14b). */
export function isContributionTarget(indicator: Pick<ObjectiveIndicatorDto, 'kind' | 'linkMode'>): boolean {
  return indicator.kind === 'output' && indicator.linkMode === 'execution_feeds_indicator';
}

export interface ContributionOptions {
  /** Indicadores elegibles del objetivo a los que el proyecto todavía no aporta. */
  available: ObjectiveIndicatorDto[];
  /** Hay indicadores elegibles pero el proyecto ya aporta a todos. */
  allUsed: boolean;
  /** El objetivo no tiene ningún indicador elegible. */
  noneEligible: boolean;
}

export function contributionOptions(
  indicators: ReadonlyArray<ObjectiveIndicatorDto>,
  contributions: ReadonlyArray<Pick<ProjectContributionDto, 'objectiveIndicatorId'>>,
): ContributionOptions {
  const eligible = indicators.filter(isContributionTarget);
  const used = new Set(contributions.map((c) => c.objectiveIndicatorId));
  const available = eligible.filter((i) => !used.has(i.id));
  return { available, allUsed: eligible.length > 0 && available.length === 0, noneEligible: eligible.length === 0 };
}

/** Un aporte aplicado no se edita ni se borra hasta que el proyecto baje del 100 % (la API responde 422). */
export function isContributionLocked(contribution: Pick<ProjectContributionDto, 'applied'>): boolean {
  return contribution.applied;
}

/** Pasos de la curva `from_projects` (RN-P17): el `endsAt` planificado del proyecto y su aporte. */
export function contributionSteps(
  contributions: ReadonlyArray<Pick<ProjectContributionDto, 'projectEndsAt' | 'contributionValue'>>,
): Array<{ endsAt: string; contributionValue: string }> {
  return contributions.map((c) => ({ endsAt: c.projectEndsAt, contributionValue: c.contributionValue }));
}

/** `from_projects` solo se ofrece para `output` + `execution_feeds_indicator` (RN-P17). */
export type FromProjectsAvailability = { available: true } | { available: false; reason: 'notOutput' | 'notLinked' };

export function fromProjectsAvailability(input: {
  kind: ObjectiveIndicatorDto['kind'];
  linkMode: ObjectiveIndicatorDto['linkMode'];
}): FromProjectsAvailability {
  if (input.kind !== 'output') return { available: false, reason: 'notOutput' };
  if (input.linkMode !== 'execution_feeds_indicator') return { available: false, reason: 'notLinked' };
  return { available: true };
}

export interface AutomaticEntryInfo {
  /** Título del proyecto de origen; `null` si ya no se conoce (se muestra el texto genérico). */
  projectTitle: string | null;
  /** Compensatoria: la generó la baja del proyecto por debajo del 100 %. */
  isCompensation: boolean;
}

/** `null` para las cargas manuales. El título sale de los aportes vivos del indicador (sin pedirlo por carga). */
export function automaticEntryInfo(
  entry: Pick<MetricEntryDto, 'origin' | 'sourceProjectId' | 'incrementValue'>,
  projectTitles: ReadonlyMap<string, string>,
): AutomaticEntryInfo | null {
  if (entry.origin !== 'project_contribution') return null;
  const scaled = scaleDecimal(entry.incrementValue);
  return {
    projectTitle: entry.sourceProjectId ? (projectTitles.get(entry.sourceProjectId) ?? null) : null,
    isCompensation: scaled !== null && scaled < BigInt(0),
  };
}

export function projectTitleMap(
  contributions: ReadonlyArray<Pick<ProjectContributionDto, 'projectId' | 'projectTitle'>>,
): Map<string, string> {
  return new Map(contributions.map((c) => [c.projectId, c.projectTitle]));
}

/** Aviso "los aportes no alcanzan la meta": solo con `coversTarget === false` explícito. */
export function contributionShortfall(
  status: Pick<IndicatorStatusDto, 'contributions'> | null,
): { count: number; total: string; projectedValue: string } | null {
  const c = status?.contributions;
  if (!c || c.coversTarget !== false) return null;
  return { count: c.count, total: c.total, projectedValue: c.projectedValue };
}
