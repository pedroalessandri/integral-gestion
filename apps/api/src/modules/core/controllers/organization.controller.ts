import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
} from '@nestjs/common';
import { OrganizationService } from '../services/organization.service.js';
import { CreateOrganizationDto } from '../dto/create-organization.dto.js';
import { UpdateOrganizationDto } from '../dto/update-organization.dto.js';
import { DeactivateOrganizationDto } from '../dto/deactivate-organization.dto.js';
import { ListOrgsQueryDto } from '../dto/list-orgs-query.dto.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthContext } from '@gestion-publica/shared-types/auth';

/**
 * OrganizationController — manages organizations (superadmin operations).
 *
 * TODO(ADR-0004): @UseGuards(AuthGuard, SuperadminOnly) on all mutating endpoints.
 * TODO(ADR-0004): @UseGuards(AuthGuard) @Permissions('core:org:manage') on GET endpoints.
 */
@Controller('orgs')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * GET /api/v1/orgs
   * Lists all organizations. Superadmin only.
   * TODO(ADR-0004): @UseGuards(AuthGuard, SuperadminOnly)
   */
  @Get()
  async list(@Query(new ValidationPipe({ transform: true, whitelist: true })) query: ListOrgsQueryDto) {
    return this.organizationService.list(query);
  }

  /**
   * GET /api/v1/orgs/:id
   * Gets an organization by ID. Superadmin only.
   * TODO(ADR-0004): @UseGuards(AuthGuard, SuperadminOnly)
   */
  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.organizationService.findById(id);
  }

  /**
   * POST /api/v1/orgs
   * Creates organization + first period atomically (D8-c). Superadmin only.
   * TODO(ADR-0004): @UseGuards(AuthGuard, SuperadminOnly)
   * TODO(ADR-0004): @Permissions('core:org:manage')
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateOrganizationDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.organizationService.create(
      {
        slug: body.slug,
        name: body.name,
        firstPeriod: body.firstPeriod,
      },
      user,
    );
  }

  /**
   * PATCH /api/v1/orgs/:id
   * Updates organization name. Superadmin only.
   * TODO(ADR-0004): @UseGuards(AuthGuard, SuperadminOnly)
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateOrganizationDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.organizationService.update(id, body, user);
  }

  /**
   * POST /api/v1/orgs/:id/deactivate
   * Deactivates an organization. Superadmin only.
   * TODO(ADR-0004): @UseGuards(AuthGuard, SuperadminOnly)
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id') id: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: DeactivateOrganizationDto,
    @CurrentUser() user: AuthContext,
  ) {
    return this.organizationService.deactivate(id, user, body.reason);
  }

  /**
   * POST /api/v1/orgs/:id/activate
   * Activates an organization. Superadmin only.
   * TODO(ADR-0004): @UseGuards(AuthGuard, SuperadminOnly)
   */
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  async activate(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.organizationService.activate(id, user);
  }
}
