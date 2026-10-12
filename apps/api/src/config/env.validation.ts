import { plainToInstance, Transform } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsInt,
  IsBoolean,
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

  // ── Conector MCP (ADR-0010) ──────────────────────────────────────────────────

  /** Kill switch global del conector. Apagado por defecto: con `false`, `/mcp` y la metadata responden 404. */
  @IsOptional()
  @IsBoolean()
  // Se lee el valor ORIGINAL (`obj`): con `enableImplicitConversion`, `value` ya llega como Boolean("false") = true.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => parseBooleanFlag(obj['MCP_ENABLED']))
  MCP_ENABLED: boolean = false;

  /**
   * URL EXACTA del endpoint MCP (https://<host>/mcp). Es el identificador del recurso (RFC 9728) y la audiencia
   * por defecto del token. Obligatoria si `MCP_ENABLED=true`.
   */
  @IsOptional()
  @IsString()
  MCP_RESOURCE_URL?: string;

  /** Audiencia (identifier de la API del conector en Auth0). Por defecto, `MCP_RESOURCE_URL`. */
  @IsOptional()
  @IsString()
  MCP_AUTH0_AUDIENCE?: string;

  /** Orígenes permitidos para requests con `Origin` (coma-separados; admite `http://localhost:*`). Vacío en prod. */
  @IsOptional()
  @IsString()
  MCP_ALLOWED_ORIGINS?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  @Transform(({ value }: { value: unknown }) => parseIntOrDefault(value, 60))
  MCP_RATE_READ_PER_MIN: number = 60;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  @Transform(({ value }: { value: unknown }) => parseIntOrDefault(value, 10))
  MCP_RATE_WRITE_PER_MIN: number = 10;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  @Transform(({ value }: { value: unknown }) => parseIntOrDefault(value, 300))
  MCP_RATE_WRITE_PER_DAY: number = 300;

  /** Tope duro de caracteres de una respuesta de herramienta (ADR-0010 D9). */
  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Max(1_000_000)
  @Transform(({ value }: { value: unknown }) => parseIntOrDefault(value, 60_000))
  MCP_MAX_RESPONSE_CHARS: number = 60_000;
}

function parseBooleanFlag(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return value; // inválido: lo rechaza @IsBoolean
}

function parseIntOrDefault(value: unknown, fallback: number): unknown {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : value; // inválido: lo rechaza @IsInt
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

  const messages = errors.map((e) => Object.values(e.constraints ?? {}).join(', '));

  if (validated.MCP_ENABLED) {
    const resource = validated.MCP_RESOURCE_URL;
    if (!resource) {
      messages.push('MCP_RESOURCE_URL is required when MCP_ENABLED=true');
    } else if (!isValidResourceUrl(resource, validated.NODE_ENV)) {
      messages.push('MCP_RESOURCE_URL must be an absolute https URL ending in /mcp (http only allowed for localhost), without query or fragment');
    }
  }

  if (messages.length > 0) {
    throw new Error(`Environment validation failed: ${messages.join('; ')}`);
  }

  return validated;
}

function isValidResourceUrl(value: string, nodeEnv: string): boolean {
  try {
    const url = new URL(value);
    if (url.search !== '' || url.hash !== '' || url.pathname !== '/mcp') return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && nodeEnv !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}
