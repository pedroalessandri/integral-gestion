import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StrategicPlanDto, UpsertStrategicPlanDto } from '@gestion-publica/shared-types/planning';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';

type StrategicPlanRow = Prisma.StrategicPlanGetPayload<object>;

function snapshot(row: StrategicPlanRow) {
  return {
    title: row.title,
    vision: row.vision,
    mandateStartsAt: row.mandateStartsAt.toISOString(),
    mandateEndsAt: row.mandateEndsAt.toISOString(),
    status: row.status as StrategicPlanDto['status'],
  };
}

/**
 * StrategicPlanService — plan de gobierno vigente (N1, ADR-0009, RN-P2).
 *
 * Un solo plan `active` por org (índice único parcial `uq_strategic_plan_active`). No hay endpoint
 * de archivado ni de cambio de plan activo en esta corrida: el upsert crea o edita el activo.
 * Toda mutación escribe a audit.event en la misma transacción.
 */
@Injectable()
export class StrategicPlanService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  async getActive(organizationId: string): Promise<StrategicPlanDto> {
    const row = await this.prismaService.scoped.strategicPlan.findFirst({
      where: { organizationId, status: 'active' },
    });
    if (!row) throw new NotFoundException('StrategicPlanNotFound: the organization has no active strategic plan.');
    return this.toDto(row);
  }

  async upsertActive(
    organizationId: string,
    input: UpsertStrategicPlanDto,
    authContext: AuthContext,
  ): Promise<StrategicPlanDto> {
    const startsAt = new Date(input.mandateStartsAt);
    const endsAt = new Date(input.mandateEndsAt);
    if (!(endsAt.getTime() > startsAt.getTime())) {
      throw new UnprocessableEntityException('MandateRangeInvalid: mandateEndsAt must be after mandateStartsAt.');
    }

    try {
      return await tenantContextStorage.run(authContext, () =>
        this.prismaService.runInTransaction(async (tx) => {
          const existing = await tx.strategicPlan.findFirst({
            where: { organizationId, status: 'active' },
          });

          if (!existing) {
            const created = await tx.strategicPlan.create({
              data: {
                organizationId,
                title: input.title,
                vision: input.vision,
                mandateStartsAt: startsAt,
                mandateEndsAt: endsAt,
                status: 'active',
              },
            });
            await this.auditEmitter.emit({
              action: 'strategic_plan.created',
              entityType: 'planning.strategic_plan',
              entityId: created.id,
              diff: { before: null, after: snapshot(created) },
            });
            return this.toDto(created);
          }

          const updated = await tx.strategicPlan.update({
            where: { id: existing.id },
            data: {
              title: input.title,
              vision: input.vision,
              mandateStartsAt: startsAt,
              mandateEndsAt: endsAt,
            },
          });

          // Solo se audita lo que cambió; si el upsert no cambia nada, no hay evento.
          const before = snapshot(existing);
          const after = snapshot(updated);
          const changed = (Object.keys(after) as Array<keyof typeof after>).filter((k) => before[k] !== after[k]);
          if (changed.length > 0) {
            await this.auditEmitter.emit({
              action: 'strategic_plan.updated',
              entityType: 'planning.strategic_plan',
              entityId: existing.id,
              diff: {
                before: Object.fromEntries(changed.map((k) => [k, before[k]])),
                after: Object.fromEntries(changed.map((k) => [k, after[k]])),
              },
            });
          }
          return this.toDto(updated);
        }),
      );
    } catch (err) {
      // Dos upserts concurrentes sin plan previo: gana uno, el otro choca con uq_strategic_plan_active.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('StrategicPlanConflict: another request created the active plan; retry.');
      }
      throw err;
    }
  }

  private toDto(row: StrategicPlanRow): StrategicPlanDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      title: row.title,
      vision: row.vision,
      mandateStartsAt: row.mandateStartsAt.toISOString(),
      mandateEndsAt: row.mandateEndsAt.toISOString(),
      status: row.status as StrategicPlanDto['status'],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
