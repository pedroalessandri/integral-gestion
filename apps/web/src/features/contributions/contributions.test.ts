import { describe, expect, it } from 'vitest';
import type { IndicatorStatusDto, ObjectiveIndicatorDto } from '@gestion-publica/shared-types/metrics';
import {
  automaticEntryInfo,
  contributionOptions,
  contributionShortfall,
  contributionSteps,
  fromProjectsAvailability,
  isContributionLocked,
  projectTitleMap,
  validateContributionValue,
} from './contributions';

const indicator = (over: Partial<ObjectiveIndicatorDto>): ObjectiveIndicatorDto =>
  ({ id: 'i1', kind: 'output', linkMode: 'execution_feeds_indicator', ...over }) as ObjectiveIndicatorDto;

describe('validateContributionValue', () => {
  it('acepta cualquier decimal distinto de cero, positivo o negativo', () => {
    expect(validateContributionValue('4')).toBeNull();
    expect(validateContributionValue('-2.5')).toBeNull();
    expect(validateContributionValue('0.0001')).toBeNull();
  });
  it('rechaza cero, vacío y no numéricos', () => {
    expect(validateContributionValue('0')).not.toBeNull();
    expect(validateContributionValue('0.0000')).not.toBeNull();
    expect(validateContributionValue('')).not.toBeNull();
    expect(validateContributionValue('4,5')).not.toBeNull();
    expect(validateContributionValue('1.23456')).not.toBeNull();
  });
});

describe('contributionOptions', () => {
  const indicators = [
    indicator({ id: 'a' }),
    indicator({ id: 'b', kind: 'outcome' }),
    indicator({ id: 'c', linkMode: 'independent' }),
    indicator({ id: 'd', linkMode: 'indicator_feeds_execution' }),
    indicator({ id: 'e' }),
  ];
  it('solo ofrece output + execution_feeds_indicator', () => {
    expect(contributionOptions(indicators, []).available.map((i) => i.id)).toEqual(['a', 'e']);
  });
  it('excluye los indicadores a los que el proyecto ya aporta', () => {
    const o = contributionOptions(indicators, [{ objectiveIndicatorId: 'a' }]);
    expect(o.available.map((i) => i.id)).toEqual(['e']);
    expect(o.allUsed).toBe(false);
  });
  it('distingue "ya aporta a todos" de "no hay elegibles"', () => {
    const all = contributionOptions(indicators, [{ objectiveIndicatorId: 'a' }, { objectiveIndicatorId: 'e' }]);
    expect(all).toMatchObject({ allUsed: true, noneEligible: false });
    expect(contributionOptions([indicator({ kind: 'outcome' })], [])).toMatchObject({
      allUsed: false,
      noneEligible: true,
    });
  });
});

describe('isContributionLocked / contributionSteps', () => {
  it('un aporte aplicado está bloqueado', () => {
    expect(isContributionLocked({ applied: true })).toBe(true);
    expect(isContributionLocked({ applied: false })).toBe(false);
  });
  it('los pasos usan el endsAt planificado y el valor', () => {
    expect(contributionSteps([{ projectEndsAt: '2027-06-30T00:00:00.000Z', contributionValue: '4' }])).toEqual([
      { endsAt: '2027-06-30T00:00:00.000Z', contributionValue: '4' },
    ]);
  });
});

describe('fromProjectsAvailability', () => {
  it('habilitada solo con output + execution_feeds_indicator', () => {
    expect(fromProjectsAvailability({ kind: 'output', linkMode: 'execution_feeds_indicator' })).toEqual({
      available: true,
    });
    expect(fromProjectsAvailability({ kind: 'outcome', linkMode: 'execution_feeds_indicator' })).toEqual({
      available: false,
      reason: 'notOutput',
    });
    expect(fromProjectsAvailability({ kind: 'output', linkMode: 'independent' })).toEqual({
      available: false,
      reason: 'notLinked',
    });
  });
});

describe('automaticEntryInfo', () => {
  const titles = projectTitleMap([{ projectId: 'p1', projectTitle: 'Ciclovía Av. Y' }]);
  it('es null para cargas manuales', () => {
    expect(automaticEntryInfo({ origin: 'manual', sourceProjectId: null, incrementValue: '3' }, titles)).toBeNull();
  });
  it('trae el título del proyecto de origen y marca la compensatoria', () => {
    expect(
      automaticEntryInfo({ origin: 'project_contribution', sourceProjectId: 'p1', incrementValue: '4' }, titles),
    ).toEqual({ projectTitle: 'Ciclovía Av. Y', isCompensation: false });
    expect(
      automaticEntryInfo({ origin: 'project_contribution', sourceProjectId: 'p1', incrementValue: '-4' }, titles),
    ).toEqual({ projectTitle: 'Ciclovía Av. Y', isCompensation: true });
  });
  it('sin título conocido devuelve null en projectTitle', () => {
    expect(
      automaticEntryInfo({ origin: 'project_contribution', sourceProjectId: 'zzz', incrementValue: '4' }, titles)
        ?.projectTitle,
    ).toBeNull();
  });
});

describe('contributionShortfall', () => {
  const status = (contributions: IndicatorStatusDto['contributions']) => ({ contributions });
  it('avisa solo con coversTarget === false', () => {
    expect(contributionShortfall(status({ count: 1, total: '4', projectedValue: '4', coversTarget: false }))).toEqual({
      count: 1,
      total: '4',
      projectedValue: '4',
    });
    expect(contributionShortfall(status({ count: 1, total: '4', projectedValue: '10', coversTarget: true }))).toBeNull();
  });
  it('no avisa si el indicador no recibe aportes o no hay estado', () => {
    expect(contributionShortfall(status(null))).toBeNull();
    expect(contributionShortfall(null)).toBeNull();
  });
});
