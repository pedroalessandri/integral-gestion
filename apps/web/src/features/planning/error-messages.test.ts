import { describe, expect, it } from 'vitest';
import { describeApiError, linkedProjectsFromDetails } from './error-messages';

describe('describeApiError: IndicatorHasLinkedProjects', () => {
  it('lista los proyectos vinculados con el motivo', () => {
    const msg = describeApiError({
      status: 422,
      code: 'IndicatorHasLinkedProjects',
      message: 'x',
      details: {
        projects: [
          { id: 'p1', title: 'Ciclovía Av. Y', link: 'contribution' },
          { id: 'p2', title: 'Plan hídrico', link: 'source_indicator' },
        ],
      },
    });
    expect(msg).toContain('"Ciclovía Av. Y" (aporta al indicador)');
    expect(msg).toContain('"Plan hídrico" (toma su avance del indicador)');
  });
  it('sin details devuelve solo el mensaje fijo', () => {
    const msg = describeApiError({ status: 422, code: 'IndicatorHasLinkedProjects', message: 'x' });
    expect(msg).not.toContain('Proyectos vinculados:');
  });
  it('ignora entradas con forma inesperada', () => {
    expect(linkedProjectsFromDetails({ projects: [null, 3, { id: 1 }, { id: 'a', title: 'B', link: 'contribution' }] })).toEqual([
      { id: 'a', title: 'B', link: 'contribution' },
    ]);
  });
});

describe('describeApiError: aportes', () => {
  it('traduce los 422/409 tipados de aportes', () => {
    expect(describeApiError({ status: 422, code: 'ContributionAlreadyApplied', message: '' })).toMatch(/100 %/);
    expect(describeApiError({ status: 409, code: 'ContributionAlreadyExists', message: '' })).toMatch(/ya tiene/);
    expect(describeApiError({ status: 422, code: 'AutomaticEntryReadOnly', message: '' })).toMatch(/solo lectura/);
  });
});

describe('describeApiError: OrgUnitScopeForbidden', () => {
  it('explica el alcance en lugar del 403 genérico', () => {
    const msg = describeApiError({ status: 403, code: 'OrgUnitScopeForbidden', message: 'x' });
    expect(msg).toContain('Tu alcance no incluye esta unidad');
  });
});
