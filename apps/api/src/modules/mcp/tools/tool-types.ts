import type { z } from 'zod';
import type { AuthContext, PermissionKey } from '@gestion-publica/shared-types/auth';
import type { ObjectiveService, ProjectService, TaskService } from '../../okr/index.js';
import type {
  IndicatorStatusService,
  MetricService,
  ObjectiveIndicatorService,
  PlanningGanttService,
  PlanningTreeService,
} from '../../metrics/index.js';
import type { ModuleEnablementService, OrgUnitService, PeriodService } from '../../core/index.js';
import type { TenantMembershipResolver } from '../../auth/index.js';
import type { AxisService } from '../../planning/index.js';
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from '../config/mcp-config.service.js';

export type ToolKind = 'read' | 'write';
export type ToolScope = typeof MCP_SCOPE_READ | typeof MCP_SCOPE_WRITE;

/** Servicios de otros módulos que consumen las herramientas, siempre por la superficie pública de cada módulo. */
export interface McpToolDeps {
  objectives: ObjectiveService;
  projects: ProjectService;
  tasks: TaskService;
  indicators: ObjectiveIndicatorService;
  indicatorStatus: IndicatorStatusService;
  metrics: MetricService;
  planningTree: PlanningTreeService;
  planningGantt: PlanningGanttService;
  periods: PeriodService;
  orgUnits: OrgUnitService;
  axes: AxisService;
  moduleEnablement: ModuleEnablementService;
  memberships: TenantMembershipResolver;
}

/** Organización ya resuelta y validada por el dispatcher. */
export interface ToolOrganization {
  id: string;
  name: string;
  /** Valor crudo de `core.organization.sector`. */
  sector: string;
}

export interface ToolRuntime {
  /**
   * Contexto del usuario. En herramientas con organización trae `organizationId`, `permissions` y `orgUnitId` del
   * rol de la membresía; en `listar_organizaciones` trae `organizationId: null`.
   */
  auth: AuthContext;
  /** `null` solo en herramientas sin organización. */
  organization: ToolOrganization | null;
  now: Date;
  /** Tope duro de caracteres de la respuesta (MCP_MAX_RESPONSE_CHARS), para herramientas que se autolimitan. */
  maxResponseChars: number;
}

/** Organización de una herramienta que la requiere (el dispatcher garantiza que existe). */
export function orgOf(runtime: ToolRuntime): ToolOrganization {
  if (!runtime.organization) throw new Error('Herramienta sin organización resuelta');
  return runtime.organization;
}

/** Lo que devuelve un handler: el payload estructurado y, si es un listado, qué clave se puede recortar. */
export interface ToolOutput {
  data: Record<string, unknown>;
  /** Clave de `data` con el arreglo que el dispatcher puede recortar si la respuesta supera el tope. */
  listKey?: string;
}

/** Definición declarativa de una herramienta (ADR-0010 D5): permiso, scope y módulos viajan con ella. */
export interface McpToolDefinition {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  scope: ToolScope;
  /** Permiso RBAC equivalente al del endpoint REST; `null` = solo membresía/autenticación. */
  permission: PermissionKey | null;
  /** Módulos de organización que exige, además de `mcp` (igual que el endpoint REST equivalente). */
  modules: readonly string[];
  requiresOrganization: boolean;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint?: boolean;
    openWorldHint: boolean;
    idempotentHint?: boolean;
  };
  inputSchema: z.ZodRawShape;
  outputSchema: z.AnyZodObject;
  /** `args` ya validado contra `inputSchema` por el SDK. */
  handler: (args: Record<string, unknown>, runtime: ToolRuntime) => Promise<ToolOutput>;
}

export interface DefineToolInput<I extends z.ZodRawShape, O extends z.AnyZodObject> {
  name: string;
  title: string;
  description: string;
  kind: ToolKind;
  permission: PermissionKey | null;
  modules: readonly string[];
  requiresOrganization?: boolean;
  inputSchema: I;
  outputSchema: O;
  /** Clave del arreglo recortable (listados). */
  listKey?: keyof z.infer<O> & string;
  handler: (
    args: z.infer<z.ZodObject<I>>,
    runtime: ToolRuntime,
  ) => Promise<z.infer<O>>;
}

/**
 * Arma una definición con tipos fuertes de entrada y salida; la salida se deriva del `outputSchema`, así el
 * handler no puede devolver algo que el esquema declarado no admite.
 */
export function defineTool<I extends z.ZodRawShape, O extends z.AnyZodObject>(
  def: DefineToolInput<I, O>,
): McpToolDefinition {
  const read = def.kind === 'read';
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    kind: def.kind,
    scope: read ? MCP_SCOPE_READ : MCP_SCOPE_WRITE,
    permission: def.permission,
    modules: def.modules,
    requiresOrganization: def.requiresOrganization ?? true,
    annotations: read
      ? { readOnlyHint: true, openWorldHint: false }
      : { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    handler: async (args, runtime) => {
      const data = await def.handler(args as z.infer<z.ZodObject<I>>, runtime);
      return def.listKey === undefined
        ? { data: data as Record<string, unknown> }
        : { data: data as Record<string, unknown>, listKey: def.listKey };
    },
  };
}
