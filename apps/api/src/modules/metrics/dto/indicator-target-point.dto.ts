import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, Matches, ValidateNested } from 'class-validator';
import type {
  IndicatorTargetPointInput as IndicatorTargetPointContract,
  SetIndicatorTargetPointsDto as SetIndicatorTargetPointsContract,
} from '@gestion-publica/shared-types/metrics';
import { DECIMAL_STRING_MESSAGE, DECIMAL_STRING_RE } from './create-metric.dto.js';

/** YYYY-MM-DD. Que sea un inicio de bucket válido de la frecuencia del indicador lo valida el service (422). */
export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Máximo de puntos por pedido (hay un punto por bucket: 52 semanales por año alcanzan de sobra). */
export const MAX_TARGET_POINTS = 500;

export class IndicatorTargetPointInputDto implements IndicatorTargetPointContract {
  @Matches(DATE_ONLY_RE, { message: 'bucketDate debe tener formato YYYY-MM-DD' })
  bucketDate!: string;

  @Matches(DECIMAL_STRING_RE, { message: `expectedValue ${DECIMAL_STRING_MESSAGE}` })
  expectedValue!: string;
}

/** Reemplazo atómico de los puntos de la curva manual (RN-P17). La lista vacía los borra. */
export class SetIndicatorTargetPointsDto implements SetIndicatorTargetPointsContract {
  @IsArray()
  @ArrayMaxSize(MAX_TARGET_POINTS)
  @ValidateNested({ each: true })
  @Type(() => IndicatorTargetPointInputDto)
  points!: IndicatorTargetPointInputDto[];
}
