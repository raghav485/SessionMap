import type { LlmProvider } from "../../types.js";

import type { ProviderSummaryRequest, ProviderSummaryResponse } from "./openai.js";

async function postJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function extractAnthropicText(payload: {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}): string {
  const text = payload.content?.find((item) => item.type === "text" && typeof item.text === "string")?.text;
  if (!text) {
    throw new Error("Anthropic response did not contain text content");
  }

  return text;
}

export class AnthropicProviderClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async summarize(request: ProviderSummaryRequest): Promise<ProviderSummaryResponse> {
    const payload = await postJson<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          model: request.model,
          system: request.systemInstruction,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          messages: [
            {
              role: "user",
              content: request.userPrompt
            }
          ]
        })
      },
      request.timeoutMs,
      this.fetchImpl
    );

    return {
      text: extractAnthropicText(payload).trim(),
      provider: "anthropic" satisfies LlmProvider,
      model: request.model
    };
  }
}
