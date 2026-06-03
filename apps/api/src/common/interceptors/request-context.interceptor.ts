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

/**
 * RequestContextInterceptor — runs at the HTTP boundary for every request.
 *
 * Responsibilities:
 *  1. Reads X-Request-Id header; generates a UUID v4 if absent.
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

    const requestId =
      (typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id']
        : undefined) ?? randomUUID();

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
