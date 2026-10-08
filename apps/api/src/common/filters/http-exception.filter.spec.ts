import { describe, it, expect, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'PATCH', url: '/x' }),
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new HttpExceptionFilter().catch(exception, host as any);
  return { status, body: json.mock.calls[0]?.[0] as Record<string, unknown> };
}

describe('HttpExceptionFilter: details', () => {
  it('reenvía `details` de la excepción (p. ej. la lista de proyectos de un 422)', () => {
    const { status, body } = run(
      new UnprocessableEntityException({ message: 'IndicatorHasLinkedProjects: x', details: { projects: [{ id: 'p-1' }] } }),
    );
    expect(status).toHaveBeenCalledWith(422);
    expect(body).toEqual({
      statusCode: 422,
      message: 'IndicatorHasLinkedProjects: x',
      error: 'UnprocessableEntityException',
      details: { projects: [{ id: 'p-1' }] },
    });
  });

  it('sin `details` el cuerpo no cambia', () => {
    const { body } = run(new UnprocessableEntityException('Algo'));
    expect(body).toEqual({ statusCode: 422, message: 'Algo', error: 'UnprocessableEntityException' });
  });
});
