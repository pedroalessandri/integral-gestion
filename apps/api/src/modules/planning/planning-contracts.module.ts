import { Global, Injectable, Module } from '@nestjs/common';
import { ACTIVE_AXIS_LOOKUP, type ActiveAxisLookup } from '../../common/contracts/index.js';
import { PrismaService } from '../auth/prisma/prisma.service.js';

/**
 * Implementación de `ACTIVE_AXIS_LOOKUP` (ADR-0009 D5). Solo lectura, depende únicamente de PrismaService.
 * Filtra siempre por organizationId y exige que el eje esté vivo y en el plan activo (RN-P2).
 */
@Injectable()
export class PrismaActiveAxisLookup implements ActiveAxisLookup {
  constructor(private readonly prisma: PrismaService) {}

  async isAxisInActivePlan(organizationId: string, axisId: string): Promise<boolean> {
    const count = await this.prisma.raw.axis.count({
      where: {
        id: axisId,
        organizationId,
        deletedAt: null,
        strategicPlan: { organizationId, status: 'active' },
      },
    });
    return count > 0;
  }
}

/** Submódulo @Global de contratos de `planning`: solo lo importa AppModule. */
@Global()
@Module({
  providers: [{ provide: ACTIVE_AXIS_LOOKUP, useClass: PrismaActiveAxisLookup }],
  exports: [ACTIVE_AXIS_LOOKUP],
})
export class PlanningContractsModule {}
