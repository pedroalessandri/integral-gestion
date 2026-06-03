import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import type {
  RoleDetailDto,
  RoleDto,
  PermissionDto,
  PermissionDetailDto,
} from '@gestion-publica/shared-types/auth';
import { PrismaService } from './prisma/prisma.service.js';
import { SuperadminOnlyGuard } from './guards/superadmin-only.guard.js';

/**
 * Read-only endpoints for the role/permission catalog per ADR 0004 D8.
 *
 * All endpoints are superadmin-only (global catalog, not tenant-scoped).
 * AuthGuard is registered as APP_GUARD and runs globally before these handlers.
 * TenantGuard is intentionally NOT applied — these are cross-tenant catalog reads.
 *
 * Routes (with global prefix /api and default version v1):
 *   GET /api/v1/roles
 *   GET /api/v1/roles/:key
 *   GET /api/v1/roles/:key/permissions
 */
@UseGuards(SuperadminOnlyGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/v1/roles — lista todos los roles del sistema. */
  @Get()
  async listRoles(): Promise<RoleDto[]> {
    const roles = await this.prisma.raw.role.findMany({
      orderBy: { key: 'asc' },
      select: { id: true, key: true, name: true, description: true },
    });
    return roles;
  }

  /**
   * GET /api/v1/roles/:key — detalle de un rol, incluyendo sus permisos asignados.
   * Returns RoleDetailDto per ADR 0004 D8.
   */
  @Get(':key')
  async getRole(@Param('key') key: string): Promise<RoleDetailDto> {
    const role = await this.prisma.raw.role.findUnique({
      where: { key },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        createdAt: true,
        rolePermissions: {
          select: {
            permission: {
              select: { key: true, description: true },
            },
          },
        },
      },
    });
    if (!role) throw new NotFoundException();
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      createdAt: role.createdAt.toISOString(),
      permissions: role.rolePermissions.map((rp) => ({
        key: rp.permission.key,
        description: rp.permission.description,
      })),
    };
  }

  /** GET /api/v1/roles/:key/permissions — permisos asignados a un rol. */
  @Get(':key/permissions')
  async getRolePermissions(@Param('key') key: string): Promise<PermissionDto[]> {
    const role = await this.prisma.raw.role.findUnique({
      where: { key },
      select: {
        rolePermissions: {
          select: {
            permission: {
              select: { key: true, description: true },
            },
          },
        },
      },
    });
    if (!role) throw new NotFoundException();
    return role.rolePermissions.map((rp) => ({
      key: rp.permission.key,
      description: rp.permission.description,
    }));
  }
}

/**
 * Read-only endpoints for the permission catalog per ADR 0004 D8.
 *
 * Routes (with global prefix /api and default version v1):
 *   GET /api/v1/permissions
 *   GET /api/v1/permissions/:key
 */
@UseGuards(SuperadminOnlyGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/v1/permissions — lista todos los permisos del sistema. */
  @Get()
  async listPermissions(): Promise<PermissionDto[]> {
    return this.prisma.raw.permission.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, description: true },
    });
  }

  /**
   * GET /api/v1/permissions/:key — detalle de un permiso, incluyendo roles que lo tienen.
   * Returns PermissionDetailDto per ADR 0004 D8.
   */
  @Get(':key')
  async getPermission(@Param('key') key: string): Promise<PermissionDetailDto> {
    const permission = await this.prisma.raw.permission.findUnique({
      where: { key },
      select: {
        key: true,
        description: true,
        createdAt: true,
        rolePermissions: {
          select: {
            role: {
              select: { key: true, name: true },
            },
          },
        },
      },
    });
    if (!permission) throw new NotFoundException();
    return {
      key: permission.key,
      description: permission.description,
      createdAt: permission.createdAt.toISOString(),
      roles: permission.rolePermissions.map((rp) => ({
        key: rp.role.key,
        name: rp.role.name,
      })),
    };
  }
}
