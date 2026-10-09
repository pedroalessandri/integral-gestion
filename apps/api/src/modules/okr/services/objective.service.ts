import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';
import type {
  ObjectiveDetailDto,
  ObjectiveSummaryDto,
  OwnerSummaryDto,
  PeriodStatusDto,
} from '@gestion-publica/shared-types/okr';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import {
  ACTIVE_AXIS_LOOKUP,
  ORG_UNIT_LOOKUP,
  ORG_UNIT_SCOPE,
  type ActiveAxisLookup,
  type OrgUnitLookup,
  type OrgUnitScope,
} from '../../../common/contracts/index.js';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import { PeriodService, MemberService } from '../../core/index.js';
import type { CreateObjectiveDto } from '../dto/create-objective.dto.js';
import type { UpdateObjectiveDto } from '../dto/update-objective.dto.js';

type ObjectiveRow = {
  id: string;
  organizationId: string;
  periodId: string;
  title: string;
  description: string | null;
  ownerUserId: string | null;
  orgUnitId: string;
  axisId: string | null;
  owner: { id: string; displayName: string; email: string } | null;
  resultProgressCachedBp: number;
  executionProgressCachedBp: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  period: { id: string; code: string; status: string; startsAt?: Date; endsAt?: Date };
  /** Proyectos vivos (solo sus fechas): de ahí se derivan `startsAt`/`endsAt` del objetivo. */
  projects: Array<{ startsAt: Date; endsAt: Date }>;
};

/** Prisma include for owner on Objective rows. */
const OBJECTIVE_OWNER_INCLUDE = {
  owner: { select: { id: true, displayName: true, email: true } },
} as const;

/** Include común de las lecturas: período, responsable y fechas de los proyectos vivos. */
const OBJECTIVE_READ_INCLUDE = {
  period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
  ...OBJECTIVE_OWNER_INCLUDE,
  projects: { where: { deletedAt: null }, select: { startsAt: true, endsAt: true } },
} as const;

@Injectable()
export class ObjectiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periodService: PeriodService,
    private readonly auditEmitter: AuditEventEmitterService,
    private readonly memberService: MemberService,
    @Inject(ORG_UNIT_LOOKUP) private readonly orgUnitLookup: OrgUnitLookup,
    @Inject(ACTIVE_AXIS_LOOKUP) private readonly axisLookup: ActiveAxisLookup,
    @Inject(ORG_UNIT_SCOPE) private readonly orgUnitScope: OrgUnitScope,
  ) {}

  /**
   * RN-P3: la unidad existe en la org y es `ministry` o `area` (la central no lleva objetivos).
   * Se valida por puerto (regla 15 de CLAUDE.md); una unidad de otra org es indistinguible de una inexistente.
   */
  private async assertOrgUnitAssignable(orgId: string, orgUnitId: string): Promise<void> {
    const unit = await this.orgUnitLookup.findLiveOrgUnit(orgId, orgUnitId);
    if (!unit) {
      throw new UnprocessableEntityException(
        `OrgUnitNotFound: OrgUnit "${orgUnitId}" does not exist in organization "${orgId}".`,
      );
    }
    if (unit.kind !== 'ministry' && unit.kind !== 'area') {
      throw new UnprocessableEntityException(
        `OrgUnitKindInvalid: an objective belongs to a ministry or area unit, not "${unit.kind}".`,
      );
    }
  }

  /** RN-P2: el eje existe, no está borrado y es del plan activo de la misma org. */
  private async assertAxisAssignable(orgId: string, axisId: string): Promise<void> {
    if (!(await this.axisLookup.isAxisInActivePlan(orgId, axisId))) {
      throw new UnprocessableEntityException(
        `AxisNotInActivePlan: Axis "${axisId}" is not an axis of the active strategic plan of organization "${orgId}".`,
      );
    }
  }

  async list(orgId: string, periodId?: string): Promise<ObjectiveSummaryDto[]> {
    const objectives = await this.prisma.scoped.objective.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(periodId && { periodId }),
      },
      include: OBJECTIVE_READ_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return (objectives as ObjectiveRow[]).map((o) => this.toSummaryDto(o));
  }

  async getById(id: string, orgId: string): Promise<ObjectiveDetailDto> {
    const objective = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: OBJECTIVE_READ_INCLUDE,
    });

    if (!objective) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    return this.toDetailDto(objective as ObjectiveRow);
  }

  async create(
    orgId: string,
    dto: CreateObjectiveDto,
    authContext: AuthContext,
  ): Promise<ObjectiveDetailDto> {
    // RN-P20: se escribe solo en la unidad propia y descendientes.
    await this.orgUnitScope.assertCanWriteInUnit(authContext, dto.orgUnitId);

    const period = await this.periodService.getCurrentOpenPeriod(orgId);
    if (!period) {
      throw new UnprocessableEntityException(
        'No hay un período abierto para esta organización. Abrí un período antes de crear objetivos.',
      );
    }

    // Resolve ownerUserId: use dto value if provided, otherwise default to the requesting user.
    const resolvedOwnerUserId = dto.ownerUserId !== undefined ? dto.ownerUserId : authContext.userId;

    // Validate membership when an explicit owner is provided.
    if (resolvedOwnerUserId !== null && resolvedOwnerUserId !== undefined) {
      const isMember = await this.memberService.isMemberOf(orgId, resolvedOwnerUserId);
      if (!isMember) {
        throw new UnprocessableEntityException(
          `OwnerNotMember: User "${resolvedOwnerUserId}" is not a member of organization "${orgId}".`,
        );
      }
    }

    await this.assertOrgUnitAssignable(orgId, dto.orgUnitId);
    if (dto.axisId !== undefined) await this.assertAxisAssignable(orgId, dto.axisId);

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const objective = await tx.objective.create({
          data: {
            organizationId: orgId,
            periodId: period.id,
            title: dto.title,
            description: dto.description ?? null,
            ownerUserId: resolvedOwnerUserId ?? null,
            orgUnitId: dto.orgUnitId,
            axisId: dto.axisId ?? null,
          },
          include: OBJECTIVE_READ_INCLUDE,
        });

        await this.auditEmitter.emit({
          action: 'objective.created',
          entityType: 'okr.objective',
          entityId: objective.id,
          diff: {
            before: null,
            after: {
              title: objective.title,
              description: objective.description,
              periodId: objective.periodId,
              ownerUserId: objective.ownerUserId,
              orgUnitId: objective.orgUnitId,
              axisId: objective.axisId,
            },
          },
        });

        return this.toDetailDto(objective as ObjectiveRow);
      }),
    );
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateObjectiveDto,
    authContext: AuthContext,
  ): Promise<ObjectiveDetailDto> {
    const existing = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        ...OBJECTIVE_OWNER_INCLUDE,
      },
    });
    if (!existing) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    // RN-P20: hay que poder escribir en la unidad actual y, si se mueve, también en la destino.
    await this.orgUnitScope.assertCanWriteInUnit(authContext, (existing as { orgUnitId: string }).orgUnitId);
    if (dto.orgUnitId !== undefined && dto.orgUnitId !== (existing as ObjectiveRow).orgUnitId) {
      await this.orgUnitScope.assertCanWriteInUnit(authContext, dto.orgUnitId);
    }

    assertPeriodOpen((existing as { period: { id: string; status: 'open' | 'closed' | 'future'; code: string } }).period);

    // Validate new owner membership before entering the transaction.
    if (dto.ownerUserId !== undefined && dto.ownerUserId !== null) {
      const isMember = await this.memberService.isMemberOf(orgId, dto.ownerUserId);
      if (!isMember) {
        throw new UnprocessableEntityException(
          `OwnerNotMember: User "${dto.ownerUserId}" is not a member of organization "${orgId}".`,
        );
      }
    }

    // RN-P3 / RN-P2: solo se revalida lo que cambia (un eje de un plan ya reemplazado no bloquea otras ediciones).
    const existingRow = existing as ObjectiveRow;
    if (dto.orgUnitId !== undefined && dto.orgUnitId !== existingRow.orgUnitId) {
      await this.assertOrgUnitAssignable(orgId, dto.orgUnitId);
    }
    if (dto.axisId !== undefined && dto.axisId !== null && dto.axisId !== existingRow.axisId) {
      await this.assertAxisAssignable(orgId, dto.axisId);
    }

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        const updated = await tx.objective.update({
          where: { id },
          data: {
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.ownerUserId !== undefined && { ownerUserId: dto.ownerUserId }),
            ...(dto.orgUnitId !== undefined && { orgUnitId: dto.orgUnitId }),
            ...(dto.axisId !== undefined && { axisId: dto.axisId }),
          },
          include: OBJECTIVE_READ_INCLUDE,
        });

        // ── Owner-specific audit event ────────────────────────────────────────
        if (dto.ownerUserId !== undefined) {
          const beforeOwnerId = existingRow.ownerUserId;
          const afterOwnerId = dto.ownerUserId;

          // Only emit when owner actually changed.
          if (beforeOwnerId !== afterOwnerId) {
            if (beforeOwnerId === null && afterOwnerId !== null) {
              await this.auditEmitter.emit({
                action: 'objective.owner_assigned',
                entityType: 'okr.objective',
                entityId: id,
                diff: { before: { ownerUserId: null }, after: { ownerUserId: afterOwnerId } },
              });
            } else if (beforeOwnerId !== null && afterOwnerId === null) {
              await this.auditEmitter.emit({
                action: 'objective.owner_unassigned',
                entityType: 'okr.objective',
                entityId: id,
                diff: { before: { ownerUserId: beforeOwnerId }, after: { ownerUserId: null } },
              });
            } else if (beforeOwnerId !== null && afterOwnerId !== null) {
              await this.auditEmitter.emit({
                action: 'objective.owner_changed',
                entityType: 'okr.objective',
                entityId: id,
                diff: { before: { ownerUserId: beforeOwnerId }, after: { ownerUserId: afterOwnerId } },
              });
            }
          }
        }

        // ── Generic updated event (title/description changes) ─────────────────
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (dto.orgUnitId !== undefined && dto.orgUnitId !== existingRow.orgUnitId) {
          before['orgUnitId'] = existingRow.orgUnitId;
          after['orgUnitId'] = dto.orgUnitId;
        }
        if (dto.axisId !== undefined && dto.axisId !== existingRow.axisId) {
          before['axisId'] = existingRow.axisId;
          after['axisId'] = dto.axisId;
        }
        if (dto.title !== undefined) {
          before['title'] = existing.title;
          after['title'] = dto.title;
        }
        if (dto.description !== undefined) {
          before['description'] = existing.description;
          after['description'] = dto.description;
        }

        if (Object.keys(after).length > 0) {
          await this.auditEmitter.emit({
            action: 'objective.updated',
            entityType: 'okr.objective',
            entityId: id,
            diff: { before, after },
          });
        }

        return this.toDetailDto(updated as ObjectiveRow);
      }),
    );
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.prisma.scoped.objective.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        period: { select: { id: true, code: true, status: true, startsAt: true, endsAt: true } },
        _count: { select: { projects: { where: { deletedAt: null } } } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Objective ${id} not found`);
    }

    await this.orgUnitScope.assertCanWriteInUnit(authContext, (existing as { orgUnitId: string }).orgUnitId);

    assertPeriodOpen((existing as { period: { id: string; status: 'open' | 'closed' | 'future'; code: string } }).period);

    const count = (existing as { _count: { projects: number } })._count.projects;
    if (count > 0) {
      throw new ConflictException(
        `No se puede eliminar el objetivo: tiene ${count} proyecto(s) activo(s). Eliminalos primero.`,
      );
    }

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.objective.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        await this.auditEmitter.emit({
          action: 'objective.deleted',
          entityType: 'okr.objective',
          entityId: id,
          diff: {
            before: { deletedAt: null },
            after: { deletedAt: new Date().toISOString() },
          },
        });
      }),
    );
  }

  private toOwnerSummaryDto(
    owner: { id: string; displayName: string; email: string } | null,
  ): OwnerSummaryDto | null {
    if (!owner) return null;
    return { id: owner.id, displayName: owner.displayName, email: owner.email };
  }

  /** Fechas del objetivo derivadas de sus proyectos vivos: mínimo de inicio y máximo de fin. */
  private deriveDates(o: ObjectiveRow): { startsAt: string | null; endsAt: string | null } {
    if (o.projects.length === 0) return { startsAt: null, endsAt: null };
    const minStartMs = Math.min(...o.projects.map((p) => p.startsAt.getTime()));
    const maxEndMs = Math.max(...o.projects.map((p) => p.endsAt.getTime()));
    return { startsAt: new Date(minStartMs).toISOString(), endsAt: new Date(maxEndMs).toISOString() };
  }

  private toSummaryDto(o: ObjectiveRow): ObjectiveSummaryDto {
    return {
      id: o.id,
      title: o.title,
      periodCode: o.period.code,
      resultProgressCachedBp: o.resultProgressCachedBp,
      executionProgressCachedBp: o.executionProgressCachedBp,
      createdAt: o.createdAt.toISOString(),
      period: {
        id: o.period.id,
        code: o.period.code,
        status: o.period.status as PeriodStatusDto['status'],
        startsAt: o.period.startsAt?.toISOString(),
        endsAt: o.period.endsAt?.toISOString(),
      },
      ...this.deriveDates(o),
      owner: this.toOwnerSummaryDto(o.owner),
      orgUnitId: o.orgUnitId,
      axisId: o.axisId,
    };
  }

  private toDetailDto(o: ObjectiveRow): ObjectiveDetailDto {
    return {
      id: o.id,
      title: o.title,
      periodCode: o.period.code,
      resultProgressCachedBp: o.resultProgressCachedBp,
      executionProgressCachedBp: o.executionProgressCachedBp,
      createdAt: o.createdAt.toISOString(),
      description: o.description,
      organizationId: o.organizationId,
      periodId: o.periodId,
      updatedAt: o.updatedAt.toISOString(),
      period: {
        id: o.period.id,
        code: o.period.code,
        status: o.period.status as PeriodStatusDto['status'],
        startsAt: o.period.startsAt?.toISOString(),
        endsAt: o.period.endsAt?.toISOString(),
      },
      ...this.deriveDates(o),
      owner: this.toOwnerSummaryDto(o.owner),
      orgUnitId: o.orgUnitId,
      axisId: o.axisId,
    };
  }
}
