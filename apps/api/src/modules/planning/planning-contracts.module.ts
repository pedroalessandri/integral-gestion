import { Global, Injectable, Module } from '@nestjs/common';
import {
  ACTIVE_AXIS_LOOKUP,
  AXIS_TREE_READER,
  type ActiveAxisLookup,
  type ActivePlanStructure,
  type AxisTreeReader,
} from '../../common/contracts/index.js';
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

/** Implementación de `AXIS_TREE_READER`: plan activo con sus ejes vivos (2 queries). */
@Injectable()
export class PrismaAxisTreeReader implements AxisTreeReader {
  constructor(private readonly prisma: PrismaService) {}

  async findActivePlanStructure(organizationId: string): Promise<ActivePlanStructure | null> {
    const plan = await this.prisma.raw.strategicPlan.findFirst({
      where: { organizationId, status: 'active' },
      select: { id: true, title: true },
    });
    if (!plan) return null;
    const axes = await this.prisma.raw.axis.findMany({
      where: { organizationId, strategicPlanId: plan.id, deletedAt: null },
      select: { id: true, name: true, order: true },
    });
    return { id: plan.id, title: plan.title, axes };
  }
}

/** Submódulo @Global de contratos de `planning`: solo lo importa AppModule. */
@Global()
@Module({
  providers: [
    { provide: ACTIVE_AXIS_LOOKUP, useClass: PrismaActiveAxisLookup },
    { provide: AXIS_TREE_READER, useClass: PrismaAxisTreeReader },
  ],
  exports: [ACTIVE_AXIS_LOOKUP, AXIS_TREE_READER],
})
export class PlanningContractsModule {}
