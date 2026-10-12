import { describe, it, expect } from 'vitest';
import { FORBIDDEN_PUBLIC_SECTOR_TERMS } from '@gestion-publica/shared-types/core';
import { validateToolRegistry } from './tool-registry.js';
import type { McpToolDefinition, McpToolDeps } from './tool-types.js';
import { defineTool } from './tool-types.js';
import { z } from 'zod';
import { buildListarOrganizaciones } from './listar-organizaciones.tool.js';
import { buildListarPeriodos } from './listar-periodos.tool.js';
import { buildVerArbolPlanificacion } from './ver-arbol-planificacion.tool.js';
import { buildListarObjetivos } from './listar-objetivos.tool.js';
import { buildVerObjetivo } from './ver-objetivo.tool.js';
import { buildVerIndicador } from './ver-indicador.tool.js';
import { buildListarProyectosAtrasados } from './listar-proyectos-atrasados.tool.js';
import { buildVerProyecto } from './ver-proyecto.tool.js';

// Los builders solo capturan las dependencias en closures: para validar el catálogo alcanza un objeto vacío.
const deps = {} as McpToolDeps;
const tools: McpToolDefinition[] = [
  buildListarOrganizaciones(deps),
  buildListarPeriodos(deps),
  buildVerArbolPlanificacion(deps),
  buildListarObjetivos(deps),
  buildVerObjetivo(deps),
  buildVerIndicador(deps),
  buildListarProyectosAtrasados(deps),
  buildVerProyecto(deps),
];

const base = (over: Partial<Parameters<typeof defineTool>[0]> = {}) =>
  defineTool({
    name: 'ver_algo',
    title: 'Ver algo',
    description: 'Descripción suficientemente larga para pasar la validación del registro de herramientas.',
    kind: 'read',
    permission: 'okr:read',
    modules: ['okr'],
    inputSchema: {},
    outputSchema: z.object({}),
    handler: async () => ({}),
    ...over,
  });

describe('catálogo de herramientas de lectura', () => {
  it('pasa la validación del registro', () => {
    expect(() => validateToolRegistry(tools)).not.toThrow();
  });

  it('todas son lecturas con scope plan:read, readOnlyHint y permiso declarado (o solo membresía)', () => {
    for (const t of tools) {
      expect(t.kind, t.name).toBe('read');
      expect(t.scope, t.name).toBe('plan:read');
      expect(t.annotations.readOnlyHint, t.name).toBe(true);
      expect(t.annotations.openWorldHint, t.name).toBe(false);
      if (t.requiresOrganization && !['listar_periodos'].includes(t.name)) {
        expect(t.permission, t.name).toBe('okr:read');
      }
    }
  });

  it('los nombres son snake_case sin tildes y únicos', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('títulos, descripciones y descripciones de parámetros: sin "KR"/"OKR" ni vocabulario de un sector', () => {
    for (const t of tools) {
      const texts = [t.title, t.description];
      for (const field of Object.values(t.inputSchema)) if (field.description) texts.push(field.description);
      for (const text of texts) {
        expect(text, t.name).not.toMatch(/\bK?OKRs?\b|\bKRs?\b/);
        for (const term of FORBIDDEN_PUBLIC_SECTOR_TERMS) {
          expect(text, `${t.name}: "${text}" contiene ${term.source}`).not.toMatch(term);
        }
      }
    }
  });

  it('cada herramienta que devuelve avances lo dice: dos lecturas, sin combinar', () => {
    const withProgress = tools.filter((t) =>
      ['ver_arbol_planificacion', 'listar_objetivos', 'ver_objetivo'].includes(t.name),
    );
    for (const t of withProgress) {
      expect(t.description, t.name).toMatch(/avanceResultado/);
      expect(t.description, t.name).toMatch(/avanceGestion/);
      expect(t.description, t.name).toMatch(/no las promedies ni las combines/i);
    }
  });
});

describe('validateToolRegistry (default deny)', () => {
  it('rechaza nombres inválidos o duplicados', () => {
    expect(() => validateToolRegistry([base({ name: 'Ver-Algo' })])).toThrow(/snake_case/);
    expect(() => validateToolRegistry([base(), base()])).toThrow(/duplicado/);
  });

  it('rechaza una escritura sin permiso declarado o sin destructiveHint', () => {
    expect(() => validateToolRegistry([base({ name: 'crear_algo', kind: 'write', permission: null })])).toThrow(
      /permiso RBAC/,
    );
    const w = base({ name: 'crear_algo', kind: 'write', permission: 'okr:write' });
    expect(() => validateToolRegistry([w])).not.toThrow();
    expect(() =>
      validateToolRegistry([{ ...w, annotations: { readOnlyHint: false, openWorldHint: false } }]),
    ).toThrow(/destructiveHint/);
  });

  it('rechaza una lectura con scope de escritura o sin readOnlyHint', () => {
    const r = base();
    expect(() => validateToolRegistry([{ ...r, scope: 'plan:write' }])).toThrow(/plan:read/);
    expect(() => validateToolRegistry([{ ...r, annotations: { readOnlyHint: false, openWorldHint: false } }])).toThrow(
      /readOnlyHint/,
    );
  });

  it('rechaza descripciones con KR/OKR o demasiado cortas', () => {
    expect(() =>
      validateToolRegistry([base({ description: 'Muestra los OKR de la organización con todo su detalle completo.' })]),
    ).toThrow(/KR/);
    expect(() => validateToolRegistry([base({ description: 'corta' })])).toThrow(/corta/);
  });
});
