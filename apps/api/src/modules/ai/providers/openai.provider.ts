import { Injectable, NotImplementedException } from '@nestjs/common';
import type { LlmProvider, LlmCompletionRequest, LlmCompletionResponse } from './llm-provider.interface.js';

/**
 * Stub OpenAI provider — scaffolded for future implementation (ADR-0005 D11).
 * Throws NotImplementedException if called.
 */
@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai' as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  complete(_request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    throw new NotImplementedException(
      'OpenAI provider is not yet implemented. Set AI_DEFAULT_PROVIDER=anthropic.',
    );
  }
}
