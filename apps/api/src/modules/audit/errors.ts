/**
 * Wiring-bug errors for the audit module.
 *
 * These are programmer errors (not user-facing). They map to HTTP 500 in HttpExceptionFilter.
 * Known 500 error names: NoActiveTransactionError, MissingRequestContextError, MissingActorError.
 */

export class MissingRequestContextError extends Error {
  constructor() {
    super(
      'No request context in RequestContextStorage. This is a wiring bug — RequestContextInterceptor must run before AuditEventEmitter.emit().',
    );
    this.name = 'MissingRequestContextError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MissingActorError extends Error {
  constructor() {
    super(
      'No actor (userId) in TenantContextStorage. This is a wiring bug — AuthGuard must populate TenantContextStorage before AuditEventEmitter.emit(). // TODO(ADR-0004): wire when AuthGuard lands.',
    );
    this.name = 'MissingActorError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
