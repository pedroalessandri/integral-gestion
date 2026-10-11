import { IsIn } from 'class-validator';
import { ORGANIZATION_SECTORS, type OrganizationSector } from '@gestion-publica/shared-types/core';

/** Body de PATCH /orgs/:id/sector (ADR-0011 D2). Solo superadmin. */
export class UpdateOrganizationSectorDto {
  @IsIn(ORGANIZATION_SECTORS)
  sector!: OrganizationSector;
}
