import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RequestContextInterceptor } from './request-context.interceptor';
import { requestContextStorage } from '../../modules/audit/context/request-context-storage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function run(headerValue: unknown) {
  const setHeader = vi.fn();
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: headerValue === undefined ? {} : { 'x-request-id': headerValue } }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  let inside: string | undefined;
  const next: CallHandler = {
    handle: () => {
      inside = requestContextStorage.getStore()?.requestId;
      return of(null);
    },
  };
  new RequestContextInterceptor().intercept(context, next);
  return { setHeader, inside };
}

describe('RequestContextInterceptor', () => {
  it('acepta un X-Request-Id UUID válido', () => {
    const id = '3f2b8c1e-5a4d-4e7b-9c1a-2d6f8e0b7a41';
    const { setHeader, inside } = run(id);
    expect(inside).toBe(id);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', id);
  });

  it.each(['abc', 'dev-req-123', '', 'not-a-uuid-at-all', ['a', 'b']])(
    'genera un UUID cuando el header no es UUID válido (%j)',
    (value) => {
      const { setHeader, inside } = run(value);
      expect(inside).toMatch(UUID);
      expect(setHeader).toHaveBeenCalledWith('X-Request-Id', inside);
    },
  );

  it('genera un UUID cuando el header falta', () => {
    expect(run(undefined).inside).toMatch(UUID);
  });
});
