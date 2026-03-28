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
      throw new Error(`Google request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function extractGoogleText(payload: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}): string {
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    throw new Error("Google response did not contain text content");
  }

  return text;
}

export class GoogleProviderClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async summarize(request: ProviderSummaryRequest): Promise<ProviderSummaryResponse> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      request.model
    )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const payload = await postJson<{
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
          }>;
        };
      }>;
    }>(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.systemInstruction }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: request.userPrompt }]
            }
          ],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens
          }
        })
      },
      request.timeoutMs,
      this.fetchImpl
    );

    return {
      text: extractGoogleText(payload).trim(),
      provider: "google" satisfies LlmProvider,
      model: request.model
    };
  }
}
