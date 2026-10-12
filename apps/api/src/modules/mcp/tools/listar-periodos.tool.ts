import { z } from 'zod';
import { PeriodoSchema } from '../presenters/output-schemas.js';
import { organizacionIdField, periodoFromDetail } from './tool-helpers.js';
import { defineTool, orgOf, type McpToolDefinition, type McpToolDeps } from './tool-types.js';

const outputSchema = z.object({
  periodos: z.array(PeriodoSchema),
  total: z.number().int(),
});

export function buildListarPeriodos(deps: McpToolDeps): McpToolDefinition {
  return defineTool({
    name: 'listar_periodos',
    title: 'Períodos de la organización',
    description:
      'Lista los períodos de la organización (etiqueta libre, desde, hasta y estado: open, closed o future). ' +
      'Cada Objetivo estratégico pertenece a exactamente un período. No asumas trimestres ni otro formato de etiqueta.',
    kind: 'read',
    permission: null,
    modules: [],
    inputSchema: {
      organizacionId: organizacionIdField,
      estado: z.enum(['open', 'closed', 'future']).optional().describe('Filtra por estado del período.'),
    },
    outputSchema,
    handler: async (args, runtime) => {
      const periods = await deps.periods.listForOrganization(orgOf(runtime).id, {
        ...(args.estado !== undefined && { status: args.estado }),
        limit: 100,
      });
      const periodos = periods.map(periodoFromDetail);
      return { periodos, total: periodos.length };
    },
  });
}
