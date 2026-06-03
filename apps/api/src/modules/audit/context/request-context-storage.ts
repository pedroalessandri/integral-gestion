import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped context stored in AsyncLocalStorage.
 * Populated by RequestContextInterceptor at the HTTP boundary.
 * Source of truth for requestId within a single request lifecycle.
 *
 * Per ADR 0003 D8: this ALS is owned by the audit module.
 */
export interface RequestContext {
  readonly requestId: string;
}

/**
 * Singleton ALS instance for request context.
 * Import this directly from the audit module's public API (index.ts).
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();
