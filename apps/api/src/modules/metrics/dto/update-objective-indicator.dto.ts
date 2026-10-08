import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import type {
  MetricDirection,
  ObjectiveIndicatorLinkMode,
  UpdateObjectiveIndicatorDto as UpdateObjectiveIndicatorContract,
} from '@gestion-publica/shared-types/metrics';
import { DECIMAL_STRING_MESSAGE, DECIMAL_STRING_RE } from './create-metric.dto.js';

/** La métrica del indicador no se cambia: se borra el indicador y se crea otro. */
export class UpdateObjectiveIndicatorDto implements UpdateObjectiveIndicatorContract {
  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `baselineValue ${DECIMAL_STRING_MESSAGE}` })
  baselineValue?: string;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `targetValue ${DECIMAL_STRING_MESSAGE}` })
  targetValue?: string;

  @IsOptional()
  @IsIn(['increasing', 'decreasing'])
  direction?: MetricDirection;

  /** Entero 0..10000 o `null` para quitar el peso (RN-P6, todo-o-nada con los hermanos). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  weightBp?: number | null;

  @IsOptional()
  @IsIn(['independent', 'execution_feeds_indicator', 'indicator_feeds_execution'])
  linkMode?: ObjectiveIndicatorLinkMode;
}
