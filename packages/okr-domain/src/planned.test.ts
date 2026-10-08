import { describe, it, expect } from 'vitest';
import { plannedProgress, plannedTaskProgressBp, plannedExecutionProgress } from './planned';
import { MixedWeightGroupError, computeProjectProgress, computeExecutionProgress } from './cascade';
import { validateWeightSumInvariant, projectSumAfterDelete, weightMode } from './invariants';

const d = (s: string) => new Date(s);

describe('plannedTaskProgressBp (RN-P9)', () => {
  const task = { startsAt: d('2026-01-01T00:00:00Z'), endsAt: d('2026-01-11T00:00:00Z') };
  it('0 before start, 10000 at/after end', () => {
    expect(plannedTaskProgressBp(task, d('2025-12-31T00:00:00Z'))).toBe(0);
    expect(plannedTaskProgressBp(task, d('2026-01-01T00:00:00Z'))).toBe(0);
    expect(plannedTaskProgressBp(task, d('2026-01-11T00:00:00Z'))).toBe(10000);
    expect(plannedTaskProgressBp(task, d('2027-01-01T00:00:00Z'))).toBe(10000);
  });
  it('interpolates linearly and truncates', () => {
    expect(plannedTaskProgressBp(task, d('2026-01-06T00:00:00Z'))).toBe(5000);
    const t = { startsAt: d('2026-01-01T00:00:00.000Z'), endsAt: d('2026-01-01T00:00:00.003Z') };
    expect(plannedTaskProgressBp(t, d('2026-01-01T00:00:00.001Z'))).toBe(3333);
  });
  it('zero duration: before end 0, at/after end 10000', () => {
    const t = { startsAt: d('2026-01-01T00:00:00Z'), endsAt: d('2026-01-01T00:00:00Z') };
    expect(plannedTaskProgressBp(t, d('2025-12-31T23:59:59Z'))).toBe(0);
    expect(plannedTaskProgressBp(t, d('2026-01-01T00:00:00Z'))).toBe(10000);
  });
  it('throws RangeError for endsAt < startsAt and invalid dates', () => {
    expect(() =>
      plannedTaskProgressBp({ startsAt: d('2026-02-01'), endsAt: d('2026-01-01') }, d('2026-01-15')),
    ).toThrow(RangeError);
    expect(() => plannedTaskProgressBp(task, new Date('nope'))).toThrow(RangeError);
    expect(() =>
      plannedTaskProgressBp({ startsAt: new Date('x'), endsAt: task.endsAt }, d('2026-01-05')),
    ).toThrow(RangeError);
  });
});

describe('plannedProgress (RN-P9)', () => {
  const a = { startsAt: d('2026-01-01T00:00:00Z'), endsAt: d('2026-01-11T00:00:00Z') };
  const b = { startsAt: d('2026-01-01T00:00:00Z'), endsAt: d('2026-01-03T00:00:00Z') };
  it('empty -> 0', () => {
    expect(plannedProgress([], d('2026-01-05'))).toBe(0);
  });
  it('simple mean without weights', () => {
    // a=5000 at Jan 6, b=10000 -> 7500
    expect(plannedProgress([a, b], d('2026-01-06T00:00:00Z'))).toBe(7500);
  });
  it('weighted mean', () => {
    expect(
      plannedProgress([{ ...a, weightBp: 8000 }, { ...b, weightBp: 2000 }], d('2026-01-06T00:00:00Z')),
    ).toBe(6000);
  });
  it('mixed throws MixedWeightGroupError', () => {
    expect(() => plannedProgress([{ ...a, weightBp: 10000 }, b], d('2026-01-06'))).toThrow(
      MixedWeightGroupError,
    );
  });
  it('invalid at throws RangeError', () => {
    expect(() => plannedProgress([], new Date('x'))).toThrow(RangeError);
  });
});

describe('project / execution progress (RN-P8)', () => {
  it('delegates with simple mean and weights', () => {
    expect(computeProjectProgress([{ progressBp: 3333 }, { progressBp: 3334 }])).toBe(3333);
    expect(computeExecutionProgress([{ weightBp: 7000, progressBp: 10000 }, { weightBp: 3000, progressBp: 0 }])).toBe(7000);
    expect(computeProjectProgress([])).toBe(0);
  });
});

describe('weight invariants (RN-P6/RN-P7)', () => {
  it('weightMode classifies', () => {
    expect(weightMode([])).toBe('unweighted');
    expect(weightMode([{ weightBp: null }, {}])).toBe('unweighted');
    expect(weightMode([{ weightBp: 0 }, { weightBp: 10000 }])).toBe('weighted');
    expect(weightMode([{ weightBp: 1 }, { weightBp: null }])).toBe('mixed');
  });
  it('unweighted group is ok', () => {
    expect(validateWeightSumInvariant([{ weightBp: null }, { weightBp: undefined }])).toEqual({ ok: true });
  });
  it('mixed group fails with reason mixed', () => {
    const r = validateWeightSumInvariant([{ weightBp: 10000 }, { weightBp: null }]);
    expect(r).toMatchObject({ ok: false, reason: 'mixed' });
  });
  it('wrong sum fails with legacy shape', () => {
    expect(validateWeightSumInvariant([{ weightBp: 4000 }, { weightBp: 5000 }])).toEqual({
      ok: false, actual: 9000, expected: 10000,
    });
  });
  it('projectSumAfterDelete on unweighted group stays valid', () => {
    expect(projectSumAfterDelete([{ id: 'a' }, { id: 'b' }], 'a')).toBe(10000);
    expect(projectSumAfterDelete([{ id: 'a' }], 'a')).toBe(0);
  });
  it('projectSumAfterDelete throws on mixed', () => {
    expect(() => projectSumAfterDelete([{ id: 'a', weightBp: 1 }, { id: 'b' }], 'a')).toThrow();
  });
});

describe('plannedExecutionProgress (RN-P9)', () => {
  const at = d('2026-01-06T00:00:00Z');
  const half = [{ startsAt: d('2026-01-01T00:00:00Z'), endsAt: d('2026-01-11T00:00:00Z') }]; // 5000
  const done = [{ startsAt: d('2025-01-01T00:00:00Z'), endsAt: d('2025-02-01T00:00:00Z') }]; // 10000

  it('empty -> 0', () => {
    expect(plannedExecutionProgress([], at)).toBe(0);
  });
  it('simple mean of the projects when none has weight', () => {
    expect(plannedExecutionProgress([{ tasks: half }, { tasks: done }], at)).toBe(7500);
  });
  it('weighted mean when all projects have weight', () => {
    expect(
      plannedExecutionProgress(
        [
          { weightBp: 8000, tasks: half },
          { weightBp: 2000, tasks: done },
        ],
        at,
      ),
    ).toBe(6000);
  });
  it('a project without tasks plans 0', () => {
    expect(plannedExecutionProgress([{ tasks: [] }, { tasks: done }], at)).toBe(5000);
  });
  it('mixed weights -> MixedWeightGroupError', () => {
    expect(() => plannedExecutionProgress([{ weightBp: 10000, tasks: half }, { tasks: done }], at)).toThrow(
      MixedWeightGroupError,
    );
  });
});
