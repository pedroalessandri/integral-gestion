import { Global, Injectable, Module } from '@nestjs/common';
import {
  ORG_UNIT_HIERARCHY,
  ORG_UNIT_LOOKUP,
  type OrgUnitHierarchy,
  type OrgUnitLookup,
  type OrgUnitRef,
} from '../../common/contracts/index.js';
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

/** Profundidad máxima del árbol (4) + margen: corta el recorrido ante datos corruptos. */
const MAX_ANCESTOR_STEPS = 8;

/**
 * Implementación de `ORG_UNIT_HIERARCHY` (RN-P4). Sube por `parentId` desde la unidad candidata
 * (profundidad ≤ 4) filtrando siempre por organizationId y unidades vivas.
 */
@Injectable()
export class PrismaOrgUnitHierarchy implements OrgUnitHierarchy {
  constructor(private readonly prisma: PrismaService) {}

  async isSelfOrDescendant(organizationId: string, ancestorUnitId: string, unitId: string): Promise<boolean> {
    let currentId: string | null = unitId;
    for (let step = 0; step < MAX_ANCESTOR_STEPS && currentId !== null; step++) {
      const row: { id: string; parentId: string | null } | null = await this.prisma.raw.orgUnit.findFirst({
        where: { id: currentId, organizationId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!row) return false;
      if (row.id === ancestorUnitId) return true;
      currentId = row.parentId;
    }
    return false;
  }
}

/** Submódulo @Global de contratos de `core`: solo lo importa AppModule. */
@Global()
@Module({
  providers: [
    { provide: ORG_UNIT_LOOKUP, useClass: PrismaOrgUnitLookup },
    { provide: ORG_UNIT_HIERARCHY, useClass: PrismaOrgUnitHierarchy },
  ],
  exports: [ORG_UNIT_LOOKUP, ORG_UNIT_HIERARCHY],
})
export class CoreContractsModule {}
