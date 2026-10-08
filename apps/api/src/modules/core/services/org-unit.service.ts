import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { OrgUnitDto, OrgUnitTreeNodeDto } from '@gestion-publica/shared-types/core';
import type { AuthContext } from '@gestion-publica/shared-types/auth';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { AuditEventEmitterService } from '../../audit/audit-event-emitter.service.js';
import { tenantContextStorage } from '../../auth/context/tenant-context-storage.js';
import {
  ORG_UNIT_OBJECTIVE_COUNTER,
  ORG_UNIT_SCOPE,
  type ObjectiveOrgUnitCounter,
  type OrgUnitScope,
} from '../../../common/contracts/index.js';
import {
  MAX_ORG_UNIT_DEPTH,
  canBeChildOf,
  depthOf,
  indexUnits,
  isSelfOrDescendant,
  subtreeHeight,
} from '../helpers/org-unit-tree.js';

export interface CreateOrgUnitInput {
  parentId: string;
  kind: 'ministry' | 'area';
  name: string;
  vision?: string | null;
  mission?: string | null;
  order?: number;
}

export interface UpdateOrgUnitInput {
  name?: string;
  kind?: 'ministry' | 'area';
  parentId?: string;
  vision?: string | null;
  mission?: string | null;
  order?: number;
}

type OrgUnitRow = Prisma.OrgUnitGetPayload<object>;

function snapshot(row: OrgUnitRow) {
  return {
    kind: row.kind as OrgUnitDto['kind'],
    name: row.name,
    parentId: row.parentId,
    vision: row.vision,
    mission: row.mission,
    order: row.order,
  };
}

/**
 * OrgUnitService — ABM del árbol de unidades (N3, ADR-0009).
 *
 * Reglas:
 *  - RN-P1: una sola raíz `central` por org; se crea sola al crear la organización
 *    (OrganizationService.create -> ensureCentralRoot, idempotente) y no se crea/mueve/borra por API.
 *  - Profundidad máx. 4 (raíz = nivel 1), sin ciclos al mover.
 *  - Soft delete: no se borra con hijos vivos, objetivos asignados (puerto
 *    ORG_UNIT_OBJECTIVE_COUNTER) ni miembros con alcance en la unidad.
 *  - Toda mutación escribe a audit.event en la misma transacción.
 */
@Injectable()
export class OrgUnitService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditEmitter: AuditEventEmitterService,
    @Inject(ORG_UNIT_OBJECTIVE_COUNTER)
    private readonly objectiveCounter: ObjectiveOrgUnitCounter,
    @Inject(ORG_UNIT_SCOPE) private readonly orgUnitScope: OrgUnitScope,
  ) {}

  async list(organizationId: string): Promise<OrgUnitDto[]> {
    const rows = await this.prismaService.raw.orgUnit.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async getTree(organizationId: string): Promise<OrgUnitTreeNodeDto[]> {
    const rows = await this.list(organizationId);
    const nodes = new Map<string, OrgUnitTreeNodeDto>(rows.map((r) => [r.id, { ...r, children: [] }]));
    const roots: OrgUnitTreeNodeDto[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId !== null ? nodes.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async getById(organizationId: string, id: string): Promise<OrgUnitDto> {
    const row = await this.prismaService.raw.orgUnit.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
    if (!row) throw new NotFoundException(`OrgUnit "${id}" not found.`);
    return this.toDto(row);
  }

  async create(
    organizationId: string,
    input: CreateOrgUnitInput,
    authContext: AuthContext,
  ): Promise<OrgUnitDto> {
    await this.orgUnitScope.assertCentralScope(authContext); // RN-P19
    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const units = await this.liveUnits(tx, organizationId);
        const parent = units.find((u) => u.id === input.parentId);
        if (!parent) throw new NotFoundException(`Parent OrgUnit "${input.parentId}" not found.`);

        if (!canBeChildOf(parent.kind, input.kind)) {
          throw this.invalidParentKind(parent.kind, input.kind);
        }

        const newDepth = depthOf(indexUnits(units), parent.id) + 1;
        if (newDepth > MAX_ORG_UNIT_DEPTH) {
          throw new UnprocessableEntityException(
            `OrgUnitMaxDepthExceeded: the tree cannot exceed ${MAX_ORG_UNIT_DEPTH} levels.`,
          );
        }

        const row = await tx.orgUnit.create({
          data: {
            organizationId,
            parentId: parent.id,
            kind: input.kind,
            name: input.name,
            vision: input.vision ?? null,
            mission: input.mission ?? null,
            order: input.order ?? 0,
          },
        });

        await this.auditEmitter.emit({
          action: 'org_unit.created',
          entityType: 'core.org_unit',
          entityId: row.id,
          diff: { before: null, after: snapshot(row) },
        });

        return this.toDto(row);
      }),
    );
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateOrgUnitInput,
    authContext: AuthContext,
  ): Promise<OrgUnitDto> {
    // RN-P19/P20: el árbol (nombre, tipo, padre, orden) es solo de alcance central; la visión y misión de
    // la unidad (N3) también las edita quien tiene alcance en esa unidad o en un ancestro.
    const structural = (['name', 'kind', 'parentId', 'order'] as const).some((k) => input[k] !== undefined);
    if (structural) await this.orgUnitScope.assertCentralScope(authContext);
    else await this.orgUnitScope.assertCanWriteInUnit(authContext, id);
    return tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const units = await this.liveUnits(tx, organizationId);
        const existing = await tx.orgUnit.findFirst({ where: { id, organizationId, deletedAt: null } });
        if (!existing) throw new NotFoundException(`OrgUnit "${id}" not found.`);

        const isRoot = existing.kind === 'central';
        const movesParent = input.parentId !== undefined && input.parentId !== existing.parentId;
        const effectiveKind = input.kind ?? existing.kind;
        const kindChanges = input.kind !== undefined && input.kind !== existing.kind;

        if (isRoot && (input.parentId !== undefined || input.kind !== undefined)) {
          throw new ConflictException('CentralRootImmutable: the central root cannot change kind or parent.');
        }

        if (movesParent && input.parentId !== undefined) {
          const index = indexUnits(units);
          const newParent = index.get(input.parentId);
          if (!newParent) throw new NotFoundException(`Parent OrgUnit "${input.parentId}" not found.`);
          if (isSelfOrDescendant(index, id, newParent.id)) {
            throw new UnprocessableEntityException(
              'OrgUnitCycle: an org unit cannot be moved under itself or one of its descendants.',
            );
          }
          const resultingDepth = depthOf(index, newParent.id) + subtreeHeight(units, id);
          if (resultingDepth > MAX_ORG_UNIT_DEPTH) {
            throw new UnprocessableEntityException(
              `OrgUnitMaxDepthExceeded: the tree cannot exceed ${MAX_ORG_UNIT_DEPTH} levels.`,
            );
          }
        }

        // Jerarquía de kinds: validar contra el padre efectivo (si se mueve o cambia kind)
        // y, si cambia el kind, contra los hijos vivos.
        if (!isRoot && (movesParent || kindChanges)) {
          const index = indexUnits(units);
          const effectiveParent = index.get(input.parentId ?? existing.parentId ?? '');
          if (effectiveParent && !canBeChildOf(effectiveParent.kind, effectiveKind)) {
            throw this.invalidParentKind(effectiveParent.kind, effectiveKind);
          }
        }
        if (kindChanges) {
          const badChild = units.find(
            (u) => u.parentId === id && !canBeChildOf(effectiveKind, u.kind),
          );
          if (badChild) {
            throw this.invalidParentKind(effectiveKind, badChild.kind);
          }
        }

        const data: Prisma.OrgUnitUncheckedUpdateInput = {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.kind !== undefined && { kind: input.kind }),
          ...(input.parentId !== undefined && { parentId: input.parentId }),
          ...(input.vision !== undefined && { vision: input.vision }),
          ...(input.mission !== undefined && { mission: input.mission }),
          ...(input.order !== undefined && { order: input.order }),
        };
        const row = await tx.orgUnit.update({ where: { id }, data });

        await this.auditEmitter.emit({
          action: 'org_unit.updated',
          entityType: 'core.org_unit',
          entityId: id,
          diff: { before: snapshot(existing), after: snapshot(row) },
        });

        return this.toDto(row);
      }),
    );
  }

  async softDelete(organizationId: string, id: string, authContext: AuthContext): Promise<void> {
    await this.orgUnitScope.assertCentralScope(authContext); // RN-P19
    await tenantContextStorage.run(authContext, () =>
      this.prismaService.runInTransaction(async (tx) => {
        const existing = await tx.orgUnit.findFirst({ where: { id, organizationId, deletedAt: null } });
        if (!existing) throw new NotFoundException(`OrgUnit "${id}" not found.`);

        if (existing.kind === 'central') {
          throw new ConflictException('CentralRootImmutable: the central root cannot be deleted.');
        }

        const liveChildren = await tx.orgUnit.count({
          where: { organizationId, parentId: id, deletedAt: null },
        });
        if (liveChildren > 0) {
          throw new ConflictException('OrgUnitHasChildren: delete or move the child units first.');
        }

        const objectives = await this.objectiveCounter.countLiveObjectivesByOrgUnit(organizationId, id);
        if (objectives > 0) {
          throw new ConflictException(
            `OrgUnitHasObjectives: the unit has ${objectives} assigned objective(s); reassign them first.`,
          );
        }

        const scopedMembers = await tx.userOrganizationRole.findMany({
          where: { organizationId, orgUnitId: id },
          select: { userId: true, user: { select: { displayName: true } } },
        });
        if (scopedMembers.length > 0) {
          throw new ConflictException({
            statusCode: HttpStatus.CONFLICT,
            error: 'OrgUnitHasMembers',
            message: `OrgUnitHasMembers: ${scopedMembers.length} member(s) have their scope on this unit; reassign them first.`,
            members: scopedMembers.map((m) => ({ userId: m.userId, displayName: m.user.displayName })),
          });
        }

        const deletedAt = new Date();
        await tx.orgUnit.update({ where: { id }, data: { deletedAt } });

        await this.auditEmitter.emit({
          action: 'org_unit.deleted',
          entityType: 'core.org_unit',
          entityId: id,
          diff: { before: snapshot(existing), after: { deletedAt: deletedAt.toISOString() } },
        });
      }),
    );
  }

  /**
   * Garantiza la raíz `central` de la org (RN-P1). Idempotente: si ya existe, no hace nada.
   * Debe llamarse dentro de una transacción de `runInTransaction` (emite audit).
   * Devuelve true si la creó.
   */
  async ensureCentralRoot(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<boolean> {
    const existing = await tx.orgUnit.findFirst({
      where: { organizationId, kind: 'central', deletedAt: null },
      select: { id: true },
    });
    if (existing) return false;

    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    if (!org) throw new NotFoundException(`Organization "${organizationId}" not found.`);

    const row = await tx.orgUnit.create({
      data: { organizationId, parentId: null, kind: 'central', name: org.name, order: 0 },
    });

    await this.auditEmitter.emit({
      action: 'org_unit.created',
      entityType: 'core.org_unit',
      entityId: row.id,
      diff: { before: null, after: { ...snapshot(row), source: 'organization-create' } },
    });
    return true;
  }

  private liveUnits(tx: Prisma.TransactionClient, organizationId: string) {
    return tx.orgUnit.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, parentId: true, kind: true },
    });
  }

  private invalidParentKind(parentKind: string, childKind: string): UnprocessableEntityException {
    return new UnprocessableEntityException(
      `OrgUnitInvalidParentKind: a "${childKind}" unit cannot be a child of a "${parentKind}" unit.`,
    );
  }

  private toDto(row: OrgUnitRow): OrgUnitDto {
    return {
      id: row.id,
      organizationId: row.organizationId,
      parentId: row.parentId,
      kind: row.kind as OrgUnitDto['kind'],
      name: row.name,
      vision: row.vision,
      mission: row.mission,
      order: row.order,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
