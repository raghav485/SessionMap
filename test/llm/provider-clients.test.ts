import { describe, expect, test } from "vitest";

import { AnthropicProviderClient } from "../../src/llm/providers/anthropic.js";
import { GoogleProviderClient } from "../../src/llm/providers/google.js";
import { OpenAiProviderClient } from "../../src/llm/providers/openai.js";

function createJsonFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    })) as typeof fetch;
}

describe("llm provider clients", () => {
  test("maps OpenAI responses into normalized summary text", async () => {
    const client = new OpenAiProviderClient("test-key", createJsonFetch({ output_text: "Project summary" }));
    const response = await client.summarize({
      systemInstruction: "system",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 200,
      timeoutMs: 1000,
      model: "gpt-test"
    });

    expect(response.provider).toBe("openai");
    expect(response.model).toBe("gpt-test");
    expect(response.text).toBe("Project summary");
  });

  test("maps Anthropic responses into normalized summary text", async () => {
    const client = new AnthropicProviderClient(
      "test-key",
      createJsonFetch({
        content: [{ type: "text", text: "Conventions summary" }]
      })
    );
    const response = await client.summarize({
      systemInstruction: "system",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 200,
      timeoutMs: 1000,
      model: "claude-test"
    });

    expect(response.provider).toBe("anthropic");
    expect(response.text).toBe("Conventions summary");
  });

  test("maps Google responses into normalized summary text", async () => {
    const client = new GoogleProviderClient(
      "test-key",
      createJsonFetch({
        candidates: [
          {
            content: {
              parts: [{ text: "Module summary" }]
            }
          }
        ]
      })
    );
    const response = await client.summarize({
      systemInstruction: "system",
      userPrompt: "user",
      temperature: 0.2,
      maxOutputTokens: 200,
      timeoutMs: 1000,
      model: "gemini-test"
    });

    expect(response.provider).toBe("google");
    expect(response.text).toBe("Module summary");
  });
});
