import { Injectable } from '@nestjs/common';
import { AnthropicProvider } from './anthropic.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import type { LlmProvider } from './llm-provider.interface.js';

@Injectable()
export class LlmProviderFactory {
  constructor(
    private readonly anthropic: AnthropicProvider,
    private readonly openai: OpenAiProvider,
  ) {}

  get(providerName: 'anthropic' | 'openai'): LlmProvider {
    if (providerName === 'anthropic') return this.anthropic;
    if (providerName === 'openai') return this.openai;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    throw new Error(`Unknown LLM provider: ${providerName as any}`);
  }
}
