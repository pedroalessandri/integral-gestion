import { Injectable, OnModuleInit } from '@nestjs/common';
import { ObjectiveService, ProjectService, TaskService } from '../../okr/index.js';
import {
  IndicatorStatusService,
  MetricService,
  ObjectiveIndicatorService,
  PlanningGanttService,
  PlanningTreeService,
} from '../../metrics/index.js';
import { ModuleEnablementService, OrgUnitService, PeriodService } from '../../core/index.js';
import { AxisService } from '../../planning/index.js';
import { TenantMembershipResolver } from '../../auth/index.js';
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from '../config/mcp-config.service.js';
import type { McpToolDefinition, McpToolDeps } from './tool-types.js';
import { buildListarOrganizaciones } from './listar-organizaciones.tool.js';
import { buildListarPeriodos } from './listar-periodos.tool.js';
import { buildVerArbolPlanificacion } from './ver-arbol-planificacion.tool.js';
import { buildListarObjetivos } from './listar-objetivos.tool.js';
import { buildVerObjetivo } from './ver-objetivo.tool.js';
import { buildVerIndicador } from './ver-indicador.tool.js';
import { buildListarProyectosAtrasados } from './listar-proyectos-atrasados.tool.js';
import { buildVerProyecto } from './ver-proyecto.tool.js';

/**
 * Valida el registro al arrancar (ADR-0010: "default deny"). Una herramienta mal declarada es un error de
 * arranque, no un hueco en producción.
 */
export function validateToolRegistry(tools: readonly McpToolDefinition[]): void {
  const seen = new Set<string>();
  for (const tool of tools) {
    const fail = (why: string): never => {
      throw new Error(`Herramienta MCP inválida "${tool.name}": ${why}`);
    };
    if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) fail('el nombre debe ser snake_case sin tildes');
    if (seen.has(tool.name)) fail('nombre duplicado');
    seen.add(tool.name);
    if (tool.kind === 'read' && tool.scope !== MCP_SCOPE_READ) fail('una lectura exige el scope plan:read');
    if (tool.kind === 'write' && tool.scope !== MCP_SCOPE_WRITE) fail('una escritura exige el scope plan:write');
    if (tool.kind === 'read' && tool.annotations.readOnlyHint !== true) fail('una lectura es readOnlyHint');
    if (tool.kind === 'write' && (tool.annotations.readOnlyHint || tool.annotations.destructiveHint !== true)) {
      fail('una escritura es destructiveHint (para que el cliente pida confirmación)');
    }
    if (tool.annotations.openWorldHint !== false) fail('openWorldHint debe ser false');
    if (tool.requiresOrganization && tool.kind === 'write' && tool.permission === null) {
      fail('una escritura declara su permiso RBAC');
    }
    if (/\bKRs?\b|\bOKRs?\b/.test(`${tool.title} ${tool.description}`)) fail('la descripción no usa "KR" ni "OKR"');
    if (tool.description.trim().length < 40) fail('descripción demasiado corta');
  }
}

/** Registro de herramientas del conector. Las construye con los services de los otros módulos (API pública). */
@Injectable()
export class McpToolRegistry implements OnModuleInit {
  readonly tools: readonly McpToolDefinition[];

  constructor(
    objectives: ObjectiveService,
    projects: ProjectService,
    tasks: TaskService,
    indicators: ObjectiveIndicatorService,
    indicatorStatus: IndicatorStatusService,
    metrics: MetricService,
    planningTree: PlanningTreeService,
    planningGantt: PlanningGanttService,
    periods: PeriodService,
    orgUnits: OrgUnitService,
    axes: AxisService,
    moduleEnablement: ModuleEnablementService,
    memberships: TenantMembershipResolver,
  ) {
    const deps: McpToolDeps = {
      objectives,
      projects,
      tasks,
      indicators,
      indicatorStatus,
      metrics,
      planningTree,
      planningGantt,
      periods,
      orgUnits,
      axes,
      moduleEnablement,
      memberships,
    };
    this.tools = [
      buildListarOrganizaciones(deps),
      buildListarPeriodos(deps),
      buildVerArbolPlanificacion(deps),
      buildListarObjetivos(deps),
      buildVerObjetivo(deps),
      buildVerIndicador(deps),
      buildListarProyectosAtrasados(deps),
      buildVerProyecto(deps),
    ];
  }

  onModuleInit(): void {
    validateToolRegistry(this.tools);
  }
}
