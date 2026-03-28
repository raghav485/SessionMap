import {
  DEFAULT_RELATED_SESSIONS_LIMIT
} from "../constants.js";
import { buildRelatedSessionSummariesForPath } from "../session/session-query.js";
import type {
  ArchitectureRule,
  IGraphStore,
  SessionSource,
  SessionSummaryResponse,
  TechStackSummary
} from "../types.js";

export interface GenerationLatestSessionSnapshot {
  id: string;
  source: SessionSource;
  startedAt: string;
  endedAt: string;
  touchedPaths: string[];
  touchedModules: string[];
}

export interface ModuleFileSnapshot {
  path: string;
  incomingCount: number;
  outgoingCount: number;
  touchedByLatestSession: boolean;
}

export interface ModuleGenerationSnapshot {
  moduleBoundary: string;
  filePaths: string[];
  files: ModuleFileSnapshot[];
  dependencyPaths: string[];
  dependentPaths: string[];
  dependencyCount: number;
  dependentCount: number;
  externalDependencies: string[];
  unresolvedImports: string[];
  relatedSessions: SessionSummaryResponse[];
  structuralSummary: string;
}

export interface DependencyHotspotSnapshot {
  path: string;
  moduleBoundary?: string;
  incomingCount: number;
  outgoingCount: number;
}

export interface GenerationSnapshot {
  projectName: string;
  projectRoot: string;
  techStack: TechStackSummary;
  rules: ArchitectureRule[];
  latestSession: GenerationLatestSessionSnapshot | null;
  moduleBoundaries: string[];
  modules: ModuleGenerationSnapshot[];
  dependencyHotspots: DependencyHotspotSnapshot[];
  structuralProjectSummary: string;
  structuralConventionsSummary: string;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function summarizeModule(snapshot: Omit<ModuleGenerationSnapshot, "structuralSummary">): string {
  const packages = snapshot.externalDependencies.slice(0, 3);
  const packagePart = packages.length > 0 ? ` External packages include ${packages.join(", ")}.` : "";
  const unresolvedPart =
    snapshot.unresolvedImports.length > 0 ? ` It currently has ${snapshot.unresolvedImports.length} unresolved import(s).` : "";
  return `Module ${snapshot.moduleBoundary} contains ${snapshot.filePaths.length} file(s), has ${snapshot.dependencyCount} internal dependency link(s), and ${snapshot.dependentCount} dependent link(s).${packagePart}${unresolvedPart}`;
}

function summarizeProject(
  projectName: string,
  modules: ModuleGenerationSnapshot[],
  latestSession: GenerationLatestSessionSnapshot | null,
  techStack: TechStackSummary
): string {
  const topModules = modules.slice(0, 3).map((module) => module.moduleBoundary);
  const latestPart = latestSession
    ? ` The latest session touched ${latestSession.touchedPaths.length} file(s) across ${latestSession.touchedModules.length} module(s).`
    : "";
  const frameworkPart = techStack.frameworks.length > 0 ? ` Core frameworks: ${techStack.frameworks.join(", ")}.` : "";
  return `${projectName} is organized into ${modules.length} module boundary group(s). Largest modules include ${topModules.join(", ") || "none"}.${
    frameworkPart
  }${latestPart}`;
}

function summarizeConventions(
  rules: ArchitectureRule[],
  techStack: TechStackSummary,
  modules: ModuleGenerationSnapshot[]
): string {
  const dominantLanguage = techStack.languages[0] ?? "unknown";
  const rulePart =
    rules.length > 0 ? ` There are ${rules.length} explicit user-defined architecture rule(s).` : " There are no explicit user-defined architecture rules yet.";
  const modulePattern =
    modules.length > 0 ? ` Modules are organized around boundaries such as ${modules.slice(0, 3).map((module) => module.moduleBoundary).join(", ")}.` : "";
  return `The project primarily uses ${dominantLanguage}.${rulePart}${modulePattern}`;
}

export function buildGenerationSnapshot(
  store: IGraphStore,
  options: {
    projectName: string;
    projectRoot: string;
    rules: ArchitectureRule[];
  }
): GenerationSnapshot {
  const nodes = store.getNodes().filter((node) => node.type === "file");
  const latestSessionRecord = store.getSessions(1).at(0) ?? null;
  const latestSession: GenerationLatestSessionSnapshot | null = latestSessionRecord
    ? {
        id: latestSessionRecord.id,
        source: latestSessionRecord.source,
        startedAt: latestSessionRecord.startedAt,
        endedAt: latestSessionRecord.endedAt,
        touchedPaths: [...latestSessionRecord.touchedPaths],
        touchedModules: [...latestSessionRecord.touchedModules]
      }
    : null;

  const moduleBoundaries = uniqueSorted(
    nodes.map((node) => node.metadata.moduleBoundary).filter((value): value is string => Boolean(value))
  );

  const modules = moduleBoundaries
    .map((moduleBoundary) => {
      const fileNodes = nodes
        .filter((node) => node.metadata.moduleBoundary === moduleBoundary)
        .sort((left, right) => left.path.localeCompare(right.path));

      const filePaths = fileNodes.map((node) => node.path);
      const dependencyPaths = uniqueSorted(
        fileNodes.flatMap((node) =>
          store
            .getOutgoingEdges(node.id)
            .map((edge) => store.getNode(edge.target)?.path)
            .filter((value): value is string => Boolean(value))
        )
      );
      const dependentPaths = uniqueSorted(
        fileNodes.flatMap((node) =>
          store
            .getIncomingEdges(node.id)
            .map((edge) => store.getNode(edge.source)?.path)
            .filter((value): value is string => Boolean(value))
        )
      );
      const externalDependencies = uniqueSorted(
        fileNodes.flatMap((node) => node.metadata.externalDependencies ?? [])
      );
      const unresolvedImports = uniqueSorted(
        fileNodes.flatMap((node) => node.metadata.unresolvedImports ?? [])
      );
      const files: ModuleFileSnapshot[] = fileNodes.map((node) => ({
        path: node.path,
        incomingCount: store.getIncomingEdges(node.id).length,
        outgoingCount: store.getOutgoingEdges(node.id).length,
        touchedByLatestSession: Boolean(latestSession?.touchedPaths.includes(node.path))
      }));

      const moduleSnapshot: Omit<ModuleGenerationSnapshot, "structuralSummary"> = {
        moduleBoundary,
        filePaths,
        files,
        dependencyPaths,
        dependentPaths,
        dependencyCount: dependencyPaths.length,
        dependentCount: dependentPaths.length,
        externalDependencies,
        unresolvedImports,
        relatedSessions: buildRelatedSessionSummariesForPath(store, moduleBoundary, DEFAULT_RELATED_SESSIONS_LIMIT)
      };

      return {
        ...moduleSnapshot,
        structuralSummary: summarizeModule(moduleSnapshot)
      };
    })
    .sort((left, right) => {
      if (left.filePaths.length !== right.filePaths.length) {
        return right.filePaths.length - left.filePaths.length;
      }

      return left.moduleBoundary.localeCompare(right.moduleBoundary);
    });

  const dependencyHotspots = nodes
    .map((node) => ({
      path: node.path,
      moduleBoundary: node.metadata.moduleBoundary,
      incomingCount: store.getIncomingEdges(node.id).length,
      outgoingCount: store.getOutgoingEdges(node.id).length
    }))
    .sort((left, right) => {
      const leftDegree = left.incomingCount + left.outgoingCount;
      const rightDegree = right.incomingCount + right.outgoingCount;
      if (leftDegree !== rightDegree) {
        return rightDegree - leftDegree;
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, 8);

  const techStack = store.getState().techStack;

  return {
    projectName: options.projectName,
    projectRoot: options.projectRoot,
    techStack,
    rules: options.rules.map((rule) => ({
      ...rule,
      check: rule.check ? { ...rule.check } : undefined
    })),
    latestSession,
    moduleBoundaries: modules.map((module) => module.moduleBoundary),
    modules,
    dependencyHotspots,
    structuralProjectSummary: summarizeProject(options.projectName, modules, latestSession, techStack),
    structuralConventionsSummary: summarizeConventions(options.rules, techStack, modules)
  };
}
