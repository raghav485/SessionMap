import { createLogger } from "../logger.js";
import type { GeneratedContextResponse, GenerateSummary, IGraphStore, LlmConfig } from "../types.js";
import { summarizeSnapshot } from "../llm/summarizer.js";
import { buildGenerationSnapshot } from "./snapshot.js";
import { renderGeneratedArtifacts } from "./templates.js";
import { writeGeneratedArtifacts } from "./writer.js";

const logger = createLogger("generator-service");

export interface GeneratorServiceOptions {
  store: IGraphStore;
  projectName: string;
  projectRoot: string;
  rules: {
    id: string;
    source: "user";
    description: string;
    check?: {
      type: "import-boundary";
      from: string;
      notTo: string;
    };
  }[];
  llm: LlmConfig;
  fetchImpl?: typeof fetch;
}

export interface GenerateResult {
  summary: GenerateSummary;
  generatedContext: GeneratedContextResponse;
  affectedModuleBoundaries: string[];
}

export class GeneratorService {
  private inFlight = false;

  constructor(private readonly options: GeneratorServiceOptions) {}

  getGeneratedContext(): GeneratedContextResponse {
    return this.options.store.getGeneratedContext();
  }

  async generate(): Promise<GenerateResult> {
    if (this.inFlight) {
      const error = new Error("A generation run is already active");
      error.name = "GenerationConflictError";
      throw error;
    }

    this.inFlight = true;
    const startedAt = new Date();
    try {
      const snapshot = buildGenerationSnapshot(this.options.store, {
        projectName: this.options.projectName,
        projectRoot: this.options.projectRoot,
        rules: this.options.rules
      });
      const summarized = await summarizeSnapshot({
        snapshot,
        projectRoot: this.options.projectRoot,
        llm: this.options.llm,
        fetchImpl: this.options.fetchImpl
      });
      const artifacts = renderGeneratedArtifacts(snapshot, summarized.generatedContext, summarized.generatedContext.lastGeneratedAt ?? startedAt.toISOString());
      const generatedFiles = await writeGeneratedArtifacts(this.options.projectRoot, artifacts);
      const completedAt = new Date();
      const generatedContext = {
        ...summarized.generatedContext,
        generatedFiles
      };
      const summary: GenerateSummary = {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        artifactCount: generatedFiles.length,
        moduleCount: snapshot.modules.length,
        llmUsed: summarized.llmAttempted,
        llmProvider: summarized.llmProvider,
        generatedFiles
      };

      this.options.store.setGeneratedContext(generatedContext);
      this.options.store.updateMetadata({
        lastGenerateSummary: summary
      });
      this.options.store.persist();

      logger.info("Generated SessionMap context artifacts", {
        projectRoot: this.options.projectRoot,
        artifactCount: summary.artifactCount,
        moduleCount: summary.moduleCount,
        llmUsed: summary.llmUsed,
        llmProvider: summary.llmProvider
      });

      return {
        summary,
        generatedContext,
        affectedModuleBoundaries: snapshot.moduleBoundaries
      };
    } finally {
      this.inFlight = false;
    }
  }
}
