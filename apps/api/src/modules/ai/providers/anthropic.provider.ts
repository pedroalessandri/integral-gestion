import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResponse } from './llm-provider.interface.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.7;

@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic' as const;

  private readonly client: Anthropic;
  private readonly logger = new Logger(AnthropicProvider.name);

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.config.get<string>('ANTHROPIC_API_KEY')) {
      throw new InternalServerErrorException({
        statusCode: 500,
        error: 'Internal Server Error',
        code: 'AI_NOT_CONFIGURED',
        message:
          'El copilot AI no está configurado en este entorno. Contactá al administrador del sistema.',
      });
    }

    const model = request.model ?? DEFAULT_MODEL;
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = request.temperature ?? DEFAULT_TEMPERATURE;

    this.logger.debug(`Calling Anthropic model=${model} maxTokens=${maxTokens}`);

    let message: Awaited<ReturnType<typeof this.client.messages.create>>;
    try {
      message = await this.client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(`Anthropic API call failed: ${msg}`, err);
      throw new InternalServerErrorException({
        statusCode: 500,
        error: 'Internal Server Error',
        code: 'AI_PROVIDER_ERROR',
        message: `El proveedor AI falló: ${msg}. Probá de nuevo en unos segundos.`,
      });
    }

    const textBlock = message.content.find((b) => b.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text : '';

    const promptTokens = message.usage.input_tokens;
    const completionTokens = message.usage.output_tokens;

    return {
      text,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      model: message.model,
    };
  }
}
