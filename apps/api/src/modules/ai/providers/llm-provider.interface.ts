export interface LlmCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmCompletionResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

export interface LlmProvider {
  readonly name: 'anthropic' | 'openai';
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}
