import {
  DEFAULT_AGENT_STDOUT_PREVIEW_LINES,
  DEFAULT_RELATED_SESSIONS_LIMIT,
  DEFAULT_SESSION_LIST_LIMIT
} from "../constants.js";
import type {
  ActivitySession,
  DashboardOverviewResponse,
  IGraphStore,
  ProjectNode,
  SessionDetailResponse,
  SessionFileImpactResponse,
  SessionModuleImpactResponse,
  SessionSummaryResponse
} from "../types.js";

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function getLatestSession(store: IGraphStore): ActivitySession | null {
  return store.getSessions(1).at(0) ?? null;
}

function getNodeByPath(store: IGraphStore, relativePath: string): ProjectNode | null {
  return store.getNodes().find((node) => node.type === "file" && node.path === relativePath) ?? null;
}

function getDependencyCount(store: IGraphStore, relativePath: string): number {
  const node = getNodeByPath(store, relativePath);
  return node ? store.getOutgoingEdges(node.id).length : 0;
}

function getDependentCount(store: IGraphStore, relativePath: string): number {
  const node = getNodeByPath(store, relativePath);
  return node ? store.getIncomingEdges(node.id).length : 0;
}

function toSessionSummary(session: ActivitySession): SessionSummaryResponse {
  return {
    id: session.id,
    source: session.source,
    actor: session.actor,
    confidence: session.confidence,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    touchedPathsCount: session.touchedPaths.length,
    touchedModulesCount: session.touchedModules.length
  };
}

function toFileImpact(
  store: IGraphStore,
  relativePath: string,
  touchedPaths: Set<string>,
  impactedPaths: Set<string>
): SessionFileImpactResponse {
  const node = getNodeByPath(store, relativePath);

  return {
    path: relativePath,
    language: node?.language ?? "unknown",
    summary: node?.summary ?? "",
    summarySource: node?.summarySource ?? "heuristic",
    moduleBoundary: node?.metadata.moduleBoundary,
    dependencyCount: node ? store.getOutgoingEdges(node.id).length : 0,
    dependentCount: node ? store.getIncomingEdges(node.id).length : 0,
    externalDependencies: node?.metadata.externalDependencies ?? [],
    touched: touchedPaths.has(relativePath),
    impacted: impactedPaths.has(relativePath)
  };
}

function buildTouchedModules(
  store: IGraphStore,
  session: ActivitySession,
  touchedPaths: Set<string>,
  impactedPaths: Set<string>
): SessionModuleImpactResponse[] {
  return session.touchedModules
    .map((moduleBoundary) => {
      const files = store
        .getNodes()
        .filter((node) => node.type === "file" && node.metadata.moduleBoundary === moduleBoundary)
        .map((node) => node.path);

      return {
        moduleBoundary,
        touchedFileCount: files.filter((filePath) => touchedPaths.has(filePath)).length,
        impactedFileCount: files.filter((filePath) => impactedPaths.has(filePath)).length,
        filePaths: files.sort((left, right) => left.localeCompare(right))
      };
    })
    .sort((left, right) => left.moduleBoundary.localeCompare(right.moduleBoundary));
}

function buildReviewOrder(store: IGraphStore, session: ActivitySession): string[] {
  const touchedPaths = new Set(session.touchedPaths);
  const impactedPaths = new Set(session.impactedDependents ?? []);
  const candidates = uniqueSorted([...touchedPaths, ...impactedPaths]);

  const touched = candidates.filter((candidate) => touchedPaths.has(candidate));
  const impactedOnly = candidates.filter((candidate) => !touchedPaths.has(candidate));

  const sorter = (left: string, right: string): number => {
    const incomingDelta = getDependentCount(store, right) - getDependentCount(store, left);
    if (incomingDelta !== 0) {
      return incomingDelta;
    }

    const outgoingDelta = getDependencyCount(store, right) - getDependencyCount(store, left);
    if (outgoingDelta !== 0) {
      return outgoingDelta;
    }

    return left.localeCompare(right);
  };

  return [...touched.sort(sorter), ...impactedOnly.sort(sorter)];
}

function buildStdoutPreview(stdout: string | undefined): string | undefined {
  if (!stdout) {
    return undefined;
  }

  const lines = stdout.split(/\r?\n/u);
  return lines.slice(-DEFAULT_AGENT_STDOUT_PREVIEW_LINES).join("\n").trim() || undefined;
}

export function buildSessionDetail(store: IGraphStore, sessionId: string): SessionDetailResponse | null {
  const session = store.getSession(sessionId);
  if (!session) {
    return null;
  }

  const touchedPaths = new Set(session.touchedPaths);
  const impactedPaths = new Set(session.impactedDependents ?? []);

  return {
    session,
    touchedFiles: session.touchedPaths.map((sessionPath) => toFileImpact(store, sessionPath, touchedPaths, impactedPaths)),
    impactedFiles: uniqueSorted(session.impactedDependents ?? []).map((sessionPath) =>
      toFileImpact(store, sessionPath, touchedPaths, impactedPaths)
    ),
    touchedModules: buildTouchedModules(store, session, touchedPaths, impactedPaths),
    reviewOrder: buildReviewOrder(store, session),
    agentStdoutPreview: buildStdoutPreview(session.agentStdout)
  };
}

export function buildLatestSessionDetail(store: IGraphStore): SessionDetailResponse | null {
  const latest = getLatestSession(store);
  return latest ? buildSessionDetail(store, latest.id) : null;
}

export function buildSessionSummaries(store: IGraphStore, limit = DEFAULT_SESSION_LIST_LIMIT): SessionSummaryResponse[] {
  return store.getSessions(limit).map(toSessionSummary);
}

export function buildRelatedSessionSummariesForPath(
  store: IGraphStore,
  relativePath: string,
  limit = DEFAULT_RELATED_SESSIONS_LIMIT
): SessionSummaryResponse[] {
  const normalizedPath = relativePath.replace(/\\/gu, "/").replace(/\/$/u, "") || ".";
  const prefix = normalizedPath === "." ? "" : `${normalizedPath}/`;

  return store
    .getSessions()
    .filter((session) => session.touchedPaths.some((sessionPath) => sessionPath === normalizedPath || sessionPath.startsWith(prefix)))
    .slice(0, limit)
    .map(toSessionSummary);
}

export function buildDashboardOverview(
  store: IGraphStore,
  options: {
    projectName: string;
    projectRoot: string;
    watcherRunning: boolean;
    activeExplicitSessionId?: string;
  }
): DashboardOverviewResponse {
  const state = store.getState();
  const generatedContext = store.getGeneratedContext();
  return {
    projectName: options.projectName,
    projectRoot: options.projectRoot,
    watcherRunning: options.watcherRunning,
    activeExplicitSessionId: options.activeExplicitSessionId,
    counts: {
      nodes: state.nodes.length,
      edges: state.edges.length,
      sessions: state.sessions.length,
      changeSets: state.changeSets.length
    },
    techStack: state.techStack,
    lastScanSummary: state.metadata.lastScanSummary,
    lastIncrementalUpdateMs: state.metadata.lastIncrementalUpdateMs,
    projectSummary: generatedContext.projectSummary?.text,
    projectSummarySource: generatedContext.projectSummary?.source,
    lastGeneratedAt: generatedContext.lastGeneratedAt,
    latestSession: buildLatestSessionDetail(store)
  };
}
