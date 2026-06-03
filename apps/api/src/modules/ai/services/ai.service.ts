import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../auth/prisma/prisma.service.js';
import { LlmProviderFactory } from '../providers/llm-provider.factory.js';
import { QuotaService } from './quota.service.js';
import {
  DRAFT_OBJECTIVE_SYSTEM_PROMPT,
  VALIDATE_OBJECTIVE_SYSTEM_PROMPT,
} from '../prompts/objective-prompts.js';
import {
  DRAFT_KR_SYSTEM_PROMPT,
  VALIDATE_KR_SYSTEM_PROMPT,
} from '../prompts/key-result-prompts.js';

export interface DraftInput {
  orgId: string;
  userId: string;
  entityType: 'objective' | 'key_result';
  hint: string;
  objectiveContext?: string;
}

export interface DraftOutput {
  text: string;
  cachedHit: boolean;
}

export interface ValidateInput {
  orgId: string;
  userId: string;
  entityType: 'objective' | 'key_result';
  text: string;
}

export interface SmartCriteria {
  score: number;
  feedback: string;
}

export interface ValidateOutput {
  overallScore: number;
  verdict: 'excelente' | 'bueno' | 'mejorable' | 'insuficiente';
  criteria: {
    specific: SmartCriteria;
    measurable: SmartCriteria;
    achievable: SmartCriteria;
    relevant: SmartCriteria;
    timeBound: SmartCriteria;
  };
  suggestions: string[];
  // Only present for key_result entity type
  hasBaseline?: boolean;
  hasTarget?: boolean;
  cachedHit: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Bump this when the system prompts change in a way that should invalidate
// already-cached responses (rubric changes, stricter SMART criteria, etc.).
const PROMPT_SET_VERSION = 'v2';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: LlmProviderFactory,
    private readonly quotaService: QuotaService,
  ) {}

  async draft(input: DraftInput): Promise<DraftOutput> {
    const { orgId, userId, entityType, hint, objectiveContext } = input;

    await this.quotaService.assertWithinQuota(orgId);

    const settings = await this.prisma.raw.organizationAiSettings.findUnique({
      where: { organizationId: orgId },
    });

    const providerName = (settings?.provider ?? 'anthropic') as 'anthropic' | 'openai';
    const modelName = settings?.modelName ?? 'claude-haiku-4-5-20251001';

    // Load org context (mission/vision/values/context)
    const org = await this.prisma.raw.organization.findUnique({
      where: { id: orgId },
      select: { mission: true, vision: true, values: true, context: true },
    });

    const userPrompt = this.buildDraftUserPrompt(entityType, hint, objectiveContext, org);
    const promptHash = hashPrompt(`${entityType}:draft:${PROMPT_SET_VERSION}:${userPrompt}`);

    // Cache lookup
    const cached = await this.findCachedResponse(orgId, entityType, promptHash);
    if (cached) {
      this.logger.debug(`Cache hit for draft prompt hash=${promptHash}`);
      await this.logPrompt({
        orgId,
        userId,
        operationType: 'draft',
        entityType,
        provider: providerName,
        model: modelName,
        promptHash,
        promptText: userPrompt,
        responseText: cached.responseText,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        cacheHit: true,
        success: true,
        errorCode: null,
      });
      await this.quotaService.incrementUsage(orgId, 'draft', 0, 0);
      return { text: cached.responseText, cachedHit: true };
    }

    const systemPrompt =
      entityType === 'objective' ? DRAFT_OBJECTIVE_SYSTEM_PROMPT : DRAFT_KR_SYSTEM_PROMPT;

    const provider = this.providerFactory.get(providerName);
    const startMs = Date.now();
    let responseText = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let success = true;
    let errorCode: string | null = null;

    try {
      const response = await provider.complete({
        systemPrompt,
        userPrompt,
        model: modelName,
        temperature: 0.4,
      });
      responseText = response.text.trim();
      tokensIn = response.promptTokens;
      tokensOut = response.completionTokens;
    } catch (err) {
      success = false;
      errorCode = err instanceof Error ? err.constructor.name : 'UnknownError';
      this.logger.error(`Draft LLM call failed for org=${orgId}`, err);
      throw err;
    } finally {
      const latencyMs = Date.now() - startMs;
      await this.logPrompt({
        orgId,
        userId,
        operationType: 'draft',
        entityType,
        provider: providerName,
        model: modelName,
        promptHash,
        promptText: userPrompt,
        responseText,
        tokensIn,
        tokensOut,
        latencyMs,
        cacheHit: false,
        success,
        errorCode,
      });
      if (success) {
        await this.quotaService.incrementUsage(orgId, 'draft', tokensIn, tokensOut);
      }
    }

    if (responseText === 'OFF_TOPIC' || responseText.startsWith('OFF_TOPIC')) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'AI_OFF_TOPIC',
        message:
          'El pedido no parece relacionado con objetivos o Key Results. El copilot solo asiste en redacción SMART para OKR organizacionales.',
      });
    }

    return { text: responseText, cachedHit: false };
  }

  async validate(input: ValidateInput): Promise<ValidateOutput> {
    const { orgId, userId, entityType, text } = input;

    await this.quotaService.assertWithinQuota(orgId);

    const settings = await this.prisma.raw.organizationAiSettings.findUnique({
      where: { organizationId: orgId },
    });

    const providerName = (settings?.provider ?? 'anthropic') as 'anthropic' | 'openai';
    const modelName = settings?.modelName ?? 'claude-haiku-4-5-20251001';

    // Load org context (mission/vision/values/context)
    const orgForValidate = await this.prisma.raw.organization.findUnique({
      where: { id: orgId },
      select: { mission: true, vision: true, values: true, context: true },
    });

    const contextBlock = buildContextBlock(orgForValidate);
    const entityLabel = entityType === 'objective' ? 'objetivo' : 'Key Result';
    const userPrompt = contextBlock
      ? `Contexto organizacional:\n${contextBlock}\n\nTexto a validar: Analizá el siguiente ${entityLabel} OKR:\n\n"${text}"`
      : `Analizá el siguiente ${entityLabel} OKR:\n\n"${text}"`;
    const promptHash = hashPrompt(`${entityType}:validate:${PROMPT_SET_VERSION}:${userPrompt}`);

    // Cache lookup
    const cached = await this.findCachedResponse(orgId, entityType, promptHash);
    if (cached) {
      this.logger.debug(`Cache hit for validate prompt hash=${promptHash}`);
      const rawCached = tryParseValidationJson(cached.responseText);
      if (rawCached) {
        const parsed: Omit<ValidateOutput, 'cachedHit'> = {
          overallScore: typeof rawCached.overallScore === 'number' ? rawCached.overallScore : 0,
          verdict: rawCached.verdict ?? 'insuficiente',
          criteria: rawCached.criteria ?? {
            specific: { score: 0, feedback: 'No se pudo analizar.' },
            measurable: { score: 0, feedback: 'No se pudo analizar.' },
            achievable: { score: 0, feedback: 'No se pudo analizar.' },
            relevant: { score: 0, feedback: 'No se pudo analizar.' },
            timeBound: { score: 0, feedback: 'No se pudo analizar.' },
          },
          suggestions: Array.isArray(rawCached.suggestions) ? rawCached.suggestions : [],
          ...(rawCached.hasBaseline !== undefined ? { hasBaseline: Boolean(rawCached.hasBaseline) } : {}),
          ...(rawCached.hasTarget !== undefined ? { hasTarget: Boolean(rawCached.hasTarget) } : {}),
        };
        await this.logPrompt({
          orgId,
          userId,
          operationType: 'validate',
          entityType,
          provider: providerName,
          model: modelName,
          promptHash,
          promptText: userPrompt,
          responseText: cached.responseText,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: 0,
          cacheHit: true,
          success: true,
          errorCode: null,
        });
        await this.quotaService.incrementUsage(orgId, 'validate', 0, 0);
        return { ...parsed, cachedHit: true };
      }
      // Stale cache row with malformed payload: log and fall through to a fresh call.
      this.logger.warn(
        `Cached validate response for hash=${promptHash} failed to parse; bypassing cache`,
      );
    }

    const systemPrompt =
      entityType === 'objective' ? VALIDATE_OBJECTIVE_SYSTEM_PROMPT : VALIDATE_KR_SYSTEM_PROMPT;

    const provider = this.providerFactory.get(providerName);
    const startMs = Date.now();
    let responseText = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let success = true;
    let errorCode: string | null = null;

    try {
      const response = await provider.complete({
        systemPrompt,
        userPrompt,
        model: modelName,
        maxTokens: 2048,
        temperature: 0.2,
      });
      responseText = response.text.trim();
      tokensIn = response.promptTokens;
      tokensOut = response.completionTokens;
    } catch (err) {
      success = false;
      errorCode = err instanceof Error ? err.constructor.name : 'UnknownError';
      this.logger.error(`Validate LLM call failed for org=${orgId}`, err);
      throw err;
    } finally {
      const latencyMs = Date.now() - startMs;
      await this.logPrompt({
        orgId,
        userId,
        operationType: 'validate',
        entityType,
        provider: providerName,
        model: modelName,
        promptHash,
        promptText: userPrompt,
        responseText,
        tokensIn,
        tokensOut,
        latencyMs,
        cacheHit: false,
        success,
        errorCode,
      });
      if (success) {
        await this.quotaService.incrementUsage(orgId, 'validate', tokensIn, tokensOut);
      }
    }

    if (responseText === 'OFF_TOPIC' || responseText.startsWith('OFF_TOPIC')) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'AI_OFF_TOPIC',
        message:
          'El pedido no parece relacionado con objetivos o Key Results. El copilot solo asiste en redacción SMART para OKR organizacionales.',
      });
    }

    const raw = tryParseValidationJson(responseText);
    if (!raw) {
      this.logger.warn(
        `Validate LLM response failed JSON parsing for org=${orgId}. Raw response: ${responseText.slice(0, 500)}`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'AI_INVALID_OUTPUT',
        message:
          'El copilot no pudo procesar el texto. Verificá que sea un objetivo o Key Result claro.',
      });
    }
    const parsed: Omit<ValidateOutput, 'cachedHit'> = {
      overallScore: typeof raw.overallScore === 'number' ? raw.overallScore : 0,
      verdict: raw.verdict ?? 'insuficiente',
      criteria: raw.criteria ?? {
        specific: { score: 0, feedback: 'No se pudo analizar.' },
        measurable: { score: 0, feedback: 'No se pudo analizar.' },
        achievable: { score: 0, feedback: 'No se pudo analizar.' },
        relevant: { score: 0, feedback: 'No se pudo analizar.' },
        timeBound: { score: 0, feedback: 'No se pudo analizar.' },
      },
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [],
      ...(raw.hasBaseline !== undefined ? { hasBaseline: Boolean(raw.hasBaseline) } : {}),
      ...(raw.hasTarget !== undefined ? { hasTarget: Boolean(raw.hasTarget) } : {}),
    };

    return { ...parsed, cachedHit: false };
  }

  private buildDraftUserPrompt(
    entityType: 'objective' | 'key_result',
    hint: string,
    objectiveContext: string | undefined,
    org: { mission: string | null; vision: string | null; values: string | null; context: string | null } | null,
  ): string {
    const contextBlock = buildContextBlock(org);
    const parts: string[] = [];

    if (contextBlock) {
      parts.push(`Contexto organizacional:\n${contextBlock}`);
    }

    if (entityType === 'key_result' && objectiveContext) {
      parts.push(`Objetivo al que pertenece este Key Result: "${objectiveContext}"`);
    }

    parts.push(
      `Pedido del usuario: Redactá un ${entityType === 'objective' ? 'Objetivo OKR' : 'Key Result OKR'} basado en este lineamiento: ${hint}`,
    );

    return parts.join('\n\n');
  }

  private async findCachedResponse(
    orgId: string,
    entityType: string,
    promptHash: string,
  ): Promise<{ responseText: string } | null> {
    const cutoff = new Date(Date.now() - CACHE_TTL_MS);
    return this.prisma.raw.promptLog.findFirst({
      where: {
        organizationId: orgId,
        entityType,
        promptHash,
        cacheHit: false,
        success: true,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
      select: { responseText: true },
    });
  }

  private async logPrompt(data: {
    orgId: string;
    userId: string;
    operationType: 'draft' | 'validate';
    entityType: string;
    provider: string;
    model: string;
    promptHash: string;
    promptText: string;
    responseText: string;
    tokensIn: number;
    tokensOut: number;
    latencyMs: number;
    cacheHit: boolean;
    success: boolean;
    errorCode: string | null;
  }): Promise<void> {
    try {
      await this.prisma.raw.promptLog.create({
        data: {
          organizationId: data.orgId,
          userId: data.userId,
          operationType: data.operationType,
          entityType: data.entityType,
          provider: data.provider,
          model: data.model,
          promptHash: data.promptHash,
          promptText: data.promptText,
          responseText: data.responseText,
          tokensIn: data.tokensIn,
          tokensOut: data.tokensOut,
          latencyMs: data.latencyMs,
          cacheHit: data.cacheHit,
          success: data.success,
          errorCode: data.errorCode,
        },
      });
    } catch (err) {
      // Logging failures must never break the main flow
      this.logger.error('Failed to write PromptLog entry', err);
    }
  }
}

function buildContextBlock(
  org: { mission: string | null; vision: string | null; values: string | null; context: string | null } | null,
): string {
  return [
    org?.mission && `Misión: ${org.mission}`,
    org?.vision && `Visión: ${org.vision}`,
    org?.values && `Valores: ${org.values}`,
    org?.context && `Contexto adicional: ${org.context}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function hashPrompt(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Tolerates LLM responses that wrap JSON in markdown fences or add a leading/trailing
// commentary line. Returns null if no parseable JSON object can be extracted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tryParseValidationJson(responseText: string): any | null {
  const trimmed = responseText.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];

  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) candidates.push(fence[1].trim());

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

