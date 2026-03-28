import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  DEFAULT_MCP_PORT,
  DEFAULT_WEB_PORT,
  DEFAULT_LLM_MAX_OUTPUT_TOKENS,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_SESSION_CAPTURE_STDOUT,
  DEFAULT_SESSION_DEBOUNCE_MS,
  DEFAULT_SESSION_INACTIVITY_GAP_MS,
  DEFAULT_SESSION_MAX_STDOUT_LINES
} from "../src/constants.js";
import { copyFixtureToTempDir } from "./helpers.js";

describe("config", () => {
  test("loads session defaults", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const loaded = loadConfig(projectRoot);

    expect(loaded.config.session.inactivityGapMs).toBe(DEFAULT_SESSION_INACTIVITY_GAP_MS);
    expect(loaded.config.session.debounceMs).toBe(DEFAULT_SESSION_DEBOUNCE_MS);
    expect(loaded.config.session.captureStdout).toBe(DEFAULT_SESSION_CAPTURE_STDOUT);
    expect(loaded.config.session.maxStdoutLines).toBe(DEFAULT_SESSION_MAX_STDOUT_LINES);
    expect(loaded.config.ports.webPort).toBe(DEFAULT_WEB_PORT);
    expect(loaded.config.ports.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(loaded.config.llm.enabled).toBe(false);
    expect(loaded.config.llm.provider).toBeNull();
    expect(loaded.config.llm.model).toBeNull();
    expect(loaded.config.llm.temperature).toBe(DEFAULT_LLM_TEMPERATURE);
    expect(loaded.config.llm.maxOutputTokens).toBe(DEFAULT_LLM_MAX_OUTPUT_TOKENS);
    expect(loaded.config.llm.timeoutMs).toBe(DEFAULT_LLM_TIMEOUT_MS);
  });

  test("rejects invalid session config values", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    await fs.writeFile(
      path.join(projectRoot, "sessionmap.config.json"),
      JSON.stringify({
        session: {
          inactivityGapMs: 0,
          debounceMs: 0,
          captureStdout: true,
          maxStdoutLines: -1
        }
      }),
      "utf8"
    );

    expect(() => loadConfig(projectRoot)).toThrow("config.session.inactivityGapMs");
  });

  test("rejects invalid web port values", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    await fs.writeFile(
      path.join(projectRoot, "sessionmap.config.json"),
      JSON.stringify({
        ports: {
          webPort: -1
        }
      }),
      "utf8"
    );

    expect(() => loadConfig(projectRoot)).toThrow("config.ports.webPort");
  });

  test("rejects invalid mcp port values", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    await fs.writeFile(
      path.join(projectRoot, "sessionmap.config.json"),
      JSON.stringify({
        ports: {
          mcpPort: -1
        }
      }),
      "utf8"
    );

    expect(() => loadConfig(projectRoot)).toThrow("config.ports.mcpPort");
  });

  test("requires provider and model when llm is enabled", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    await fs.writeFile(
      path.join(projectRoot, "sessionmap.config.json"),
      JSON.stringify({
        llm: {
          enabled: true
        }
      }),
      "utf8"
    );

    expect(() => loadConfig(projectRoot)).toThrow("config.llm.provider");
  });

  test("resolves provider-specific llm api keys from env", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    await fs.writeFile(
      path.join(projectRoot, "sessionmap.config.json"),
      JSON.stringify({
        llm: {
          enabled: true,
          provider: "openai",
          model: "gpt-test"
        }
      }),
      "utf8"
    );

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "openai-test-key";
    try {
      const loaded = loadConfig(projectRoot);
      expect(loaded.config.llm.apiKey).toBe("openai-test-key");
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  });
});
