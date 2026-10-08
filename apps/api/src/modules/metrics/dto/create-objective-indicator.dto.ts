import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  CreateInlineMetricDto as CreateInlineMetricContract,
  CreateObjectiveIndicatorDto as CreateObjectiveIndicatorContract,
  MetricDirection,
  MetricFrequency,
  MetricKind,
  MetricUnit,
  ObjectiveIndicatorLinkMode,
} from '@gestion-publica/shared-types/metrics';
import { DECIMAL_STRING_MESSAGE, DECIMAL_STRING_RE } from './create-metric.dto.js';

/** Datos de la métrica nueva (alta de indicador en un solo paso). */
export class CreateInlineMetricDto implements CreateInlineMetricContract {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsIn(['number', 'percent', 'currency'])
  unit!: MetricUnit;

  @IsIn(['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'annual'])
  frequency!: MetricFrequency;

  @IsIn(['output', 'outcome'])
  kind!: MetricKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

/**
 * Exactamente uno entre `metricId` y `metric` (el service responde 422 si vienen los dos o ninguno).
 * Con métrica nueva, `targetValue` y `direction` son obligatorios (el service los exige).
 */
export class CreateObjectiveIndicatorDto implements CreateObjectiveIndicatorContract {
  @ValidateIf((o: CreateObjectiveIndicatorDto) => o.metricId !== undefined)
  @IsString()
  @IsNotEmpty()
  metricId?: string;

  @ValidateIf((o: CreateObjectiveIndicatorDto) => o.metric !== undefined)
  @ValidateNested()
  @Type(() => CreateInlineMetricDto)
  metric?: CreateInlineMetricDto;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `baselineValue ${DECIMAL_STRING_MESSAGE}` })
  baselineValue?: string;

  @IsOptional()
  @Matches(DECIMAL_STRING_RE, { message: `targetValue ${DECIMAL_STRING_MESSAGE}` })
  targetValue?: string;

  @IsOptional()
  @IsIn(['increasing', 'decreasing'])
  direction?: MetricDirection;

  /** Entero 0..10000, todo-o-nada con los hermanos (RN-P6). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  weightBp?: number | null;

  @IsOptional()
  @IsIn(['independent', 'execution_feeds_indicator', 'indicator_feeds_execution'])
  linkMode?: ObjectiveIndicatorLinkMode;
}
