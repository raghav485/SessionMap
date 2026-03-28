import path from "node:path";

import {
  DEFAULT_DEPENDENCY_DIRECTION,
  DEFAULT_GRAPH_LATEST_SESSION_LIMIT,
  DEFAULT_GRAPH_PROJECT_LIMIT,
  DEFAULT_RELATED_SESSIONS_LIMIT,
  DEFAULT_SEARCH_LIMIT
} from "../constants.js";
import type {
  ActivitySession,
  DependencyDirection,
  DependencyResponse,
  DirectoryExplainResponse,
  ExplorerResponse,
  ExplorerResponseDirectory,
  ExplorerResponseFile,
  FileExplainResponse,
  GraphEdgeResponse,
  GraphNodeResponse,
  GraphResponse,
  IGraphStore,
  ProjectEdge,
  ProjectNode,
  SearchResultResponse,
  SessionSummaryResponse
} from "../types.js";
import { createFileNodeId } from "./knowledge-graph.js";

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/").replace(/\/$/u, "") || ".";
}

function sortPaths(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function getDependencyCount(store: IGraphStore, nodeId: string): number {
  return store.getOutgoingEdges(nodeId).length;
}

function getDependentCount(store: IGraphStore, nodeId: string): number {
  return store.getIncomingEdges(nodeId).length;
}

function getDegree(store: IGraphStore, nodeId: string): number {
  return getDependencyCount(store, nodeId) + getDependentCount(store, nodeId);
}

function getFileNode(store: IGraphStore, relativePath: string): ProjectNode | null {
  return store.getNode(createFileNodeId(normalizeRelativePath(relativePath)));
}

function toGraphNodeResponse(
  store: IGraphStore,
  node: ProjectNode,
  touchedPaths: Set<string>,
  impactedPaths: Set<string>
): GraphNodeResponse {
  return {
    id: node.id,
    path: node.path,
    label: path.basename(node.path) || node.path,
    type: node.type,
    language: node.language,
    moduleBoundary: node.metadata.moduleBoundary,
    tier: node.tier,
    touched: touchedPaths.has(node.path),
    impacted: impactedPaths.has(node.path),
    degree: getDegree(store, node.id)
  };
}

function toGraphEdgeResponse(edge: ProjectEdge): GraphEdgeResponse {
  return {
    source: edge.source,
    target: edge.target,
    type: edge.type,
    weight: edge.weight
  };
}

function rankSearchResult(node: ProjectNode, normalizedQuery: string): number {
  if (node.path.toLowerCase() === normalizedQuery) {
    return 0;
  }

  if (node.name.toLowerCase().includes(normalizedQuery) || node.path.toLowerCase().includes(normalizedQuery)) {
    return 1;
  }

  if (node.summary?.toLowerCase().includes(normalizedQuery)) {
    return 2;
  }

  return 3;
}

function matchesDirectory(store: IGraphStore, normalizedPath: string): boolean {
  if (normalizedPath === ".") {
    return true;
  }

  const prefix = `${normalizedPath}/`;
  return store.getNodes().some((node) => node.type === "file" && (node.path === normalizedPath || node.path.startsWith(prefix)));
}

function findDirectoryModuleBoundary(store: IGraphStore, normalizedPath: string): string | undefined {
  return (
    store
      .getNodes()
      .find((node) => node.type === "file" && node.metadata.moduleBoundary === normalizedPath)
      ?.metadata.moduleBoundary ?? undefined
  );
}

function getModuleSummary(store: IGraphStore, moduleBoundary: string | undefined) {
  if (!moduleBoundary) {
    return undefined;
  }

  return store.getGeneratedContext().moduleSummaries[moduleBoundary];
}

export function buildFileExplanation(store: IGraphStore, relativePath: string): FileExplainResponse | null {
  const normalizedPath = normalizeRelativePath(relativePath);
  const node = store.getNode(createFileNodeId(normalizedPath));
  if (!node) {
    return null;
  }

  const dependencyPaths = store
    .getOutgoingEdges(node.id)
    .map((edge) => store.getNode(edge.target)?.path)
    .filter((value): value is string => Boolean(value))
    .sort();

  const dependentPaths = store
    .getIncomingEdges(node.id)
    .map((edge) => store.getNode(edge.source)?.path)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    kind: "file",
    path: node.path,
    language: node.language,
    tier: node.tier,
    summary: node.summary ?? "",
    summarySource: node.summarySource ?? "heuristic",
    exports: node.exports,
    dependencies: dependencyPaths,
    dependents: dependentPaths,
    externalDependencies: node.metadata.externalDependencies ?? [],
    unresolvedImports: node.metadata.unresolvedImports ?? [],
    moduleBoundary: node.metadata.moduleBoundary
  };
}

export function buildDirectoryExplanation(store: IGraphStore, relativePath: string): DirectoryExplainResponse {
  const normalizedPath = normalizeRelativePath(relativePath);
  const prefix = normalizedPath === "." ? "" : `${normalizedPath}/`;
  const matchingFiles = store.getNodes().filter(
    (node) => node.type === "file" && (node.path === normalizedPath || node.path.startsWith(prefix))
  );

  const dominantLanguages = Array.from(
    matchingFiles.reduce<Map<string, number>>((counts, node) => {
      counts.set(node.language, (counts.get(node.language) ?? 0) + 1);
      return counts;
    }, new Map<string, number>())
  )
    .sort((left, right) => right[1] - left[1])
    .map(([language]) => language)
    .slice(0, 3);

  const moduleBoundary = findDirectoryModuleBoundary(store, normalizedPath);
  const moduleSummary = getModuleSummary(store, moduleBoundary);

  return {
    kind: "directory",
    path: normalizedPath,
    fileCount: matchingFiles.length,
    dominantLanguages,
    children: matchingFiles.map((node) => node.path).sort(),
    techStackHints: [...new Set(store.getState().techStack.frameworks)],
    summary: moduleSummary?.text,
    summarySource: moduleSummary?.source
  };
}

export function buildSearchResults(store: IGraphStore, query: string, limit = DEFAULT_SEARCH_LIMIT): SearchResultResponse[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return store
    .search(normalizedQuery)
    .sort((left, right) => {
      const leftRank = rankSearchResult(left, normalizedQuery);
      const rightRank = rankSearchResult(right, normalizedQuery);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return left.path.localeCompare(right.path);
    })
    .slice(0, limit)
    .map((node) => ({
      path: node.path,
      type: node.type,
      language: node.language,
      summary: node.summary,
      moduleBoundary: node.metadata.moduleBoundary
    }));
}

export function buildDependencyResponse(
  store: IGraphStore,
  relativePath: string,
  direction: DependencyDirection = DEFAULT_DEPENDENCY_DIRECTION
): DependencyResponse | null {
  const explanation = buildFileExplanation(store, relativePath);
  if (!explanation) {
    return null;
  }

  return {
    path: explanation.path,
    direction,
    moduleBoundary: explanation.moduleBoundary,
    dependencies: direction === "dependents" ? [] : explanation.dependencies,
    dependents: direction === "dependencies" ? [] : explanation.dependents,
    externalDependencies: explanation.externalDependencies,
    unresolvedImports: explanation.unresolvedImports
  };
}

export function buildExplorerResponse(
  store: IGraphStore,
  relativePath: string,
  options?: {
    latestSession?: ActivitySession | null;
    relatedSessions?: SessionSummaryResponse[];
    relatedSessionsLimit?: number;
  }
): ExplorerResponse | null {
  const normalizedPath = normalizeRelativePath(relativePath);
  const latestSession = options?.latestSession ?? null;
  const fileExplanation = buildFileExplanation(store, normalizedPath);

  if (fileExplanation) {
    const node = getFileNode(store, normalizedPath);
    const moduleFiles = node?.metadata.moduleBoundary
      ? sortPaths(
          store
            .getNodes()
            .filter((candidate) => candidate.type === "file" && candidate.metadata.moduleBoundary === node.metadata.moduleBoundary)
            .map((candidate) => candidate.path)
        )
      : [];

    const response: ExplorerResponseFile = {
      ...fileExplanation,
      kind: "file",
      moduleFiles,
      incomingCount: node ? getDependentCount(store, node.id) : 0,
      outgoingCount: node ? getDependencyCount(store, node.id) : 0,
      lastTouchedByLatestSession: Boolean(latestSession?.touchedPaths.includes(normalizedPath))
    };

    return response;
  }

  if (!matchesDirectory(store, normalizedPath)) {
    return null;
  }

  const moduleBoundary = findDirectoryModuleBoundary(store, normalizedPath);

  const response: ExplorerResponseDirectory = {
    ...buildDirectoryExplanation(store, normalizedPath),
    kind: "directory",
    moduleBoundary,
    relatedSessions: (options?.relatedSessions ?? []).slice(0, options?.relatedSessionsLimit ?? DEFAULT_RELATED_SESSIONS_LIMIT)
  };

  return response;
}

export function buildGraphResponse(
  store: IGraphStore,
  options: {
    scope: "latest-session" | "project";
    session?: ActivitySession | null;
    limitNodes?: number;
  }
): GraphResponse {
  const session = options.session ?? null;
  const touchedPaths = new Set(session?.touchedPaths ?? []);
  const impactedPaths = new Set(session?.impactedDependents ?? []);
  const defaultLimit =
    options.scope === "latest-session" ? DEFAULT_GRAPH_LATEST_SESSION_LIMIT : DEFAULT_GRAPH_PROJECT_LIMIT;
  const limit = options.limitNodes ?? defaultLimit;

  let selectedNodes: ProjectNode[] = [];
  if (options.scope === "project") {
    selectedNodes = store
      .getNodes()
      .filter((node) => node.type === "file")
      .sort((left, right) => {
        const degreeDelta = getDegree(store, right.id) - getDegree(store, left.id);
        if (degreeDelta !== 0) {
          return degreeDelta;
        }

        return left.path.localeCompare(right.path);
      })
      .slice(0, limit);
  } else if (session) {
    const touchedNodes = sortPaths(session.touchedPaths)
      .map((sessionPath) => getFileNode(store, sessionPath))
      .filter((node): node is ProjectNode => node !== null);
    const impactedNodes = sortPaths(session.impactedDependents ?? [])
      .map((sessionPath) => getFileNode(store, sessionPath))
      .filter((node): node is ProjectNode => node !== null);

    const oneHopNeighborIds = new Set<string>();
    for (const node of touchedNodes) {
      for (const edge of [...store.getIncomingEdges(node.id), ...store.getOutgoingEdges(node.id)]) {
        const neighborId = edge.source === node.id ? edge.target : edge.source;
        const neighbor = store.getNode(neighborId);
        if (neighbor?.type === "file") {
          oneHopNeighborIds.add(neighborId);
        }
      }
    }

    const prioritizedNodes = new Map<string, ProjectNode>();
    for (const node of touchedNodes) {
      prioritizedNodes.set(node.id, node);
    }

    for (const node of impactedNodes) {
      if (!prioritizedNodes.has(node.id)) {
        prioritizedNodes.set(node.id, node);
      }
    }

    const neighbors = Array.from(oneHopNeighborIds)
      .map((nodeId) => store.getNode(nodeId))
      .filter((node): node is ProjectNode => node !== null && node.type === "file")
      .filter((node) => !prioritizedNodes.has(node.id))
      .sort((left, right) => {
        const degreeDelta = getDegree(store, right.id) - getDegree(store, left.id);
        if (degreeDelta !== 0) {
          return degreeDelta;
        }

        return left.path.localeCompare(right.path);
      });

    selectedNodes = [...prioritizedNodes.values(), ...neighbors].slice(0, limit);
  }

  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const selectedEdges = store
    .getEdges()
    .filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target))
    .map(toGraphEdgeResponse);

  return {
    scope: options.scope,
    nodeCount: selectedNodes.length,
    edgeCount: selectedEdges.length,
    truncated:
      options.scope === "project"
        ? store.getNodes().filter((node) => node.type === "file").length > selectedNodes.length
        : session !== null &&
          new Set([...(session.touchedPaths ?? []), ...((session.impactedDependents ?? []) || [])]).size > 0 &&
          selectedNodes.length >= limit,
    nodes: selectedNodes.map((node) => toGraphNodeResponse(store, node, touchedPaths, impactedPaths)),
    edges: selectedEdges
  };
}
