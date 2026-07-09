import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { validateEnv } from './config/env.validation.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { CustomThrottlerGuard } from './common/guards/throttler.guard.js';
import { DevAuthMiddleware } from './common/middleware/dev-auth.middleware.js';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor.js';
import { AuthGuard } from './modules/auth/guards/auth.guard.js';
import { AuditModule } from './modules/audit/index.js';
import { AuthModule } from './modules/auth/index.js';
import { CoreModule } from './modules/core/index.js';
import { OkrModule } from './modules/okr/index.js';
import { HealthModule } from './modules/health/index.js';
import { AiModule } from './modules/ai/index.js';
import { MetricsModule } from './modules/metrics/index.js';

/**
 * Root application module.
 *
 * Global providers (registered once here, apply to all modules):
 *  - APP_FILTER: HttpExceptionFilter — maps all exceptions to ErrorResponseDto shape.
 *  - APP_GUARD: CustomThrottlerGuard — rate limiting keyed by auth0Sub or IP.
 *  - APP_INTERCEPTOR: TenantContextInterceptor — re-enters ALS from request.authContext
 *    (populated by AuthGuard) so Prisma extension always finds a tenant store.
 *
 * Note: APP_INTERCEPTOR (RequestContextInterceptor) is registered inside AuditModule
 * per ADR 0003 D8, keeping audit as a self-contained unit.
 *
 * Note: AuthModule is @Global, so PrismaService is available without explicit import.
 *
 * Note: DevAuthMiddleware is registered ONLY in non-production environments.
 * It simulates an authenticated user via X-Dev-User-Id headers.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 60 seconds
        limit: 100,
      },
      {
        // Named throttler for AI endpoints — 10 req/min per user (ADR-0005 D12)
        name: 'ai',
        ttl: 60_000,
        limit: 10,
      },
    ]),
    AuditModule,
    AuthModule,
    CoreModule,
    OkrModule,
    HealthModule,
    AiModule,
    MetricsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantContextInterceptor,
    },
    // DevAuthMiddleware needs to be a provider for DI to work in configure()
    DevAuthMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    if (process.env['NODE_ENV'] !== 'production') {
      consumer.apply(DevAuthMiddleware).forRoutes('*');
    }
  }
}
