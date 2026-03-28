import type { LlmProvider } from "../types.js";
import { AnthropicProviderClient } from "./providers/anthropic.js";
import { GoogleProviderClient } from "./providers/google.js";
import { OpenAiProviderClient, type ProviderSummaryRequest, type ProviderSummaryResponse } from "./providers/openai.js";

export type { ProviderSummaryRequest, ProviderSummaryResponse } from "./providers/openai.js";

export interface LlmProviderClient {
  summarize(request: ProviderSummaryRequest): Promise<ProviderSummaryResponse>;
}

export interface CreateLlmProviderClientOptions {
  provider: LlmProvider;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export function createLlmProviderClient(options: CreateLlmProviderClientOptions): LlmProviderClient {
  switch (options.provider) {
    case "openai":
      return new OpenAiProviderClient(options.apiKey, options.fetchImpl);
    case "anthropic":
      return new AnthropicProviderClient(options.apiKey, options.fetchImpl);
    case "google":
      return new GoogleProviderClient(options.apiKey, options.fetchImpl);
    default: {
      const exhaustive: never = options.provider;
      throw new Error(`Unsupported LLM provider: ${String(exhaustive)}`);
    }
  }
}
