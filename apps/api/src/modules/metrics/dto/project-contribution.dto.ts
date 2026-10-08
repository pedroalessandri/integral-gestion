import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import type {
  CreateProjectContributionDto as CreateProjectContributionContract,
  UpdateProjectContributionDto as UpdateProjectContributionContract,
} from '@gestion-publica/shared-types/metrics';
import { DECIMAL_STRING_MESSAGE } from './create-metric.dto.js';

/** Decimal con hasta 4 decimales y distinto de cero (RN-P12: un aporte de 0 no aporta nada). */
export const NONZERO_DECIMAL_STRING_RE = /^-?(?!0+(\.0+)?$)\d{1,14}(\.\d{1,4})?$/;

export class CreateProjectContributionDto implements CreateProjectContributionContract {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  projectId!: string;

  @Matches(NONZERO_DECIMAL_STRING_RE, {
    message: `contributionValue ${DECIMAL_STRING_MESSAGE} y distinto de cero`,
  })
  contributionValue!: string;
}

export class UpdateProjectContributionDto implements UpdateProjectContributionContract {
  @Matches(NONZERO_DECIMAL_STRING_RE, {
    message: `contributionValue ${DECIMAL_STRING_MESSAGE} y distinto de cero`,
  })
  contributionValue!: string;
}
