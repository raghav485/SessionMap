import type { GenerationSnapshot, ModuleGenerationSnapshot } from "../generator/snapshot.js";

export interface LlmSummaryPrompt {
  systemInstruction: string;
  userPrompt: string;
}

interface ModuleSummaryInput {
  moduleBoundary: string;
  summary: string;
}

export function buildProjectSummaryPrompt(
  snapshot: GenerationSnapshot,
  moduleSummaries: ModuleSummaryInput[]
): LlmSummaryPrompt {
  return {
    systemInstruction:
      "You are generating a concise project architecture summary for a local developer tool. Return plain text only. Do not include markdown headings, code fences, bullets, or quoted source code.",
    userPrompt: JSON.stringify(
      {
        projectName: snapshot.projectName,
        techStack: snapshot.techStack,
        latestSession: snapshot.latestSession,
        modules: snapshot.modules.map((module) => ({
          moduleBoundary: module.moduleBoundary,
          fileCount: module.filePaths.length,
          dependencyCount: module.dependencyCount,
          dependentCount: module.dependentCount,
          externalDependencies: module.externalDependencies,
          structuralSummary: module.structuralSummary
        })),
        moduleSummaries,
        structuralSummary: snapshot.structuralProjectSummary
      },
      null,
      2
    )
  };
}

export function buildConventionsSummaryPrompt(
  snapshot: GenerationSnapshot,
  moduleSummaries: ModuleSummaryInput[]
): LlmSummaryPrompt {
  return {
    systemInstruction:
      "You are generating a concise conventions summary for a local developer tool. Return plain text only. Do not include markdown headings, code fences, bullets, or quoted source code.",
    userPrompt: JSON.stringify(
      {
        projectName: snapshot.projectName,
        rules: snapshot.rules,
        techStack: snapshot.techStack,
        moduleBoundaries: snapshot.moduleBoundaries,
        moduleSummaries,
        structuralSummary: snapshot.structuralConventionsSummary
      },
      null,
      2
    )
  };
}

export function buildModuleSummaryPrompt(
  moduleSnapshot: ModuleGenerationSnapshot,
  excerpts: Array<{
    path: string;
    text: string;
  }>
): LlmSummaryPrompt {
  return {
    systemInstruction:
      "You are generating a concise module summary for a local developer tool. Return plain text only. Do not include markdown headings, code fences, bullets, or quoted source code.",
    userPrompt: JSON.stringify(
      {
        moduleBoundary: moduleSnapshot.moduleBoundary,
        files: moduleSnapshot.filePaths,
        dependencyPaths: moduleSnapshot.dependencyPaths,
        dependentPaths: moduleSnapshot.dependentPaths,
        externalDependencies: moduleSnapshot.externalDependencies,
        unresolvedImports: moduleSnapshot.unresolvedImports,
        relatedSessions: moduleSnapshot.relatedSessions,
        structuralSummary: moduleSnapshot.structuralSummary,
        excerpts
      },
      null,
      2
    )
  };
}
