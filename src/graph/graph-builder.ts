import path from "node:path";

import { SCHEMA_VERSION } from "../constants.js";
import type { AnalyzedFile, PersistedState, ProjectEdge, ProjectNode, ScanSummary, TechStackSummary } from "../types.js";
import { createDirectoryNodeId, createFileNodeId } from "./knowledge-graph.js";

interface BuildGraphStateOptions {
  projectRoot: string;
  analyzedFiles: AnalyzedFile[];
  techStack: TechStackSummary;
  startedAt: string;
  completedAt: string;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/");
}

function createFileSummary(file: AnalyzedFile): string {
  const exportCount = file.exports.length;
  const dependencyCount = file.imports.length;
  return `${file.language} file exporting ${exportCount} symbol(s) and referencing ${dependencyCount} dependency path(s).`;
}

export function collectAncestorDirectories(relativePath: string): string[] {
  const directories: string[] = [];
  const normalized = normalizeRelativePath(relativePath);
  const fileDirectories = normalized.split("/").slice(0, -1);
  let current = "";

  for (const segment of fileDirectories) {
    current = current ? `${current}/${segment}` : segment;
    directories.push(current);
  }

  return directories;
}

export function buildDirectoryNode(directoryPath: string, techStack: TechStackSummary): ProjectNode {
  return {
    id: createDirectoryNodeId(directoryPath),
    type: "directory",
    path: directoryPath,
    language: "directory",
    tier: 3,
    name: path.basename(directoryPath),
    summary: `Directory containing project files under ${directoryPath}.`,
    summarySource: "heuristic",
    exports: [],
    metadata: {
      linesOfCode: 0,
      lastModified: "",
      techStack: [...techStack.frameworks]
    }
  };
}

export function buildFileNode(file: AnalyzedFile, techStack: TechStackSummary): ProjectNode {
  return {
    id: createFileNodeId(file.relativePath),
    type: "file",
    path: file.relativePath,
    language: file.language,
    tier: file.tier,
    name: path.basename(file.relativePath),
    summary: createFileSummary(file),
    summarySource: file.source,
    exports: file.exports,
    metadata: {
      linesOfCode: file.linesOfCode,
      lastModified: file.lastModified,
      techStack: techStack.frameworks,
      moduleBoundary: file.moduleBoundary,
      externalDependencies: file.externalDependencies,
      unresolvedImports: file.unresolvedImports
    }
  };
}

export function buildEdgesForFile(file: AnalyzedFile): ProjectEdge[] {
  const edgeGroups = new Map<string, ProjectEdge>();
  for (const parsedImport of file.imports) {
    if (!parsedImport.resolvedPath || parsedImport.external) {
      continue;
    }

    const edgeKey = `${file.relativePath}::${parsedImport.resolvedPath}`;
    const existing = edgeGroups.get(edgeKey);
    if (existing) {
      existing.symbols.push(...parsedImport.symbols);
      existing.weight += 1;
      continue;
    }

    edgeGroups.set(edgeKey, {
      source: createFileNodeId(file.relativePath),
      target: createFileNodeId(parsedImport.resolvedPath),
      type: "imports",
      symbols: [...parsedImport.symbols],
      weight: 1
    });
  }

  return Array.from(edgeGroups.values()).sort((left, right) =>
    `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)
  );
}

function buildDirectoryNodes(files: AnalyzedFile[], techStack: TechStackSummary): ProjectNode[] {
  const directories = new Map<string, ProjectNode>();
  for (const file of files) {
    for (const directoryPath of collectAncestorDirectories(file.relativePath)) {
      if (!directories.has(directoryPath)) {
        directories.set(directoryPath, buildDirectoryNode(directoryPath, techStack));
      }
    }
  }

  return Array.from(directories.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function buildFileNodes(files: AnalyzedFile[], techStack: TechStackSummary): ProjectNode[] {
  return files.map((file) => buildFileNode(file, techStack));
}

function buildEdges(files: AnalyzedFile[]): ProjectEdge[] {
  return files.flatMap((file) => buildEdgesForFile(file));
}

function buildLanguageCounts(files: AnalyzedFile[]): Record<string, number> {
  return files.reduce<Record<string, number>>((counts, file) => {
    counts[file.language] = (counts[file.language] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildGraphState(options: BuildGraphStateOptions): PersistedState {
  const nodes = [...buildDirectoryNodes(options.analyzedFiles, options.techStack), ...buildFileNodes(options.analyzedFiles, options.techStack)];
  const edges = buildEdges(options.analyzedFiles);

  const summary: ScanSummary = {
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    durationMs: Math.max(0, new Date(options.completedAt).getTime() - new Date(options.startedAt).getTime()),
    filesScanned: options.analyzedFiles.length,
    nodes: nodes.length,
    edges: edges.length,
    languages: buildLanguageCounts(options.analyzedFiles)
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: options.completedAt,
    projectRoot: normalizeRelativePath(options.projectRoot),
    techStack: options.techStack,
    nodes,
    edges,
    sessions: [],
    changeSets: [],
    generatedContext: {
      moduleSummaries: {},
      generatedFiles: []
    },
    metadata: {
      lastScanSummary: summary
    }
  };
}
