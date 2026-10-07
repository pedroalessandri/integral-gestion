import { UnprocessableEntityException } from '@nestjs/common';
import { validateWeightSumInvariant } from '@gestion-publica/okr-domain';

/**
 * RN-P6 / ADR-0009 D3: valida el grupo de hermanos RESULTANTE de una mutación (proyectos de un objetivo,
 * tareas de un proyecto). Todo-o-nada: o todos tienen `weightBp` y suman 10000, o ninguno.
 * Un grupo mixto o con suma incorrecta es un 422 explícito, nunca una corrección silenciosa.
 * Un grupo vacío es válido. La regla vive en `okr-domain` (`validateWeightSumInvariant`).
 *
 * @param label - Sustantivo plural para el mensaje (ej. 'proyectos', 'tareas').
 */
export function assertValidWeightGroup(
  items: ReadonlyArray<{ weightBp: number | null }>,
  label: string,
): void {
  if (items.length === 0) return;
  const result = validateWeightSumInvariant(items);
  if (result.ok) return;
  if (result.reason === 'mixed') {
    throw new UnprocessableEntityException(
      `MixedWeightGroup: los ${label} hermanos deben tener todos peso o ninguno (RN-P6). Asigná o quitá los pesos de todo el grupo juntos.`,
    );
  }
  throw new UnprocessableEntityException(
    `WeightSumInvalid: los pesos de los ${label} deben sumar 100% (10000 bp) y suman ${result.actual} bp (RN-P6).`,
  );
}

/**
 * El set de ids de un "reemplazo de pesos" debe coincidir exactamente con los hermanos vivos del grupo
 * (sin faltantes, sobrantes ni repetidos): como el grupo es todo-o-nada, no hay pesos parciales.
 */
export function assertSameSiblingSet(liveIds: ReadonlyArray<string>, requestedIds: ReadonlyArray<string>): void {
  const live = new Set(liveIds);
  const requested = new Set(requestedIds);
  if (requested.size !== requestedIds.length || requested.size !== live.size || [...requested].some((id) => !live.has(id))) {
    throw new UnprocessableEntityException(
      'WeightsSetMismatch: la lista de pesos debe incluir exactamente una vez a cada hermano vivo del grupo.',
    );
  }
}
