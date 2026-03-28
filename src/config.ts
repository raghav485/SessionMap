import fs from "node:fs";
import path from "node:path";

import {
  CONFIG_FILE_NAME,
  DEFAULT_ANALYSIS_LANGUAGES,
  DEFAULT_CONTROL_HOST,
  DEFAULT_CONTROL_PORT,
  DEFAULT_IGNORE_PATTERNS,
  DEFAULT_LLM_ENABLED,
  DEFAULT_LLM_MAX_OUTPUT_TOKENS,
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_TEMPERATURE,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MCP_PORT,
  DEFAULT_SESSION_CAPTURE_STDOUT,
  DEFAULT_SESSION_DEBOUNCE_MS,
  DEFAULT_SESSION_INACTIVITY_GAP_MS,
  DEFAULT_SESSION_MAX_STDOUT_LINES,
  DEFAULT_WEB_PORT
} from "./constants.js";
import type { LoadedConfig, SessionMapConfig } from "./types.js";

type RawConfig = Partial<SessionMapConfig>;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseUserConfig(configPath: string): RawConfig {
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid config file at ${configPath}: expected an object`);
  }

  return raw as RawConfig;
}

function validateConfig(config: SessionMapConfig): SessionMapConfig {
  if (config.ports.controlPort < 0 || config.ports.controlPort > 65535) {
    throw new Error("config.ports.controlPort must be between 0 and 65535");
  }

  if (config.ports.webPort < 0 || config.ports.webPort > 65535) {
    throw new Error("config.ports.webPort must be between 0 and 65535");
  }

  if (config.ports.mcpPort < 0 || config.ports.mcpPort > 65535) {
    throw new Error("config.ports.mcpPort must be between 0 and 65535");
  }

  if (config.analysis.maxDepth < 1) {
    throw new Error("config.analysis.maxDepth must be greater than 0");
  }

  if (config.analysis.maxFileSizeBytes < 1) {
    throw new Error("config.analysis.maxFileSizeBytes must be greater than 0");
  }

  if (!isStringArray(config.ignore)) {
    throw new Error("config.ignore must be a string array");
  }

  if (config.session.inactivityGapMs < 1) {
    throw new Error("config.session.inactivityGapMs must be greater than 0");
  }

  if (config.session.debounceMs < 1) {
    throw new Error("config.session.debounceMs must be greater than 0");
  }

  if (config.session.maxStdoutLines < 0) {
    throw new Error("config.session.maxStdoutLines must be 0 or greater");
  }

  if (config.llm.temperature < 0 || config.llm.temperature > 2) {
    throw new Error("config.llm.temperature must be between 0 and 2");
  }

  if (config.llm.maxOutputTokens < 1) {
    throw new Error("config.llm.maxOutputTokens must be greater than 0");
  }

  if (config.llm.timeoutMs < 1) {
    throw new Error("config.llm.timeoutMs must be greater than 0");
  }

  if (config.llm.enabled && !config.llm.provider) {
    throw new Error("config.llm.provider is required when config.llm.enabled is true");
  }

  if (config.llm.enabled && !config.llm.model) {
    throw new Error("config.llm.model is required when config.llm.enabled is true");
  }

  if (config.llm.enabled && !config.llm.apiKey) {
    throw new Error("config.llm.apiKey is required when config.llm.enabled is true");
  }

  return config;
}

function resolveLlmApiKey(provider: SessionMapConfig["llm"]["provider"], configuredApiKey?: string | null): string | null {
  if (configuredApiKey) {
    return configuredApiKey;
  }

  if (provider === "openai") {
    return process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY ?? null;
  }

  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ?? process.env.LLM_API_KEY ?? null;
  }

  if (provider === "google") {
    return process.env.GOOGLE_API_KEY ?? process.env.LLM_API_KEY ?? null;
  }

  return process.env.LLM_API_KEY ?? null;
}

export function loadConfig(projectRoot: string): LoadedConfig {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  const userConfig = parseUserConfig(configPath);
  const llmProvider = userConfig.llm?.provider ?? DEFAULT_LLM_PROVIDER;

  const config: SessionMapConfig = validateConfig({
    projectName: userConfig.projectName ?? path.basename(projectRoot),
    ignore: userConfig.ignore ?? DEFAULT_IGNORE_PATTERNS,
    ports: {
      controlHost: userConfig.ports?.controlHost ?? DEFAULT_CONTROL_HOST,
      controlPort: userConfig.ports?.controlPort ?? DEFAULT_CONTROL_PORT,
      webPort: userConfig.ports?.webPort ?? DEFAULT_WEB_PORT,
      mcpPort: userConfig.ports?.mcpPort ?? DEFAULT_MCP_PORT
    },
    analysis: {
      maxFileSizeBytes: userConfig.analysis?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
      maxDepth: userConfig.analysis?.maxDepth ?? DEFAULT_MAX_DEPTH,
      languages: userConfig.analysis?.languages ?? DEFAULT_ANALYSIS_LANGUAGES
    },
    session: {
      inactivityGapMs: userConfig.session?.inactivityGapMs ?? DEFAULT_SESSION_INACTIVITY_GAP_MS,
      debounceMs: userConfig.session?.debounceMs ?? DEFAULT_SESSION_DEBOUNCE_MS,
      captureStdout: userConfig.session?.captureStdout ?? DEFAULT_SESSION_CAPTURE_STDOUT,
      maxStdoutLines: userConfig.session?.maxStdoutLines ?? DEFAULT_SESSION_MAX_STDOUT_LINES
    },
    llm: {
      enabled: userConfig.llm?.enabled ?? DEFAULT_LLM_ENABLED,
      provider: llmProvider,
      apiKey: resolveLlmApiKey(llmProvider, userConfig.llm?.apiKey ?? null),
      model: userConfig.llm?.model ?? DEFAULT_LLM_MODEL,
      temperature: userConfig.llm?.temperature ?? DEFAULT_LLM_TEMPERATURE,
      maxOutputTokens: userConfig.llm?.maxOutputTokens ?? DEFAULT_LLM_MAX_OUTPUT_TOKENS,
      timeoutMs: userConfig.llm?.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS
    },
    rules: userConfig.rules ?? []
  });

  return { config, configPath };
}
