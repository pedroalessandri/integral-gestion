import { Global, Injectable, Module } from '@nestjs/common';
import { ORG_UNIT_LOOKUP, type OrgUnitLookup, type OrgUnitRef } from '../../common/contracts/index.js';
import { PrismaService } from '../auth/prisma/prisma.service.js';

/**
 * Implementación de `ORG_UNIT_LOOKUP` (ADR-0009 D5). Solo lectura, depende únicamente de PrismaService.
 * Filtra siempre por organizationId: una unidad de otra org es indistinguible de una inexistente.
 */
@Injectable()
export class PrismaOrgUnitLookup implements OrgUnitLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findLiveOrgUnit(organizationId: string, orgUnitId: string): Promise<OrgUnitRef | null> {
    const row = await this.prisma.raw.orgUnit.findFirst({
      where: { id: orgUnitId, organizationId, deletedAt: null },
      select: { id: true, kind: true },
    });
    return row ? { id: row.id, kind: row.kind as OrgUnitRef['kind'] } : null;
  }
}

/** Submódulo @Global de contratos de `core`: solo lo importa AppModule. */
@Global()
@Module({
  providers: [{ provide: ORG_UNIT_LOOKUP, useClass: PrismaOrgUnitLookup }],
  exports: [ORG_UNIT_LOOKUP],
})
export class CoreContractsModule {}
