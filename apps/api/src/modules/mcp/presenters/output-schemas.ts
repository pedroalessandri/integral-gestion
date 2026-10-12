import { z } from 'zod';

/**
 * Esquemas de salida compartidos por las herramientas (ADR-0010 D5). Los tipos de los presenters se derivan de
 * acá con `z.infer`, así el TypeScript y el `outputSchema` que ve el cliente no pueden divergir.
 *
 * Regla de dominio: NO existe un campo de avance sin calificar ni combinado. Siempre `avanceResultado` y
 * `avanceGestion` por separado.
 */

export const SemaforoSchema = z.enum(['verde', 'amarillo', 'rojo']);
export type Semaforo = z.infer<typeof SemaforoSchema>;

export const TerminologiaSchema = z.object({
  sector: z.enum(['public', 'private', 'nonprofit']),
  plan: z.string(),
  visionPlan: z.string(),
  vigencia: z.string(),
  tiposUnidad: z.object({ central: z.string(), ministry: z.string(), area: z.string() }),
});

export const PeriodoSchema = z.object({
  id: z.string(),
  etiqueta: z.string(),
  desde: z.string(),
  hasta: z.string(),
  estado: z.enum(['open', 'closed', 'future']),
});
export type PeriodoOut = z.infer<typeof PeriodoSchema>;

export const UnidadRefSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  tipo: z.enum(['central', 'ministry', 'area']),
  tipoEtiqueta: z.string(),
});

export const EjeRefSchema = z.object({ id: z.string(), nombre: z.string() });

/** Porcentaje: valor canónico en bp entero + lectura en texto decimal exacto (2 decimales). */
export const PorcentajeSchema = z.object({ bp: z.number().int(), porcentaje: z.string() });

/** Avance de resultado (desde los indicadores). Los `null` llevan `motivo`. */
export const AvanceResultadoSchema = z.object({
  bp: z.number().int().nullable(),
  porcentaje: z.string().nullable(),
  desvioBp: z.number().int().nullable(),
  /** Puntos porcentuales con signo: positivo = adelantado, negativo = atrasado. */
  desvioPuntos: z.string().nullable(),
  semaforo: SemaforoSchema.nullable(),
  cargasPendientes: z.number().int(),
  motivo: z.string().optional(),
});
export type AvanceResultadoOut = z.infer<typeof AvanceResultadoSchema>;

/** Avance de gestión (desde los proyectos). */
export const AvanceGestionSchema = z.object({
  bp: z.number().int().nullable(),
  porcentaje: z.string().nullable(),
  planificadoBp: z.number().int().optional(),
  planificadoPorcentaje: z.string().optional(),
  desvioBp: z.number().int().nullable(),
  desvioPuntos: z.string().nullable(),
  semaforo: SemaforoSchema.nullable(),
  motivo: z.string().optional(),
});
export type AvanceGestionOut = z.infer<typeof AvanceGestionSchema>;

export const AgregadoSchema = z.object({
  objetivos: z.number().int(),
  avanceResultado: AvanceResultadoSchema,
  avanceGestion: AvanceGestionSchema,
});
export type AgregadoOut = z.infer<typeof AgregadoSchema>;

/** Campos de paginación comunes a los listados. */
export const PaginacionSchema = {
  total: z.number().int(),
  limite: z.number().int(),
  desplazamiento: z.number().int(),
  hayMas: z.boolean(),
  truncado: z.boolean(),
  sugerencia: z.string().optional(),
};
