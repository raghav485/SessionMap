import type { FastifyInstance } from "fastify";

import {
  DEFAULT_GRAPH_LATEST_SESSION_LIMIT,
  DEFAULT_GRAPH_PROJECT_LIMIT,
  DEFAULT_RELATED_SESSIONS_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SESSION_LIST_LIMIT
} from "../constants.js";
import {
  buildExplorerResponse,
  buildGraphResponse,
  buildSearchResults
} from "../graph/graph-query.js";
import {
  buildDashboardOverview,
  buildLatestSessionDetail,
  buildRelatedSessionSummariesForPath,
  buildSessionDetail,
  buildSessionSummaries
} from "../session/session-query.js";
import type { IGraphStore } from "../types.js";

export interface WebRouteOptions {
  store: IGraphStore;
  projectName: string;
  projectRoot: string;
  getWatcherRunning(): boolean;
  getActiveExplicitSessionId(): string | null;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function registerWebRoutes(app: FastifyInstance, options: WebRouteOptions): Promise<void> {
  app.get("/api/status", async () => {
    const overview = buildDashboardOverview(options.store, {
      projectName: options.projectName,
      projectRoot: options.projectRoot,
      watcherRunning: options.getWatcherRunning(),
      activeExplicitSessionId: options.getActiveExplicitSessionId() ?? undefined
    });
    return {
      projectName: overview.projectName,
      projectRoot: overview.projectRoot,
      watcherRunning: overview.watcherRunning,
      activeExplicitSessionId: overview.activeExplicitSessionId,
      counts: overview.counts,
      techStack: overview.techStack,
      lastScanSummary: overview.lastScanSummary,
      lastIncrementalUpdateMs: overview.lastIncrementalUpdateMs,
      projectSummary: overview.projectSummary,
      projectSummarySource: overview.projectSummarySource,
      lastGeneratedAt: overview.lastGeneratedAt
    };
  });

  app.get("/api/overview", async () => {
    return buildDashboardOverview(options.store, {
      projectName: options.projectName,
      projectRoot: options.projectRoot,
      watcherRunning: options.getWatcherRunning(),
      activeExplicitSessionId: options.getActiveExplicitSessionId() ?? undefined
    });
  });

  app.get("/api/sessions", async (request) => {
    const limit = parsePositiveInt((request.query as { limit?: string }).limit, DEFAULT_SESSION_LIST_LIMIT);
    return buildSessionSummaries(options.store, limit);
  });

  app.get("/api/sessions/latest", async () => {
    return buildLatestSessionDetail(options.store);
  });

  app.get("/api/sessions/:id", async (request, reply) => {
    const detail = buildSessionDetail(options.store, (request.params as { id: string }).id);
    if (!detail) {
      reply.code(404);
      return {
        error: "Session not found"
      };
    }

    return detail;
  });

  app.get("/api/graph", async (request) => {
    const query = request.query as {
      scope?: "latest-session" | "project";
      sessionId?: string;
      limitNodes?: string;
    };
    const scope = query.scope === "project" ? "project" : "latest-session";
    const defaultLimit = scope === "latest-session" ? DEFAULT_GRAPH_LATEST_SESSION_LIMIT : DEFAULT_GRAPH_PROJECT_LIMIT;
    const session =
      query.sessionId !== undefined
        ? options.store.getSession(query.sessionId)
        : (options.store.getSessions(1).at(0) ?? null);

    return buildGraphResponse(options.store, {
      scope,
      session,
      limitNodes: parsePositiveInt(query.limitNodes, defaultLimit)
    });
  });

  app.get("/api/explorer", async (request, reply) => {
    const targetPath = (request.query as { path?: string }).path;
    if (!targetPath) {
      reply.code(400);
      return {
        error: "Missing required query parameter: path"
      };
    }

    const latestSession = options.store.getSessions(1).at(0) ?? null;
    const relatedSessions = buildRelatedSessionSummariesForPath(
      options.store,
      targetPath,
      DEFAULT_RELATED_SESSIONS_LIMIT
    );
    const response = buildExplorerResponse(options.store, targetPath, {
      latestSession,
      relatedSessions
    });

    if (!response) {
      reply.code(404);
      return {
        error: "Path not found"
      };
    }

    return response;
  });

  app.get("/api/search", async (request) => {
    const query = request.query as { q?: string; limit?: string };
    return buildSearchResults(options.store, query.q ?? "", parsePositiveInt(query.limit, DEFAULT_SEARCH_LIMIT));
  });

  app.get("/api/tech-stack", async () => {
    return options.store.getState().techStack;
  });
}
