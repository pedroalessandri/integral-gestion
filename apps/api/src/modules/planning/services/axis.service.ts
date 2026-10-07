import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  AxisDto,
  CreateAxisDto,
  DeleteAxisResultDto,
  UpdateAxisDto,
} from '@gestion-publica/shared-types/planning';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import {
  AXIS_OBJECTIVE_COUNTER,
  AXIS_OBJECTIVE_UNASSIGNER,
  type ObjectiveAxisCounter,
  type ObjectiveAxisUnassigner,
} from '../../../common/contracts/index.js';

type AxisRow = Prisma.AxisGetPayload<object>;

function snapshot(row: AxisRow) {
  return {
    strategicPlanId: row.strategicPlanId,
    name: row.name,
    description: row.description,
    order: row.order,
  };
}

/**
 * AxisService — ABM de ejes del plan activo (N2, ADR-0009, RN-P2).
 *
 *  - Los ejes cuelgan del plan activo de la org; sin plan activo no se puede crear (422).
 *  - Soft delete (`deletedAt`). Si el eje tiene objetivos, se desasignan (`axisId = null`) en la misma
 *    transacción por el puerto AXIS_OBJECTIVE_UNASSIGNER (implementado por `okr`), que audita cada
 *    `objective.updated`; `axis.deleted` lleva los `unassignedObjectiveIds`.
 *  - `objectiveCount` (puerto AXIS_OBJECTIVE_COUNTER) permite a la UI avisar antes de borrar.
 *  - Toda mutación escribe a audit.event en la misma transacción.
 */
@Injectable()
export class AxisService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    @Inject(AXIS_OBJECTIVE_COUNTER)
    private readonly objectiveCounter: ObjectiveAxisCounter,
    @Inject(AXIS_OBJECTIVE_UNASSIGNER)
    private readonly objectiveUnassigner: ObjectiveAxisUnassigner,
  ) {}

  /** Ejes vivos del plan activo, ordenados. Sin plan activo devuelve lista vacía. */
  async list(organizationId: string): Promise<AxisDto[]> {
    const rows = await this.prismaService.scoped.axis.findMany({
      where: { organizationId, deletedAt: null, strategicPlan: { organizationId, status: 'active' } },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return Promise.all(rows.map((r) => this.toDtoWithCount(r)));
  }

  async getById(organizationId: string, id: string): Promise<AxisDto> {
    return this.toDtoWithCount(await this.findLive(organizationId, id));
  }

  async create(organizationId: string, input: CreateAxisDto, authContext: AuthContext): Promise<AxisDto> {
    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const plan = await tx.strategicPlan.findFirst({
          where: { organizationId, status: 'active' },
          select: { id: true },
        });
        if (!plan) {
          throw new UnprocessableEntityException(
            'StrategicPlanRequired: create the active strategic plan before adding axes.',
          );
        }

        const row = await tx.axis.create({
          data: {
            organizationId,
            strategicPlanId: plan.id,
            name: input.name,
            description: input.description ?? null,
            order: input.order ?? 0,
          },
        });

        await this.auditEmitter.emit({
          action: 'axis.created',
          entityType: 'planning.axis',
          entityId: row.id,
          diff: { before: null, after: snapshot(row) },
        });
        return this.toDto(row, 0);
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateAxisDto,
    authContext: AuthContext,
  ): Promise<AxisDto> {
    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const existing = await tx.axis.findFirst({ where: { id, organizationId, deletedAt: null } });
        if (!existing) throw new NotFoundException(`Axis "${id}" not found.`);

        const row = await tx.axis.update({
          where: { id },
          data: {
            ...(input.name !== undefined && { name: input.name }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.order !== undefined && { order: input.order }),
          },
        });

        const before = snapshot(existing);
        const after = snapshot(row);
        const changed = (Object.keys(after) as Array<keyof typeof after>).filter((k) => before[k] !== after[k]);
        if (changed.length > 0) {
          await this.auditEmitter.emit({
            action: 'axis.updated',
            entityType: 'planning.axis',
            entityId: id,
            diff: {
              before: Object.fromEntries(changed.map((k) => [k, before[k]])),
              after: Object.fromEntries(changed.map((k) => [k, after[k]])),
            },
          });
        }
        return this.toDto(row, await this.objectiveCounter.countLiveObjectivesByAxis(organizationId, id));
      }),
    );
  }

  async softDelete(organizationId: string, id: string, authContext: AuthContext): Promise<DeleteAxisResultDto> {
    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const existing = await tx.axis.findFirst({ where: { id, organizationId, deletedAt: null } });
        if (!existing) throw new NotFoundException(`Axis "${id}" not found.`);

        const unassignedObjectiveIds = await this.objectiveUnassigner.unassignAxisFromObjectives(
          organizationId,
          id,
        );

        const deletedAt = new Date();
        await tx.axis.update({ where: { id }, data: { deletedAt } });
        await this.auditEmitter.emit({
          action: 'axis.deleted',
          entityType: 'planning.axis',
          entityId: id,
          diff: {
            before: snapshot(existing),
            after: { deletedAt: deletedAt.toISOString(), unassignedObjectiveIds },
          },
        });
        return { unassignedObjectiveCount: unassignedObjectiveIds.length, unassignedObjectiveIds };
      }),
    );
  }

  private async findLive(organizationId: string, id: string): Promise<AxisRow> {
    const row = await this.prismaService.scoped.axis.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`Axis "${id}" not found.`);
    return row;
  }

  private async toDtoWithCount(row: AxisRow): Promise<AxisDto> {
    return this.toDto(row, await this.objectiveCounter.countLiveObjectivesByAxis(row.organizationId, row.id));
  }

  private toDto(row: AxisRow, objectiveCount: number): AxisDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      strategicPlanId: row.strategicPlanId,
      name: row.name,
      description: row.description,
      order: row.order,
      objectiveCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
