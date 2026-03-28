import type { LlmProvider } from "../../types.js";

export interface ProviderSummaryRequest {
  systemInstruction: string;
  userPrompt: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  model: string;
}

export interface ProviderSummaryResponse {
  text: string;
  provider: LlmProvider;
  model: string;
}

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
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAiText(payload: {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}): string {
  if (payload.output_text) {
    return payload.output_text;
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && typeof content.text === "string")
    ?.text;

  if (!text) {
    throw new Error("OpenAI response did not contain output text");
  }

  return text;
}

export class OpenAiProviderClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async summarize(request: ProviderSummaryRequest): Promise<ProviderSummaryResponse> {
    const payload = await postJson<{
      output_text?: string;
      output?: Array<{
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
    }>(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          model: request.model,
          instructions: request.systemInstruction,
          input: request.userPrompt,
          temperature: request.temperature,
          max_output_tokens: request.maxOutputTokens
        })
      },
      request.timeoutMs,
      this.fetchImpl
    );

    return {
      text: extractOpenAiText(payload).trim(),
      provider: "openai",
      model: request.model
    };
  }
}
