import { describe, it, expect, vi } from 'vitest';
import { PROJECT_COMPLETED, PROJECT_REOPENED } from '@gestion-publica/shared-types/okr';
import { ProjectLifecycleListener } from './project-lifecycle.listener.js';

const base = {
  organizationId: 'org-1',
  actorId: 'user-1',
  requestId: 'req-1',
  projectId: 'p-1',
  projectTitle: 'Ciclovía Av. Y',
  objectiveId: 'obj-1',
  occurredAt: '2027-03-17T15:00:00.000Z',
};

describe('ProjectLifecycleListener', () => {
  it('project.completed y project.reopened reconcilian el proyecto con el contexto del evento', async () => {
    const applier = { reconcileProject: vi.fn().mockResolvedValue({ applied: 0, reverted: 0, removed: 0 }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listener = new ProjectLifecycleListener(applier as any);

    await listener.onCompleted(base);
    await listener.onReopened({ ...base, reason: 'deleted' });

    expect(applier.reconcileProject).toHaveBeenCalledTimes(2);
    expect(applier.reconcileProject).toHaveBeenNthCalledWith(1, {
      organizationId: 'org-1',
      actorId: 'user-1',
      requestId: 'req-1',
      projectId: 'p-1',
      projectTitle: 'Ciclovía Av. Y',
      occurredAt: new Date('2027-03-17T15:00:00.000Z'),
    });
  });

  it('los nombres de evento son los del contrato (ADR-0009 D5)', () => {
    expect(PROJECT_COMPLETED).toBe('project.completed');
    expect(PROJECT_REOPENED).toBe('project.reopened');
  });
});
