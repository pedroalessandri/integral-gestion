import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { KeyResultDetailDto, KeyResultSummaryDto } from '@gestion-publica/shared-types/okr';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { computeProgressStatus } from '@gestion-publica/okr-domain';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/index.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import type { CreateKeyResultDto } from '../dto/create-key-result.dto.js';
import type { UpdateKeyResultDto } from '../dto/update-key-result.dto.js';
import { assertPeriodOpen } from '../../../common/guards/period-guard.js';

type PeriodRow = { id: string; code: string; status: string };

type TaskDateRow = {
  startsAt: Date;
  endsAt: Date;
};

type KeyResultRow = {
  id: string;
  objectiveId: string;
  organizationId: string;
  title: string;
  description?: string | null;
  ownerUserId?: string | null;
  weightBp: number;
  progressCachedBp: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { tasks: number };
  tasks?: TaskDateRow[];
};

/** Compute derived startsAt/endsAt for a KR from its active tasks. */
function derivedKrDates(tasks: TaskDateRow[]): { startsAt: string | null; endsAt: string | null } {
  if (tasks.length === 0) {
    return { startsAt: null, endsAt: null };
  }
  const minStartMs = Math.min(...tasks.map((t) => t.startsAt.getTime()));
  const maxEndMs = Math.max(...tasks.map((t) => t.endsAt.getTime()));
  return {
    startsAt: new Date(minStartMs).toISOString(),
    endsAt: new Date(maxEndMs).toISOString(),
  };
}

@Injectable()
export class KeyResultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
  ) {}

  async list(objectiveId: string, orgId: string): Promise<KeyResultSummaryDto[]> {
    const krs = await this.prisma.scoped.keyResult.findMany({
      where: { objectiveId, organizationId: orgId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        tasks: {
          where: { deletedAt: null },
          select: { startsAt: true, endsAt: true },
        },
      },
    });

    return (krs as KeyResultRow[]).map((kr) => this.toSummaryDto(kr));
  }

  async getById(id: string, orgId: string): Promise<KeyResultDetailDto> {
    const kr = await this.prisma.scoped.keyResult.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        tasks: {
          where: { deletedAt: null },
          select: { startsAt: true, endsAt: true },
        },
      },
    });

    if (!kr) {
      throw new NotFoundException(`Key result ${id} not found`);
    }

    return this.toDetailDto(kr as KeyResultRow);
  }

  async create(
    objectiveId: string,
    orgId: string,
    dto: CreateKeyResultDto,
    authContext: AuthContext,
  ): Promise<KeyResultDetailDto> {
    const objective = await this.prisma.scoped.objective.findFirst({
      where: { id: objectiveId, organizationId: orgId, deletedAt: null },
      include: { period: { select: { id: true, code: true, status: true } } },
    });
    if (!objective) {
      throw new NotFoundException(`Objective ${objectiveId} not found`);
    }
    assertPeriodOpen((objective as { period: PeriodRow }).period as { id: string; status: 'open' | 'closed' | 'future'; code: string });

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        // Validate proposed weight sum does not exceed 10000
        const siblings = await tx.keyResult.findMany({
          where: { objectiveId, organizationId: orgId, deletedAt: null },
          select: { weightBp: true },
        });
        const currentSum = siblings.reduce((acc: number, s: { weightBp: number }) => acc + s.weightBp, 0);
        if (currentSum + dto.weightBp > 10000) {
          throw new ConflictException(
            `Agregar este Key Result haría que la suma de pesos sea ${((currentSum + dto.weightBp) / 100).toFixed(1)}%, superando el 100% permitido.`,
          );
        }

        const kr = await tx.keyResult.create({
          data: {
            objectiveId,
            organizationId: orgId,
            title: dto.title,
            description: dto.description ?? null,
            ownerUserId: dto.ownerUserId ?? null,
            weightBp: dto.weightBp,
          },
        });

        await this.auditEmitter.emit({
          action: 'key_result.created',
          entityType: 'okr.key_result',
          entityId: kr.id,
          diff: {
            before: null,
            after: {
              objectiveId,
              title: kr.title,
              description: kr.description,
              ownerUserId: kr.ownerUserId,
              weightBp: kr.weightBp,
            },
          },
        });

        return this.toDetailDto(kr as KeyResultRow);
      }),
    );
  }

  async update(
    id: string,
    orgId: string,
    dto: UpdateKeyResultDto,
    authContext: AuthContext,
  ): Promise<KeyResultDetailDto> {
    const existing = await this.prisma.scoped.keyResult.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { objective: { include: { period: { select: { id: true, code: true, status: true } } } } },
    });
    if (!existing) {
      throw new NotFoundException(`Key result ${id} not found`);
    }
    assertPeriodOpen((existing as { objective: { period: PeriodRow } }).objective.period as { id: string; status: 'open' | 'closed' | 'future'; code: string });

    const existingRow = existing as KeyResultRow;

    return tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        if (dto.weightBp !== undefined && dto.weightBp !== existingRow.weightBp) {
          // Validate that the new weight sum across siblings does not exceed 10000
          const siblings = await tx.keyResult.findMany({
            where: {
              objectiveId: existingRow.objectiveId,
              organizationId: orgId,
              deletedAt: null,
              id: { not: id },
            },
            select: { weightBp: true },
          });
          const siblingsSum = siblings.reduce((acc: number, s: { weightBp: number }) => acc + s.weightBp, 0);
          if (siblingsSum + dto.weightBp > 10000) {
            throw new ConflictException(
              `Actualizar este peso haría que la suma de pesos de los KRs sea ${((siblingsSum + dto.weightBp) / 100).toFixed(1)}%, superando el 100% permitido.`,
            );
          }
        }

        const updated = await tx.keyResult.update({
          where: { id },
          data: {
            ...(dto.title !== undefined && { title: dto.title }),
            ...(dto.description !== undefined && { description: dto.description }),
            ...(dto.ownerUserId !== undefined && { ownerUserId: dto.ownerUserId }),
            ...(dto.weightBp !== undefined && { weightBp: dto.weightBp }),
          },
        });

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (dto.title !== undefined) {
          before['title'] = existingRow.title;
          after['title'] = dto.title;
        }
        if (dto.description !== undefined) {
          before['description'] = existingRow.description;
          after['description'] = dto.description;
        }
        if (dto.ownerUserId !== undefined) {
          before['ownerUserId'] = existingRow.ownerUserId;
          after['ownerUserId'] = dto.ownerUserId;
        }
        if (dto.weightBp !== undefined) {
          before['weightBp'] = existingRow.weightBp;
          after['weightBp'] = dto.weightBp;
        }

        await this.auditEmitter.emit({
          action: 'key_result.updated',
          entityType: 'okr.key_result',
          entityId: id,
          diff: { before, after },
        });

        return this.toDetailDto(updated as KeyResultRow);
      }),
    );
  }

  async softDelete(id: string, orgId: string, authContext: AuthContext): Promise<void> {
    const existing = await this.prisma.scoped.keyResult.findFirst({
      where: { id, organizationId: orgId, deletedAt: null },
      include: {
        objective: { include: { period: { select: { id: true, code: true, status: true } } } },
        _count: { select: { tasks: { where: { deletedAt: null } } } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Key result ${id} not found`);
    }
    assertPeriodOpen((existing as { objective: { period: PeriodRow } }).objective.period as { id: string; status: 'open' | 'closed' | 'future'; code: string });

    const count = (existing as { _count: { tasks: number } })._count.tasks;
    if (count > 0) {
      throw new ConflictException(
        `No se puede eliminar el Key Result: tiene ${count} tarea(s) activa(s). Eliminalas primero.`,
      );
    }

    await tenantContextStorage.run(authContext, () =>
      this.prisma.runInTransaction(async (tx) => {
        await tx.keyResult.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        await this.auditEmitter.emit({
          action: 'key_result.deleted',
          entityType: 'okr.key_result',
          entityId: id,
          diff: {
            before: { deletedAt: null },
            after: { deletedAt: new Date().toISOString() },
          },
        });
      }),
    );
  }

  private toSummaryDto(kr: KeyResultRow): KeyResultSummaryDto {
    const dates = derivedKrDates(kr.tasks ?? []);
    return {
      id: kr.id,
      objectiveId: kr.objectiveId,
      title: kr.title,
      weightBp: kr.weightBp,
      progressCachedBp: kr.progressCachedBp,
      status: computeProgressStatus(kr.progressCachedBp),
      createdAt: kr.createdAt.toISOString(),
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
    };
  }

  private toDetailDto(kr: KeyResultRow): KeyResultDetailDto {
    const dates = derivedKrDates(kr.tasks ?? []);
    return {
      id: kr.id,
      objectiveId: kr.objectiveId,
      title: kr.title,
      weightBp: kr.weightBp,
      progressCachedBp: kr.progressCachedBp,
      status: computeProgressStatus(kr.progressCachedBp),
      createdAt: kr.createdAt.toISOString(),
      description: kr.description ?? null,
      ownerUserId: kr.ownerUserId ?? null,
      updatedAt: kr.updatedAt.toISOString(),
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
    };
  }
}
