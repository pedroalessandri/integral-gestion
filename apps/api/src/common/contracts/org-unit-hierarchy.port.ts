/**
 * Puerto `ORG_UNIT_HIERARCHY` (ADR-0009 D5, regla 15 de CLAUDE.md).
 *
 * Lo implementa `core` (dueño de `core.org_unit`) y lo inyecta `okr` para validar RN-P4
 * (la unidad de un proyecto es la de su objetivo o una descendiente) de forma sincrónica
 * y sin importar `core`. Solo lectura, depende únicamente de PrismaService.
 */
export interface OrgUnitHierarchy {
  /**
   * `true` si `unitId` es `ancestorUnitId` o una unidad descendiente suya. Solo considera unidades
   * vivas de la organización; una unidad borrada o de otra org da `false`.
   */
  isSelfOrDescendant(organizationId: string, ancestorUnitId: string, unitId: string): Promise<boolean>;
}

export const ORG_UNIT_HIERARCHY = Symbol('ORG_UNIT_HIERARCHY');
