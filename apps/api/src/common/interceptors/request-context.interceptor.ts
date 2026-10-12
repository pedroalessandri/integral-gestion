import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requestContextStorage } from '../../modules/audit/context/request-context-storage.js';

/** `audit.event.request_id` es `@db.Uuid`: un valor que no sea UUID haría fallar el INSERT de audit. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RequestContextInterceptor — runs at the HTTP boundary for every request.
 *
 * Responsibilities:
 *  1. Reads X-Request-Id header; accepts it only if it is a valid UUID, otherwise generates a UUID v4.
 *  2. Wraps the request lifecycle in requestContextStorage.run() so the requestId
 *     is available to all code downstream (services, audit writers, etc.) via ALS.
 *  3. Sets X-Request-Id response header so callers can correlate logs.
 *
 * Registered as APP_INTERCEPTOR in AuditModule (per ADR 0003 D8).
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const headerValue = request.headers['x-request-id'];
    const requestId =
      typeof headerValue === 'string' && UUID_REGEX.test(headerValue) ? headerValue : randomUUID();

    response.setHeader('X-Request-Id', requestId);

    // We use the synchronous Observable path: run the ALS context and then
    // let the handler pipeline execute inside it.
    let result!: Observable<unknown>;
    requestContextStorage.run({ requestId }, () => {
      result = next.handle();
    });
    return result;
  }
}
