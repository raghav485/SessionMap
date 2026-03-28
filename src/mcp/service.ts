import {
  DEFAULT_RELATED_SESSIONS_LIMIT,
  DEFAULT_SEARCH_LIMIT
} from "../constants.js";
import {
  getDependencies as getRemoteDependencies,
  getExplorer as getRemoteExplorer,
  getLatestSessionDetail as getRemoteLatestSessionDetail,
  getProjectOverview as getRemoteProjectOverview,
  getRules as getRemoteRules,
  getSessionDetail as getRemoteSessionDetail,
  searchProject as searchRemoteProject,
  startExplicitSession as startRemoteExplicitSession,
  endExplicitSession as endRemoteExplicitSession
} from "../daemon/client.js";
import { buildDependencyResponse, buildExplorerResponse, buildSearchResults } from "../graph/graph-query.js";
import {
  buildDashboardOverview,
  buildLatestSessionDetail,
  buildRelatedSessionSummariesForPath,
  buildSessionDetail
} from "../session/session-query.js";
import type {
  ActivitySession,
  ArchitectureRule,
  DaemonManifest,
  DashboardOverviewResponse,
  DependencyDirection,
  DependencyResponse,
  ExplorerResponse,
  ExplicitSessionEndRequest,
  ExplicitSessionStartRequest,
  ExplicitSessionStartResponse,
  IGraphStore,
  SearchResultResponse,
  SessionDetailResponse
} from "../types.js";

export interface McpService {
  getProjectOverview(): Promise<DashboardOverviewResponse>;
  getModuleContext(targetPath: string): Promise<ExplorerResponse | null>;
  getDependencies(targetPath: string, direction?: DependencyDirection): Promise<DependencyResponse | null>;
  searchProject(query: string, limit?: number): Promise<SearchResultResponse[]>;
  getLatestSession(): Promise<SessionDetailResponse | null>;
  getSession(sessionId: string): Promise<SessionDetailResponse | null>;
  beginSession(request: ExplicitSessionStartRequest): Promise<ExplicitSessionStartResponse>;
  endSession(sessionId: string, request: ExplicitSessionEndRequest): Promise<ActivitySession>;
  getRules(): Promise<ArchitectureRule[]>;
}

export interface LocalMcpServiceOptions {
  store: IGraphStore;
  projectName: string;
  projectRoot: string;
  rules: ArchitectureRule[];
  getWatcherRunning(): boolean;
  getActiveExplicitSessionId(): string | null;
  startExplicitSession(request: ExplicitSessionStartRequest): Promise<ExplicitSessionStartResponse>;
  endExplicitSession(sessionId: string, request: ExplicitSessionEndRequest): Promise<ActivitySession>;
}

export function createLocalMcpService(options: LocalMcpServiceOptions): McpService {
  return {
    async getProjectOverview(): Promise<DashboardOverviewResponse> {
      return buildDashboardOverview(options.store, {
        projectName: options.projectName,
        projectRoot: options.projectRoot,
        watcherRunning: options.getWatcherRunning(),
        activeExplicitSessionId: options.getActiveExplicitSessionId() ?? undefined
      });
    },

    async getModuleContext(targetPath: string): Promise<ExplorerResponse | null> {
      const latestSession = options.store.getSessions(1).at(0) ?? null;
      const relatedSessions = buildRelatedSessionSummariesForPath(
        options.store,
        targetPath,
        DEFAULT_RELATED_SESSIONS_LIMIT
      );
      return buildExplorerResponse(options.store, targetPath, {
        latestSession,
        relatedSessions
      });
    },

    async getDependencies(targetPath: string, direction?: DependencyDirection): Promise<DependencyResponse | null> {
      return buildDependencyResponse(options.store, targetPath, direction);
    },

    async searchProject(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<SearchResultResponse[]> {
      return buildSearchResults(options.store, query, limit);
    },

    async getLatestSession(): Promise<SessionDetailResponse | null> {
      return buildLatestSessionDetail(options.store);
    },

    async getSession(sessionId: string): Promise<SessionDetailResponse | null> {
      return buildSessionDetail(options.store, sessionId);
    },

    async beginSession(request: ExplicitSessionStartRequest): Promise<ExplicitSessionStartResponse> {
      return options.startExplicitSession({
        ...request,
        source: request.source ?? "explicit-mcp"
      });
    },

    async endSession(sessionId: string, request: ExplicitSessionEndRequest): Promise<ActivitySession> {
      return options.endExplicitSession(sessionId, request);
    },

    async getRules(): Promise<ArchitectureRule[]> {
      return options.rules.map((rule) => ({
        ...rule,
        check: rule.check ? { ...rule.check } : undefined
      }));
    }
  };
}

export function createRemoteMcpService(manifest: DaemonManifest): McpService {
  return {
    async getProjectOverview(): Promise<DashboardOverviewResponse> {
      return getRemoteProjectOverview(manifest);
    },

    async getModuleContext(targetPath: string): Promise<ExplorerResponse | null> {
      return getRemoteExplorer(manifest, targetPath);
    },

    async getDependencies(targetPath: string, direction?: DependencyDirection): Promise<DependencyResponse | null> {
      return getRemoteDependencies(manifest, targetPath, direction);
    },

    async searchProject(query: string, limit = DEFAULT_SEARCH_LIMIT): Promise<SearchResultResponse[]> {
      return searchRemoteProject(manifest, query, limit);
    },

    async getLatestSession(): Promise<SessionDetailResponse | null> {
      return getRemoteLatestSessionDetail(manifest);
    },

    async getSession(sessionId: string): Promise<SessionDetailResponse | null> {
      return getRemoteSessionDetail(manifest, sessionId);
    },

    async beginSession(request: ExplicitSessionStartRequest): Promise<ExplicitSessionStartResponse> {
      return startRemoteExplicitSession(manifest, {
        ...request,
        source: request.source ?? "explicit-mcp",
        agentCommand: request.agentCommand
      });
    },

    async endSession(sessionId: string, request: ExplicitSessionEndRequest): Promise<ActivitySession> {
      return endRemoteExplicitSession(manifest, sessionId, request);
    },

    async getRules(): Promise<ArchitectureRule[]> {
      return getRemoteRules(manifest);
    }
  };
}
