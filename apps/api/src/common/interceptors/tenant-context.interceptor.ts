import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { tenantContextStorage } from '../../modules/auth/context/tenant-context-storage.js';

/**
 * TenantContextInterceptor — runs after all guards for every HTTP request.
 *
 * Responsibility:
 *  Re-enters the ALS (tenantContextStorage) using the AuthContext that AuthGuard
 *  attached to request.authContext. This ensures that Prisma extension queries
 *  executed inside the async handler chain always find a populated store,
 *  regardless of how Node.js propagates the async context from guards.
 *
 * Why here and not in AuthGuard:
 *  Guards and the request handler run in separate async frames. ALS propagation
 *  from enterWith() inside a guard is unreliable in this project (see ADR 0004).
 *  Interceptors receive the same async execution chain as the handler, so wrapping
 *  next.handle() in tenantContextStorage.run() is the correct fix point.
 *
 * If request.authContext is absent (public route or unauthenticated request),
 * the interceptor is a no-op — the handler proceeds without ALS wrapping.
 *
 * Registered as APP_INTERCEPTOR in AppModule so it applies globally.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { authContext?: AuthContext }>();

    const authContext = request.authContext;

    if (!authContext) {
      // Public route or guard did not populate authContext — pass through.
      return next.handle();
    }

    return new Observable((subscriber) => {
      tenantContextStorage.run(authContext, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
