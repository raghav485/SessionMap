import {
  GENERATED_ARCHITECTURE_FILE_NAME,
  GENERATED_CONVENTIONS_FILE_NAME,
  GENERATED_MODULES_INDEX_FILE_NAME,
  GENERATED_TECH_STACK_FILE_NAME
} from "../constants.js";
import type {
  GeneratedContextState,
  GeneratedSummaryRecord,
  ModuleSummaryRecord
} from "../types.js";
import type { GenerationSnapshot, ModuleGenerationSnapshot } from "./snapshot.js";

function formatSummarySource(summary: GeneratedSummaryRecord | ModuleSummaryRecord | undefined): string {
  if (!summary) {
    return "none";
  }

  const provider = summary.provider ? ` via ${summary.provider}${summary.model ? ` (${summary.model})` : ""}` : "";
  return `${summary.source}${provider}`;
}

function renderFileList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

export function getModuleDocumentFileName(moduleBoundary: string): string {
  return `${encodeURIComponent(moduleBoundary === "." ? "__root__" : moduleBoundary)}.md`;
}

export function renderArchitectureMarkdown(
  snapshot: GenerationSnapshot,
  generatedContext: GeneratedContextState,
  generatedAt: string
): string {
  const projectSummary = generatedContext.projectSummary;
  const latestSession = snapshot.latestSession;

  return [
    `# ${snapshot.projectName} Architecture`,
    ``,
    `Generated At: ${generatedAt}`,
    `Summary Source: ${formatSummarySource(projectSummary)}`,
    ``,
    `## Project Summary`,
    projectSummary?.text ?? snapshot.structuralProjectSummary,
    ``,
    `## Top Module Boundaries`,
    renderFileList(
      snapshot.modules.map(
        (module) => `${module.moduleBoundary} (${module.filePaths.length} files, ${module.dependencyCount} deps, ${module.dependentCount} dependents)`
      )
    ),
    ``,
    `## Dependency Hotspots`,
    renderFileList(
      snapshot.dependencyHotspots.map(
        (hotspot) =>
          `${hotspot.path} (incoming ${hotspot.incomingCount}, outgoing ${hotspot.outgoingCount}, module ${hotspot.moduleBoundary ?? "n/a"})`
      )
    ),
    ``,
    `## Recent Session Pointer`,
    latestSession
      ? `- ${latestSession.id} • ${latestSession.source} • touched ${latestSession.touchedPaths.length} file(s) across ${latestSession.touchedModules.length} module(s)`
      : `- No sessions recorded yet.`,
    ``,
    `## User Architecture Rules`,
    renderFileList(snapshot.rules.map((rule) => rule.description)),
    ``,
    `## Provenance`,
    `- Structural data comes from persisted graph and session state.`,
    `- Generated prose is tagged above as heuristic or llm.`,
    `- Raw source code is never written into this file.`
  ].join("\n");
}

export function renderTechStackMarkdown(snapshot: GenerationSnapshot, generatedAt: string): string {
  return [
    `# ${snapshot.projectName} Tech Stack`,
    ``,
    `Generated At: ${generatedAt}`,
    `Summary Source: heuristic`,
    ``,
    `## Languages`,
    renderFileList(snapshot.techStack.languages),
    ``,
    `## Frameworks`,
    renderFileList(snapshot.techStack.frameworks),
    ``,
    `## Package Managers`,
    renderFileList(snapshot.techStack.packageManagers),
    ``,
    `## Config Files`,
    renderFileList(snapshot.techStack.configFiles)
  ].join("\n");
}

export function renderConventionsMarkdown(
  snapshot: GenerationSnapshot,
  generatedContext: GeneratedContextState,
  generatedAt: string
): string {
  const conventionsSummary = generatedContext.conventionsSummary;

  return [
    `# ${snapshot.projectName} Conventions`,
    ``,
    `Generated At: ${generatedAt}`,
    `Summary Source: ${formatSummarySource(conventionsSummary)}`,
    ``,
    `## Conventions Summary`,
    conventionsSummary?.text ?? snapshot.structuralConventionsSummary,
    ``,
    `## User Rules`,
    renderFileList(snapshot.rules.map((rule) => rule.description)),
    ``,
    `## Structural Signals`,
    renderFileList([
      `Languages: ${snapshot.techStack.languages.join(", ") || "none"}`,
      `Frameworks: ${snapshot.techStack.frameworks.join(", ") || "none"}`,
      `Module boundaries: ${snapshot.moduleBoundaries.join(", ") || "none"}`
    ]),
    ``,
    `## Provenance`,
    `- This document is generated from config rules, graph state, and optional LLM summaries.`,
    `- File-level explanations remain structural in Milestone 5.`
  ].join("\n");
}

export function renderModulesIndexMarkdown(snapshot: GenerationSnapshot, generatedAt: string): string {
  return [
    `# ${snapshot.projectName} Modules`,
    ``,
    `Generated At: ${generatedAt}`,
    `Summary Source: heuristic`,
    ``,
    `## Module Index`,
    renderFileList(
      snapshot.modules.map(
        (module) =>
          `${module.moduleBoundary} • ${module.filePaths.length} files • ${module.dependencyCount} deps • ${module.dependentCount} dependents • related sessions ${module.relatedSessions.length} • modules/${getModuleDocumentFileName(module.moduleBoundary)}`
      )
    )
  ].join("\n");
}

export function renderModuleMarkdown(
  snapshot: ModuleGenerationSnapshot,
  generatedContext: GeneratedContextState,
  generatedAt: string
): string {
  const moduleSummary = generatedContext.moduleSummaries[snapshot.moduleBoundary];

  return [
    `# Module: ${snapshot.moduleBoundary}`,
    ``,
    `Generated At: ${generatedAt}`,
    `Summary Source: ${formatSummarySource(moduleSummary)}`,
    ``,
    `## Summary`,
    moduleSummary?.text ?? snapshot.structuralSummary,
    ``,
    `## Files`,
    renderFileList(snapshot.filePaths),
    ``,
    `## Internal Dependencies`,
    renderFileList(snapshot.dependencyPaths),
    ``,
    `## Internal Dependents`,
    renderFileList(snapshot.dependentPaths),
    ``,
    `## External Dependencies`,
    renderFileList(snapshot.externalDependencies),
    ``,
    `## Unresolved Imports`,
    renderFileList(snapshot.unresolvedImports),
    ``,
    `## Related Sessions`,
    renderFileList(
      snapshot.relatedSessions.map(
        (session) => `${session.id} • ${session.source} • touched ${session.touchedPathsCount} files`
      )
    )
  ].join("\n");
}

export function renderGeneratedArtifacts(
  snapshot: GenerationSnapshot,
  generatedContext: GeneratedContextState,
  generatedAt: string
): Record<string, string> {
  const documents: Record<string, string> = {
    [GENERATED_ARCHITECTURE_FILE_NAME]: renderArchitectureMarkdown(snapshot, generatedContext, generatedAt),
    [GENERATED_TECH_STACK_FILE_NAME]: renderTechStackMarkdown(snapshot, generatedAt),
    [GENERATED_CONVENTIONS_FILE_NAME]: renderConventionsMarkdown(snapshot, generatedContext, generatedAt),
    [GENERATED_MODULES_INDEX_FILE_NAME]: renderModulesIndexMarkdown(snapshot, generatedAt)
  };

  for (const moduleSnapshot of snapshot.modules) {
    documents[`modules/${getModuleDocumentFileName(moduleSnapshot.moduleBoundary)}`] = renderModuleMarkdown(
      moduleSnapshot,
      generatedContext,
      generatedAt
    );
  }

  return documents;
}
