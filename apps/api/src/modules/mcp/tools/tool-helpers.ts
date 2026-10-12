import { z } from 'zod';
import type { OrgUnitDto, PeriodDetailDto } from '@gestion-publica/shared-types/core';
import type { PeriodStatusDto } from '@gestion-publica/shared-types/okr';
import { safeText, MAX_TITLE_CHARS } from '../presenters/text.presenter.js';
import type { PeriodoOut } from '../presenters/output-schemas.js';
import { terminologiaDeSector, type UnidadRefDto } from '../presenters/terminology.presenter.js';
import type { McpToolDeps, ToolRuntime } from './tool-types.js';
import { orgOf } from './tool-types.js';

export const organizacionIdField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe(
    'Id de la organización (campo id de listar_organizaciones). Opcional si el usuario tiene una sola; si tiene más de una, preguntale cuál usar.',
  );

export const periodoIdField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe('Id del período. Sin él se usa el período abierto de la organización.');

export const ejeIdField = z.string().min(1).max(64).optional().describe('Filtra por eje.');

export const unidadIdField = z
  .string()
  .min(1)
  .max(64)
  .optional()
  .describe('Filtra por unidad (incluye sus unidades descendientes).');

export const limiteField = z
  .number()
  .int()
  .min(1)
  .max(100)
  .optional()
  .describe('Cantidad máxima de elementos (por defecto 25, máximo 100).');

export const desplazamientoField = z
  .number()
  .int()
  .min(0)
  .optional()
  .describe('Cantidad de elementos a saltear, para paginar.');

export const DEFAULT_LIMIT = 25;

export function pageOf(args: { limite?: number | undefined; desplazamiento?: number | undefined }): {
  limit: number;
  offset: number;
} {
  return { limit: args.limite ?? DEFAULT_LIMIT, offset: args.desplazamiento ?? 0 };
}

export function periodoFromDetail(p: PeriodDetailDto): PeriodoOut {
  return {
    id: p.id,
    etiqueta: safeText(p.code, 100),
    desde: p.startsAt,
    hasta: p.endsAt,
    estado: p.status,
  };
}

export function periodoFromStatus(p: PeriodStatusDto): PeriodoOut {
  return {
    id: p.id,
    etiqueta: safeText(p.code, 100),
    desde: p.startsAt ?? '',
    hasta: p.endsAt ?? '',
    estado: p.status,
  };
}

/** Unidades vivas de la organización, indexadas por id (una sola consulta). */
export async function loadUnitIndex(deps: McpToolDeps, runtime: ToolRuntime): Promise<Map<string, OrgUnitDto>> {
  const units = await deps.orgUnits.list(orgOf(runtime).id);
  return new Map(units.map((u) => [u.id, u]));
}

export function unidadRef(
  unit: Pick<OrgUnitDto, 'id' | 'name' | 'kind'>,
  sector: string,
): UnidadRefDto {
  const terms = terminologiaDeSector(sector);
  return {
    id: unit.id,
    nombre: safeText(unit.name, MAX_TITLE_CHARS),
    tipo: unit.kind,
    tipoEtiqueta: terms.tiposUnidad[unit.kind],
  };
}

/** Referencia por id; si la unidad ya no existe (carrera con un borrado) se informa sin nombre. */
export function unidadRefById(units: Map<string, OrgUnitDto>, id: string, sector: string): UnidadRefDto {
  const unit = units.get(id);
  if (unit) return unidadRef(unit, sector);
  return { id, nombre: '(unidad no disponible)', tipo: 'area', tipoEtiqueta: terminologiaDeSector(sector).tiposUnidad.area };
}
