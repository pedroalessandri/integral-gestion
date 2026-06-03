import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RequestContextInterceptor } from '../../common/interceptors/request-context.interceptor.js';
import { AuditEventEmitterService } from './audit-event-emitter.service.js';
import { AuditQueryService } from './services/audit-query.service.js';
import { AuditController } from './audit.controller.js';
import { AuditReadAccessGuard } from './guards/audit-read-access.guard.js';

/**
 * AuditModule owns:
 *  - RequestContextInterceptor (registers as APP_INTERCEPTOR so it wraps every request)
 *  - requestContextStorage ALS (request ID propagation)
 *  - transactionContextStorage ALS (active Prisma transaction propagation)
 *  - AuditEventEmitterService (audit write path per ADR 0003)
 *  - AuditQueryService + AuditController (audit read API per ADR 0003 "Read API")
 *
 * PrismaService is available globally via AuthModule (@Global), so it does not
 * need to be imported here explicitly.
 *
 * Per ADR 0003 D8: interceptor registration lives here, not in AppModule,
 * so that the audit module is a self-contained unit.
 */
@Module({
  controllers: [AuditController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
    AuditEventEmitterService,
    AuditQueryService,
    AuditReadAccessGuard,
  ],
  exports: [AuditEventEmitterService],
})
export class AuditModule {}
