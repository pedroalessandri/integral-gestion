import type { CreateOrgUnitDto, OrgUnitTreeNodeDto, UpdateOrgUnitDto } from '@gestion-publica/shared-types/core';
import type { EditableKind } from './tree';

export interface OrgUnitFormValues {
  name: string;
  kind: EditableKind;
  parentId: string;
  vision: string;
  mission: string;
}

const nullable = (v: string): string | null => (v.trim() === '' ? null : v.trim());

export function toCreateDto(values: OrgUnitFormValues): CreateOrgUnitDto {
  return {
    parentId: values.parentId,
    kind: values.kind,
    name: values.name.trim(),
    vision: nullable(values.vision),
    mission: nullable(values.mission),
  };
}

/** Solo manda los campos que cambiaron; la unidad central no manda `kind` ni `parentId` (CentralRootImmutable). */
export function toUpdateDto(unit: OrgUnitTreeNodeDto, values: OrgUnitFormValues): UpdateOrgUnitDto {
  const dto: UpdateOrgUnitDto = {};
  if (values.name.trim() !== unit.name) dto.name = values.name.trim();
  if (nullable(values.vision) !== unit.vision) dto.vision = nullable(values.vision);
  if (nullable(values.mission) !== unit.mission) dto.mission = nullable(values.mission);
  if (unit.kind !== 'central') {
    if (values.kind !== unit.kind) dto.kind = values.kind;
    if (values.parentId !== unit.parentId) dto.parentId = values.parentId;
  }
  return dto;
}
