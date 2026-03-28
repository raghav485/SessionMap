import fs from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_LLM_SOURCE_FILE_BYTE_LIMIT,
  DEFAULT_LLM_SOURCE_FILE_LIMIT,
  DEFAULT_LLM_SOURCE_FILE_LINE_LIMIT,
  DEFAULT_LLM_TOTAL_SOURCE_BYTE_LIMIT
} from "../constants.js";
import { createLogger } from "../logger.js";
import type {
  GeneratedContextState,
  GeneratedSummaryRecord,
  LlmConfig,
  LlmProvider,
  ModuleSummaryRecord
} from "../types.js";
import type { GenerationSnapshot, ModuleGenerationSnapshot } from "../generator/snapshot.js";
import { createLlmProviderClient, type LlmProviderClient } from "./client.js";
import {
  buildConventionsSummaryPrompt,
  buildModuleSummaryPrompt,
  buildProjectSummaryPrompt
} from "./prompt-builder.js";

const logger = createLogger("llm-summarizer");

interface SourceExcerpt {
  path: string;
  text: string;
}

export interface SummarizeSnapshotOptions {
  snapshot: GenerationSnapshot;
  projectRoot: string;
  llm: LlmConfig;
  fetchImpl?: typeof fetch;
}

export interface SummarizeSnapshotResult {
  generatedContext: GeneratedContextState;
  llmAttempted: boolean;
  llmProvider?: LlmProvider;
}

function createStructuralSummaryRecord(text: string, generatedAt: string): GeneratedSummaryRecord {
  return {
    text,
    source: "heuristic",
    generatedAt
  };
}

function createStructuralModuleSummaryRecord(
  moduleSnapshot: ModuleGenerationSnapshot,
  generatedAt: string
): ModuleSummaryRecord {
  return {
    moduleBoundary: moduleSnapshot.moduleBoundary,
    filePaths: [...moduleSnapshot.filePaths],
    ...createStructuralSummaryRecord(moduleSnapshot.structuralSummary, generatedAt)
  };
}

function sanitizeSummaryText(text: string): string | null {
  const sanitized = text
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/^\s*[-*]\s+/gmu, "")
    .replace(/^\s*>\s?/gmu, "")
    .replace(/\s+/gu, " ")
    .trim();

  return sanitized.length > 0 ? sanitized : null;
}

function createLlmSummaryRecord(
  text: string,
  generatedAt: string,
  provider: LlmProvider,
  model: string
): GeneratedSummaryRecord {
  return {
    text,
    source: "llm",
    generatedAt,
    provider,
    model
  };
}

function rankModuleFiles(moduleSnapshot: ModuleGenerationSnapshot): string[] {
  return [...moduleSnapshot.files]
    .sort((left, right) => {
      if (left.touchedByLatestSession !== right.touchedByLatestSession) {
        return left.touchedByLatestSession ? -1 : 1;
      }

      if (left.incomingCount !== right.incomingCount) {
        return right.incomingCount - left.incomingCount;
      }

      if (left.outgoingCount !== right.outgoingCount) {
        return right.outgoingCount - left.outgoingCount;
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, DEFAULT_LLM_SOURCE_FILE_LIMIT)
    .map((file) => file.path);
}

async function readBoundedExcerpt(projectRoot: string, relativePath: string): Promise<string | null> {
  const absolutePath = path.join(projectRoot, relativePath);
  const contents = await fs.readFile(absolutePath, "utf8");
  const lines = contents.split(/\r?\n/u).slice(0, DEFAULT_LLM_SOURCE_FILE_LINE_LIMIT).join("\n");
  const bounded = Buffer.from(lines, "utf8").subarray(0, DEFAULT_LLM_SOURCE_FILE_BYTE_LIMIT).toString("utf8").trim();
  return bounded.length > 0 ? bounded : null;
}

async function buildModuleExcerpts(projectRoot: string, moduleSnapshot: ModuleGenerationSnapshot): Promise<SourceExcerpt[]> {
  const excerpts: SourceExcerpt[] = [];
  let totalBytes = 0;

  for (const relativePath of rankModuleFiles(moduleSnapshot)) {
    if (totalBytes >= DEFAULT_LLM_TOTAL_SOURCE_BYTE_LIMIT) {
      break;
    }

    try {
      const excerpt = await readBoundedExcerpt(projectRoot, relativePath);
      if (!excerpt) {
        continue;
      }

      const excerptBytes = Buffer.byteLength(excerpt, "utf8");
      if (totalBytes + excerptBytes > DEFAULT_LLM_TOTAL_SOURCE_BYTE_LIMIT) {
        const remainingBytes = DEFAULT_LLM_TOTAL_SOURCE_BYTE_LIMIT - totalBytes;
        if (remainingBytes <= 0) {
          break;
        }

        const truncated = Buffer.from(excerpt, "utf8").subarray(0, remainingBytes).toString("utf8").trim();
        if (!truncated) {
          break;
        }

        excerpts.push({
          path: relativePath,
          text: truncated
        });
        break;
      }

      excerpts.push({
        path: relativePath,
        text: excerpt
      });
      totalBytes += excerptBytes;
    } catch (error) {
      logger.warn("Skipping module source excerpt", {
        moduleBoundary: moduleSnapshot.moduleBoundary,
        path: relativePath,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return excerpts;
}

async function attemptSummary(
  client: LlmProviderClient,
  request: {
    systemInstruction: string;
    userPrompt: string;
    temperature: number;
    maxOutputTokens: number;
    timeoutMs: number;
    model: string;
  },
  failureMetadata: Record<string, unknown>
): Promise<GeneratedSummaryRecord | null> {
  try {
    const response = await client.summarize(request);
    const sanitized = sanitizeSummaryText(response.text);
    if (!sanitized) {
      return null;
    }

    return createLlmSummaryRecord(sanitized, new Date().toISOString(), response.provider, response.model);
  } catch (error) {
    logger.warn("LLM summarization failed", {
      ...failureMetadata,
      message: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function summarizeSnapshot(options: SummarizeSnapshotOptions): Promise<SummarizeSnapshotResult> {
  const generatedAt = new Date().toISOString();
  const structuralModuleSummaries = Object.fromEntries(
    options.snapshot.modules.map((moduleSnapshot) => [
      moduleSnapshot.moduleBoundary,
      createStructuralModuleSummaryRecord(moduleSnapshot, generatedAt)
    ])
  );

  const generatedContext: GeneratedContextState = {
    lastGeneratedAt: generatedAt,
    projectSummary: createStructuralSummaryRecord(options.snapshot.structuralProjectSummary, generatedAt),
    conventionsSummary: createStructuralSummaryRecord(options.snapshot.structuralConventionsSummary, generatedAt),
    moduleSummaries: structuralModuleSummaries,
    generatedFiles: []
  };

  if (!options.llm.enabled) {
    return {
      generatedContext,
      llmAttempted: false
    };
  }

  if (!options.llm.provider || !options.llm.apiKey || !options.llm.model) {
    throw new Error("LLM is enabled but provider, apiKey, or model is missing from config");
  }

  const client = createLlmProviderClient({
    provider: options.llm.provider,
    apiKey: options.llm.apiKey,
    fetchImpl: options.fetchImpl
  });

  let llmAttempted = false;

  for (const moduleSnapshot of options.snapshot.modules) {
    const excerpts = await buildModuleExcerpts(options.projectRoot, moduleSnapshot);
    if (excerpts.length === 0) {
      continue;
    }

    llmAttempted = true;
    const prompt = buildModuleSummaryPrompt(moduleSnapshot, excerpts);
    const summary = await attemptSummary(
      client,
      {
        ...prompt,
        temperature: options.llm.temperature,
        maxOutputTokens: options.llm.maxOutputTokens,
        timeoutMs: options.llm.timeoutMs,
        model: options.llm.model
      },
      {
        provider: options.llm.provider,
        moduleBoundary: moduleSnapshot.moduleBoundary
      }
    );

    if (summary) {
      generatedContext.moduleSummaries[moduleSnapshot.moduleBoundary] = {
        ...summary,
        moduleBoundary: moduleSnapshot.moduleBoundary,
        filePaths: [...moduleSnapshot.filePaths]
      };
    }
  }

  const moduleSummaryFacts = options.snapshot.modules.map((moduleSnapshot) => ({
    moduleBoundary: moduleSnapshot.moduleBoundary,
    summary: generatedContext.moduleSummaries[moduleSnapshot.moduleBoundary]?.text ?? moduleSnapshot.structuralSummary
  }));

  llmAttempted = true;
  const projectPrompt = buildProjectSummaryPrompt(options.snapshot, moduleSummaryFacts);
  const projectSummary = await attemptSummary(
    client,
    {
      ...projectPrompt,
      temperature: options.llm.temperature,
      maxOutputTokens: options.llm.maxOutputTokens,
      timeoutMs: options.llm.timeoutMs,
      model: options.llm.model
    },
    {
      provider: options.llm.provider,
      target: "project-summary"
    }
  );
  if (projectSummary) {
    generatedContext.projectSummary = projectSummary;
  }

  llmAttempted = true;
  const conventionsPrompt = buildConventionsSummaryPrompt(options.snapshot, moduleSummaryFacts);
  const conventionsSummary = await attemptSummary(
    client,
    {
      ...conventionsPrompt,
      temperature: options.llm.temperature,
      maxOutputTokens: options.llm.maxOutputTokens,
      timeoutMs: options.llm.timeoutMs,
      model: options.llm.model
    },
    {
      provider: options.llm.provider,
      target: "conventions-summary"
    }
  );
  if (conventionsSummary) {
    generatedContext.conventionsSummary = conventionsSummary;
  }

  return {
    generatedContext,
    llmAttempted,
    llmProvider: options.llm.provider
  };
}
