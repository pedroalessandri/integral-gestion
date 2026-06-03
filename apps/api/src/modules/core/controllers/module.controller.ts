import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../auth/prisma/prisma.service.js';

/**
 * ModuleController — lists the global module registry.
 *
 * Any authenticated user can view available modules.
 * TODO(ADR-0004): @UseGuards(AuthGuard)
 */
@Controller('modules')
export class ModuleController {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * GET /api/v1/modules
   * Returns all modules in the global registry.
   * TODO(ADR-0004): @UseGuards(AuthGuard)
   */
  @Get()
  async list() {
    const modules = await this.prismaService.raw.module.findMany({
      orderBy: { key: 'asc' },
    });

    return modules.map((m) => ({
      key: m.key,
      name: m.name,
      description: m.description,
    }));
  }
}
