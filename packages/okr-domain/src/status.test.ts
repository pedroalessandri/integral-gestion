import { describe, it, expect } from 'vitest';
import { computeTaskStatus, computeProgressStatus, computeProjectStatus, isProjectDelayed } from './status';

describe('computeTaskStatus', () => {
  const past = new Date('2024-01-01T00:00:00Z');
  const future = new Date('2099-12-31T23:59:59Z');
  const now = new Date('2026-06-15T12:00:00Z');

  it('returns done when progressBp is exactly 10000', () => {
    expect(computeTaskStatus(10000, future, now)).toBe('done');
    // Even if already past endsAt, done takes priority
    expect(computeTaskStatus(10000, past, now)).toBe('done');
  });

  it('returns overdue when not done and endsAt is in the past', () => {
    expect(computeTaskStatus(0, past, now)).toBe('overdue');
    expect(computeTaskStatus(5000, past, now)).toBe('overdue');
    expect(computeTaskStatus(9999, past, now)).toBe('overdue');
  });

  it('returns in_progress when progress > 0 < 10000 and not past endsAt', () => {
    expect(computeTaskStatus(1, future, now)).toBe('in_progress');
    expect(computeTaskStatus(5000, future, now)).toBe('in_progress');
    expect(computeTaskStatus(9999, future, now)).toBe('in_progress');
  });

  it('returns pending when progress is 0 and not past endsAt', () => {
    expect(computeTaskStatus(0, future, now)).toBe('pending');
  });

  it('uses current Date when now is not provided', () => {
    // With a far-future endsAt and progress 0, should be pending
    const result = computeTaskStatus(0, new Date('2099-12-31T23:59:59Z'));
    expect(result).toBe('pending');
  });

  it('is exactly on the boundary: endsAt === now is NOT overdue', () => {
    // now > endsAt (strict), so exactly equal is not overdue
    expect(computeTaskStatus(0, now, now)).toBe('pending');
  });
});

describe('computeProgressStatus', () => {
  it('returns done when progressBp is 10000', () => {
    expect(computeProgressStatus(10000)).toBe('done');
  });

  it('returns done when progressBp exceeds 10000 (defensive)', () => {
    expect(computeProgressStatus(10001)).toBe('done');
  });

  it('returns in_progress for any value between 1 and 9999', () => {
    expect(computeProgressStatus(1)).toBe('in_progress');
    expect(computeProgressStatus(5000)).toBe('in_progress');
    expect(computeProgressStatus(9999)).toBe('in_progress');
  });

  it('returns pending when progressBp is 0', () => {
    expect(computeProgressStatus(0)).toBe('pending');
  });
});

describe('computeProjectStatus', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const past = new Date('2026-01-01T00:00:00Z');
  const future = new Date('2026-12-31T00:00:00Z');

  it('aplica la misma regla que las tareas', () => {
    expect(computeProjectStatus(10000, past, now)).toBe('done');
    expect(computeProjectStatus(5000, past, now)).toBe('overdue');
    expect(computeProjectStatus(5000, future, now)).toBe('in_progress');
    expect(computeProjectStatus(0, future, now)).toBe('pending');
  });
});

describe('isProjectDelayed', () => {
  const now = new Date('2026-06-15T12:00:00Z');
  const past = new Date('2026-01-01T00:00:00Z');
  const future = new Date('2026-12-31T00:00:00Z');

  it('proyecto vencido sin terminar: motivo vencido', () => {
    expect(
      isProjectDelayed({ progressBp: 4000, endsAt: past, progressMode: 'from_tasks', tasks: [] }, now),
    ).toEqual({ atrasado: true, motivos: ['vencido'] });
  });

  it('proyecto terminado no está atrasado aunque haya pasado su fecha', () => {
    expect(
      isProjectDelayed({ progressBp: 10000, endsAt: past, progressMode: 'from_tasks', tasks: [] }, now).atrasado,
    ).toBe(false);
  });

  it('tarea vencida en un proyecto en fecha: motivo tareas_vencidas', () => {
    expect(
      isProjectDelayed(
        {
          progressBp: 3000,
          endsAt: future,
          progressMode: 'from_tasks',
          tasks: [
            { progressBp: 10000, endsAt: past },
            { progressBp: 0, endsAt: past },
          ],
        },
        now,
      ),
    ).toEqual({ atrasado: true, motivos: ['tareas_vencidas'] });
  });

  it('ambos motivos juntos', () => {
    expect(
      isProjectDelayed(
        { progressBp: 3000, endsAt: past, progressMode: 'from_tasks', tasks: [{ progressBp: 0, endsAt: past }] },
        now,
      ).motivos,
    ).toEqual(['vencido', 'tareas_vencidas']);
  });

  it('en from_indicator ignora las tareas', () => {
    expect(
      isProjectDelayed(
        { progressBp: 3000, endsAt: future, progressMode: 'from_indicator', tasks: [{ progressBp: 0, endsAt: past }] },
        now,
      ),
    ).toEqual({ atrasado: false, motivos: [] });
  });
});
