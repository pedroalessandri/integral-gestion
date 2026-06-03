import { plainToInstance, Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  Max,
  validateSync,
} from 'class-validator';

/**
 * Validated environment variable schema.
 * class-validator + class-transformer validate this at ConfigModule load time.
 * Required variables throw on startup if missing; optional ones have defaults.
 */
class EnvVars {
  /**
   * @Transform handles the case where PORT is undefined in the env (e.g. during e2e tests
   * that don't load a .env file). Falls back to 3000 before Int validation runs.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return 3000;
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? 3000 : parsed;
  })
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  NODE_ENV: string = 'development';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /**
   * Auth0 issuer base URL. Defaults to a placeholder that triggers a WARN on startup.
   * Replace with your actual Auth0 tenant URL before enabling auth guards.
   */
  @IsOptional()
  @IsString()
  AUTH0_ISSUER_BASE_URL: string = 'https://placeholder.auth0.com';

  /**
   * Auth0 audience (API identifier). Defaults to a placeholder that triggers a WARN on startup.
   */
  @IsOptional()
  @IsString()
  AUTH0_AUDIENCE: string = 'https://api.gestion-publica.placeholder';

  /**
   * Email of the first superadmin to bootstrap on first login.
   * Optional in dev/test; production deployments MUST set this.
   * If not set, the bootstrap mechanism is disabled.
   */
  @IsOptional()
  @IsEmail()
  CORE_BOOTSTRAP_SUPERADMIN_EMAIL?: string;

  /**
   * Anthropic API key for the AI copilot module (ADR-0005).
   * Optional in dev/test; production deployments MUST set this when AI is enabled.
   */
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  /**
   * Default AI provider ('anthropic' | 'openai'). Defaults to 'anthropic'.
   */
  @IsOptional()
  @IsString()
  AI_DEFAULT_PROVIDER: string = 'anthropic';
}

/**
 * Validates environment variables at ConfigModule load time.
 * Called by ConfigModule.forRoot({ validate: validateEnv }).
 *
 * Throws a descriptive error listing all validation failures so the app
 * fails fast with a clear message rather than with a cryptic runtime error.
 */
export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  return validated;
}
