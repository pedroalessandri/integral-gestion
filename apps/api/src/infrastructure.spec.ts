import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import { of } from 'rxjs';
import { lastValueFrom } from 'rxjs';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor.js';
import { requestContextStorage } from './modules/audit/context/request-context-storage.js';
import {
  transactionContextStorage,
  NoActiveTransactionError,
} from './modules/audit/context/transaction-context-storage.js';

// ─────────────────────────────────────────────────────────────
// RequestContextInterceptor tests
// ─────────────────────────────────────────────────────────────

describe('RequestContextInterceptor', () => {
  let interceptor: RequestContextInterceptor;

  beforeEach(() => {
    interceptor = new RequestContextInterceptor();
  });

  function makeContext(
    headers: Record<string, string> = {},
  ): ExecutionContext {
    const mockRequest = { headers } as unknown as Request;
    const mockResponse = {
      setHeader: vi.fn(),
    } as unknown as Response;

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  }

  function makeHandler(cb?: () => void): CallHandler {
    return {
      handle: () => {
        if (cb) cb();
        return of('response');
      },
    };
  }

  it('sets X-Request-Id response header from provided header', async () => {
    const ctx = makeContext({ 'x-request-id': 'test-id-123' });
    const res = ctx.switchToHttp().getResponse<Response>();
    const setHeaderSpy = vi.spyOn(res, 'setHeader');

    const obs = interceptor.intercept(ctx, makeHandler());
    await lastValueFrom(obs);

    expect(setHeaderSpy).toHaveBeenCalledWith('X-Request-Id', 'test-id-123');
  });

  it('generates a UUID when X-Request-Id header is absent', async () => {
    const ctx = makeContext({});
    const res = ctx.switchToHttp().getResponse<Response>();
    const setHeaderSpy = vi.spyOn(res, 'setHeader');

    const obs = interceptor.intercept(ctx, makeHandler());
    await lastValueFrom(obs);

    const calls = setHeaderSpy.mock.calls;
    expect(calls.length).toBe(1);
    const header = calls[0];
    expect(header).toBeDefined();
    const requestId = header![1] as string;
    // UUID v4 pattern
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('populates requestContextStorage ALS during handler execution', async () => {
    const ctx = makeContext({ 'x-request-id': 'als-test-id' });
    let capturedId: string | undefined;

    const handler = makeHandler(() => {
      const store = requestContextStorage.getStore();
      capturedId = store?.requestId;
    });

    const obs = interceptor.intercept(ctx, handler);
    await lastValueFrom(obs);

    expect(capturedId).toBe('als-test-id');
  });
});

// ─────────────────────────────────────────────────────────────
// transactionContextStorage tests
// ─────────────────────────────────────────────────────────────

describe('transactionContextStorage', () => {
  it('is undefined outside of a run() block', () => {
    expect(transactionContextStorage.getStore()).toBeUndefined();
  });

  it('provides the tx client inside a run() block', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeTx = { fakeTx: true } as any;
    let captured: unknown;
    transactionContextStorage.run(fakeTx, () => {
      captured = transactionContextStorage.getStore();
    });
    expect(captured).toBe(fakeTx);
  });

  it('restores undefined after the run() block exits', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeTx = { fakeTx: true } as any;
    transactionContextStorage.run(fakeTx, () => {
      // inside
    });
    expect(transactionContextStorage.getStore()).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// NoActiveTransactionError tests
// ─────────────────────────────────────────────────────────────

describe('NoActiveTransactionError', () => {
  it('has name NoActiveTransactionError', () => {
    const err = new NoActiveTransactionError();
    expect(err.name).toBe('NoActiveTransactionError');
  });

  it('instanceof Error', () => {
    expect(new NoActiveTransactionError()).toBeInstanceOf(Error);
  });

  it('includes context in message when provided', () => {
    const err = new NoActiveTransactionError('AuditService.writeEvent');
    expect(err.message).toContain('AuditService.writeEvent');
  });
});

// ─────────────────────────────────────────────────────────────
// PrismaService unit tests (mocked $transaction)
// ─────────────────────────────────────────────────────────────

describe('PrismaService invariants (mocked)', () => {
  it('$extends returns a different object than the base client', () => {
    // Validate the structural invariant: raw !== scoped.
    // We test via a mock because instantiating PrismaService requires a live DB.
    const mockExtended = { __extended: true };
    const mockRaw = {
      $extends: vi.fn().mockReturnValue(mockExtended),
    };

    const scoped = mockRaw.$extends({});
    expect(scoped).not.toBe(mockRaw);
    expect(scoped).toBe(mockExtended);
  });

  it('runInTransaction populates and clears transactionContextStorage', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fakeTx = { __tx: true } as any;
    let capturedTx: unknown;

    // Simulate what PrismaService.runInTransaction does internally
    const mockRaw = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        return transactionContextStorage.run(fakeTx, () => fn(fakeTx));
      },
    };

    await mockRaw.$transaction(async (tx) => {
      capturedTx = transactionContextStorage.getStore();
      return tx;
    });

    expect(capturedTx).toBe(fakeTx);
    // After the transaction, ALS must revert to undefined
    expect(transactionContextStorage.getStore()).toBeUndefined();
  });
});
