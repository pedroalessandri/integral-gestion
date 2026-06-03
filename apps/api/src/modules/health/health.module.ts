import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AuthModule } from '../auth/index.js';

/**
 * HealthModule — liveness and readiness endpoints.
 * Imports AuthModule to get PrismaService (AuthModule is @Global but
 * explicit import ensures correct wiring in both runtime and test contexts).
 */
@Module({
  imports: [AuthModule],
  controllers: [HealthController],
})
export class HealthModule {}
