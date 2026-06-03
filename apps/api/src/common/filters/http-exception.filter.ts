import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ErrorResponseDto } from '@gestion-publica/shared-types/common';
import { MissingTenantContextError } from '@gestion-publica/prisma-tenant-extension';
import { NoActiveTransactionError } from '../../modules/audit/context/transaction-context-storage.js';

/**
 * Global exception filter.
 *
 * Maps well-known error types to ErrorResponseDto shape (from @gestion-publica/shared-types common).
 * All unhandled exceptions yield HTTP 500 with error code 'InternalServerError'.
 *
 * Mapping rules:
 *  - MissingTenantContextError   → 500 'MissingTenantContext'
 *  - NoActiveTransactionError     → 500 'NoActiveTransaction'
 *  - JsonWebTokenError            → 401 'JwtInvalid'
 *  - TokenExpiredError            → 401 'JwtExpired'
 *  - NotBeforeError               → 401 'JwtNotActive'
 *  - Prisma P2002                 → 409 'UniqueConstraintViolation'
 *  - Prisma P2025                 → 404 'RecordNotFound'
 *  - HttpException                → e.getStatus() / e.constructor.name
 *  - Unknown                      → 500 'InternalServerError'
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.resolve(exception);

    const body: ErrorResponseDto = {
      statusCode,
      message,
      error,
    };

    if (statusCode >= 500) {
      this.logger.error(
        `[${error}] ${message} — ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `[${error}] ${message} — ${request.method} ${request.url}`,
      );
    }

    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    message: string;
    error: string;
  } {
    // Infrastructure wiring errors → 500
    if (exception instanceof MissingTenantContextError) {
      return {
        statusCode: 500,
        message: exception.message,
        error: 'MissingTenantContext',
      };
    }

    if (exception instanceof NoActiveTransactionError) {
      return {
        statusCode: 500,
        message: exception.message,
        error: 'NoActiveTransaction',
      };
    }

    // Audit wiring errors — MissingRequestContextError, MissingActorError → 500
    // Checked by name to avoid circular imports (audit module errors.ts → filter).
    if (exception instanceof Error) {
      if (
        exception.name === 'MissingRequestContextError' ||
        exception.name === 'MissingActorError'
      ) {
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: exception.message,
          error: exception.name,
        };
      }
    }

    // JWT errors — we check by name to avoid importing jsonwebtoken in filter
    if (exception instanceof Error) {
      if (exception.name === 'JsonWebTokenError') {
        return {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Invalid token.',
          error: 'JwtInvalid',
        };
      }
      if (exception.name === 'TokenExpiredError') {
        return {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Token has expired.',
          error: 'JwtExpired',
        };
      }
      if (exception.name === 'NotBeforeError') {
        return {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: 'Token not yet active.',
          error: 'JwtNotActive',
        };
      }
    }

    // Prisma known errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with the given unique constraints already exists.',
          error: 'UniqueConstraintViolation',
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found.',
          error: 'RecordNotFound',
        };
      }
    }

    // NestJS HttpExceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : typeof response === 'object' &&
              response !== null &&
              'message' in response
            ? String((response as Record<string, unknown>)['message'])
            : exception.message;
      return {
        statusCode: status,
        message,
        error: exception.constructor.name,
      };
    }

    // Fallback
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred.',
      error: 'InternalServerError',
    };
  }
}
