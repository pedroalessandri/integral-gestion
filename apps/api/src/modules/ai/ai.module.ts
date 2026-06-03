import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/index.js';
import { AnthropicProvider } from './providers/anthropic.provider.js';
import { OpenAiProvider } from './providers/openai.provider.js';
import { LlmProviderFactory } from './providers/llm-provider.factory.js';
import { AiService } from './services/ai.service.js';
import { QuotaService } from './services/quota.service.js';
import { AiController } from './controllers/ai.controller.js';

/**
 * AiModule — AI copilot for drafting and validating OKR Objectives and Key Results.
 *
 * Provides:
 *  - AnthropicProvider / OpenAiProvider (LLM adapters)
 *  - LlmProviderFactory (selects provider by name)
 *  - AiService (orchestrates draft + validate flows)
 *  - QuotaService (monthly quota enforcement + usage counters)
 *
 * Exports AiService and QuotaService for potential reuse by other modules.
 *
 * Per ADR-0005.
 */
@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [
    AnthropicProvider,
    OpenAiProvider,
    LlmProviderFactory,
    AiService,
    QuotaService,
  ],
  exports: [AiService, QuotaService],
})
export class AiModule {}
