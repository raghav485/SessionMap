import crypto from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";

import { loadConfig } from "../config.js";
import {
  DEFAULT_CONTROL_HOST,
  DEFAULT_SESSION_LIST_LIMIT,
  DEFAULT_MCP_HOST,
  DEFAULT_WEB_HOST,
  SCHEMA_VERSION,
  TECH_STACK_TRIGGER_FILES,
  TECH_STACK_TRIGGER_SUFFIXES
} from "../constants.js";
import { createLogger } from "../logger.js";
import type {
  ActivitySession,
  ChangeSet,
  ChangeSetImpact,
  DaemonManifest,
  DaemonStatusResponse,
  ExplicitSessionEndRequest,
  ExplicitSessionStartRequest,
  ExplainResponse,
  FileScanEntry,
  GenerateSummary,
  GeneratedContextResponse,
  ScanSummary
} from "../types.js";
import { analyzeFile, analyzeProject, createAnalysisContext, type AnalysisContext } from "../engine/analyzer.js";
import { detectTechStack } from "../engine/tech-stack-detector.js";
import { buildDirectoryNode, buildEdgesForFile, buildFileNode, collectAncestorDirectories } from "../graph/graph-builder.js";
import { buildDirectoryExplanation, buildFileExplanation } from "../graph/graph-query.js";
import { JsonGraphStore } from "../graph/json-store.js";
import { createDirectoryNodeId, createFileNodeId } from "../graph/knowledge-graph.js";
import { ChangeTracker } from "../session/change-tracker.js";
import { SessionInferrer } from "../session/inferrer.js";
import { SessionTracker } from "../session/session-tracker.js";
import { startControlServer, type ControlService } from "./control-server.js";
import { ensureSessionMapDirs, removeManifest, writeManifest } from "./manifest.js";
import { RuntimeEventBus } from "./runtime-events.js";
import { FileWatcher } from "../watcher/file-watcher.js";
import { startMcpHttpServer } from "../mcp/http-server.js";
import { createLocalMcpService } from "../mcp/service.js";
import { startWebServer } from "../web/server.js";
import { GeneratorService } from "../generator/service.js";

const logger = createLogger("daemon-main");

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/");
}

function unique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort();
}

function isTechStackTrigger(relativePath: string): boolean {
  const fileName = path.basename(relativePath);
  return TECH_STACK_TRIGGER_FILES.has(fileName) || TECH_STACK_TRIGGER_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

class SessionMapDaemonRuntime {
  private readonly projectRoot: string;
  private readonly configPath: string;
  private readonly runtimePaths: ReturnType<typeof ensureSessionMapDirs>;
  private readonly store: JsonGraphStore;
  private readonly analysisContext: AnalysisContext;
  private readonly projectName: string;
  private readonly watcher: FileWatcher;
  private readonly changeTracker: ChangeTracker;
  private readonly sessionTracker: SessionTracker;
  private readonly eventBus = new RuntimeEventBus();
  private readonly generatorService: GeneratorService;
  private readonly manifest: DaemonManifest;
  private serverClosed = false;
  private stopServer: (() => Promise<void>) | null = null;
  private stopMcpServer: (() => Promise<void>) | null = null;
  private webApp: FastifyInstance | null = null;
  private pendingChangeProcessing: Promise<void> = Promise.resolve();

  constructor(
    projectRoot: string,
    configPath: string
  ) {
    this.projectRoot = projectRoot;
    this.configPath = configPath;
    this.runtimePaths = ensureSessionMapDirs(this.projectRoot);
    this.store = new JsonGraphStore(this.runtimePaths.statePath);

    const { config } = loadConfig(this.projectRoot);
    this.projectName = config.projectName;
    this.analysisContext = createAnalysisContext(this.projectRoot, config);
    this.watcher = new FileWatcher(this.projectRoot, config);
    this.changeTracker = new ChangeTracker({
      projectRoot: this.projectRoot,
      debounceMs: config.session.debounceMs,
      resolveLanguage: (relativePath) => {
        const existingNode = this.store.getNode(createFileNodeId(relativePath));
        return existingNode?.language;
      }
    });
    this.sessionTracker = new SessionTracker(
      this.store,
      new SessionInferrer(this.store, config.session.inactivityGapMs),
      config.session.captureStdout,
      config.session.inactivityGapMs
    );
    this.generatorService = new GeneratorService({
      store: this.store,
      projectName: this.projectName,
      projectRoot: this.projectRoot,
      rules: this.analysisContext.config.rules,
      llm: this.analysisContext.config.llm
    });

    this.manifest = {
      schemaVersion: SCHEMA_VERSION,
      projectRoot: this.projectRoot,
      pid: process.pid,
      controlUrl: "",
      authToken: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      statePath: this.runtimePaths.statePath,
      logPath: this.runtimePaths.logPath
    };

    this.watcher.on("event", (event) => {
      this.changeTracker.push(event);
    });

    this.changeTracker.on("changeset", (changeSet) => {
      this.pendingChangeProcessing = this.pendingChangeProcessing
        .then(async () => {
          await this.handleChangeSet(changeSet);
        })
        .catch((error) => {
          logger.error("Failed to process change set", {
            message: error instanceof Error ? error.message : String(error),
            changeSetId: changeSet.id
          });
        });
    });
  }

  async initialize(): Promise<void> {
    const loaded = this.store.load();
    if (!loaded) {
      await this.fullScan();
    }
  }

  async start(): Promise<void> {
    const localMcpService = createLocalMcpService({
      store: this.store,
      projectName: this.projectName,
      projectRoot: this.projectRoot,
      rules: this.analysisContext.config.rules,
      getWatcherRunning: () => this.watcher.isRunning(),
      getTrackingMode: () => this.sessionTracker.getTrackingMode(),
      getActiveSessionId: () => this.sessionTracker.getActiveSessionId(),
      startExplicitSession: async (request) => this.startExplicitSession(request),
      endExplicitSession: async (sessionId, request) => this.endExplicitSession(sessionId, request)
    });

    const service: ControlService = {
      getStatus: async () => this.getStatus(),
      getOverview: async () => localMcpService.getProjectOverview(),
      scan: async () => this.fullScan(),
      explain: async (targetPath) => this.explain(targetPath),
      getExplorer: async (targetPath) => localMcpService.getModuleContext(targetPath),
      searchProject: async (query, limit) => localMcpService.searchProject(query, limit),
      getDependencies: async (targetPath, direction) => localMcpService.getDependencies(targetPath, direction),
      getRules: async () => localMcpService.getRules(),
      listSessions: async (limit) => this.sessionTracker.getSessions(limit ?? DEFAULT_SESSION_LIST_LIMIT),
      getLatestSessionDetail: async () => localMcpService.getLatestSession(),
      getSession: async (id) => this.sessionTracker.getSession(id),
      getSessionDetail: async (id) => localMcpService.getSession(id),
      startExplicitSession: async (request) => this.startExplicitSession(request),
      endExplicitSession: async (sessionId, request) => this.endExplicitSession(sessionId, request),
      generate: async () => this.generate(),
      getGeneratedContext: async () => this.getGeneratedContext(),
      shutdown: async () => this.shutdown()
    };

    const startedServer = await startControlServer({
      host: this.analysisContext.config.ports.controlHost || DEFAULT_CONTROL_HOST,
      port: this.analysisContext.config.ports.controlPort,
      authToken: this.manifest.authToken,
      service
    });

    this.stopServer = async () => {
      await new Promise<void>((resolve, reject) => {
        startedServer.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    };

    this.manifest.controlUrl = startedServer.controlUrl;
    const startedWeb = await startWebServer({
      store: this.store,
      projectName: this.projectName,
      projectRoot: this.projectRoot,
      getWatcherRunning: () => this.watcher.isRunning(),
      getTrackingMode: () => this.sessionTracker.getTrackingMode(),
      getActiveSessionId: () => this.sessionTracker.getActiveSessionId(),
      eventBus: this.eventBus,
      port: this.analysisContext.config.ports.webPort,
      host: DEFAULT_WEB_HOST
    });
    this.webApp = startedWeb.app;
    this.manifest.webUrl = startedWeb.webUrl;
    const startedMcp = await startMcpHttpServer({
      service: localMcpService,
      authToken: this.manifest.authToken,
      host: DEFAULT_MCP_HOST,
      port: this.analysisContext.config.ports.mcpPort
    });
    this.manifest.mcpHttpUrl = startedMcp.mcpHttpUrl;
    this.stopMcpServer = async () => {
      await new Promise<void>((resolve, reject) => {
        startedMcp.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    };
    this.sessionTracker.armAutoTracking();
    await this.watcher.start();
    writeManifest(this.projectRoot, this.manifest);
    logger.info("Daemon started", {
      projectRoot: this.projectRoot,
      controlUrl: this.manifest.controlUrl,
      webUrl: this.manifest.webUrl,
      mcpHttpUrl: this.manifest.mcpHttpUrl
    });
  }

  getStatus(): DaemonStatusResponse {
    const state = this.store.getState();
    return {
      status: "running",
      projectRoot: this.projectRoot,
      schemaVersion: SCHEMA_VERSION,
      configPath: this.configPath,
      statePath: this.runtimePaths.statePath,
      runtimePath: this.runtimePaths.runtimeDir,
      controlUrl: this.manifest.controlUrl,
      webUrl: this.manifest.webUrl,
      mcpHttpUrl: this.manifest.mcpHttpUrl,
      pid: process.pid,
      startedAt: this.manifest.startedAt,
      nodeCount: state.nodes.length,
      edgeCount: state.edges.length,
      sessionCount: state.sessions.length,
      changeSetCount: state.changeSets.length,
      watcherRunning: this.watcher.isRunning(),
      trackingMode: this.sessionTracker.getTrackingMode(),
      activeSessionId: this.sessionTracker.getActiveSessionId() ?? undefined,
      lastScanSummary: state.metadata.lastScanSummary,
      lastIncrementalUpdateMs: state.metadata.lastIncrementalUpdateMs,
      lastGeneratedAt: state.generatedContext.lastGeneratedAt,
      generatedArtifactCount: state.generatedContext.generatedFiles.length,
      llmEnabled: this.analysisContext.config.llm.enabled,
      llmProvider: this.analysisContext.config.llm.provider ?? undefined
    };
  }

  async fullScan(): Promise<ScanSummary> {
    const result = await analyzeProject(this.analysisContext);
    const existingState = this.store.getState();
    if (existingState) {
      result.state.sessions = existingState.sessions;
      result.state.changeSets = existingState.changeSets;
      result.state.generatedContext = existingState.generatedContext;
      if (existingState.metadata.lastIncrementalUpdateMs !== undefined) {
        result.state.metadata.lastIncrementalUpdateMs = existingState.metadata.lastIncrementalUpdateMs;
      }
      if (existingState.metadata.lastGenerateSummary !== undefined) {
        result.state.metadata.lastGenerateSummary = existingState.metadata.lastGenerateSummary;
      }
    }
    this.store.replace(result.state);
    this.eventBus.publish({
      type: "state-updated",
      reason: "scan-completed",
      latestSessionId: this.store.getSessions(1).at(0)?.id
    });
    return result.summary;
  }

  async explain(targetPath: string): Promise<ExplainResponse> {
    const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.resolve(this.projectRoot, targetPath);
    const relativePath = normalizeRelativePath(path.relative(this.projectRoot, absolutePath)) || ".";
    const fileExplanation = buildFileExplanation(this.store, relativePath);
    if (fileExplanation) {
      return fileExplanation;
    }

    return buildDirectoryExplanation(this.store, relativePath);
  }

  async generate(): Promise<GenerateSummary> {
    await this.changeTracker.flush();
    await this.pendingChangeProcessing;
    const result = await this.generatorService.generate();
    this.eventBus.publish({
      type: "state-updated",
      reason: "generation-completed",
      affectedPaths: result.affectedModuleBoundaries,
      latestSessionId: this.store.getSessions(1).at(0)?.id,
      lastIncrementalUpdateMs: this.store.getState().metadata.lastIncrementalUpdateMs
    });
    return result.summary;
  }

  async getGeneratedContext(): Promise<GeneratedContextResponse> {
    return this.generatorService.getGeneratedContext();
  }

  async startExplicitSession(request: ExplicitSessionStartRequest) {
    await this.changeTracker.flush();
    await this.pendingChangeProcessing;
    const response = this.sessionTracker.startExplicitSession(request);
    this.eventBus.publish({
      type: "state-updated",
      reason: "explicit-session-started",
      latestSessionId: response.sessionId
    });
    return response;
  }

  async endExplicitSession(sessionId: string, request: ExplicitSessionEndRequest): Promise<ActivitySession> {
    await this.changeTracker.flush();
    await this.pendingChangeProcessing;
    const session = this.sessionTracker.endExplicitSession(sessionId, request);
    this.eventBus.publish({
      type: "state-updated",
      reason: "explicit-session-ended",
      latestSessionId: session.id
    });
    return session;
  }

  async shutdown(): Promise<void> {
    if (this.serverClosed) {
      return;
    }

    this.serverClosed = true;
    await this.watcher.stop();
    await this.changeTracker.flush();
    await this.pendingChangeProcessing;
    this.sessionTracker.disarmAutoTracking();
    this.store.persist();
    if (this.webApp) {
      await this.webApp.close();
      this.webApp = null;
    }
    if (this.stopMcpServer) {
      await this.stopMcpServer();
      this.stopMcpServer = null;
    }
    if (this.stopServer) {
      await this.stopServer();
    }
    removeManifest(this.projectRoot);
  }

  private async handleChangeSet(changeSet: ChangeSet): Promise<void> {
    const impact = await this.applyChangeSet(changeSet);
    const session = this.sessionTracker.recordChangeSet(changeSet, impact);
    this.store.updateMetadata({ lastIncrementalUpdateMs: impact.durationMs });
    this.store.persist();
    this.eventBus.publish({
      type: "state-updated",
      reason: "changes-applied",
      affectedPaths: impact.touchedPaths,
      latestSessionId: session.id,
      lastIncrementalUpdateMs: impact.durationMs
    });
  }

  private async applyChangeSet(changeSet: ChangeSet): Promise<ChangeSetImpact> {
    const startedAt = Date.now();
    const touchedPaths = new Set<string>();
    const touchedModules = new Set<string>();
    const impactedDependentPaths = new Set<string>();
    const impactedDependentModules = new Set<string>();
    const affectedDirectories = new Set<string>();
    const reanalyzeQueue = new Set<string>();
    let refreshTechStack = false;
    let reanalyzeAllFiles = false;

    const recordTouchedPath = (relativePath: string): void => {
      touchedPaths.add(relativePath);
      for (const directoryPath of collectAncestorDirectories(relativePath)) {
        affectedDirectories.add(directoryPath);
      }
    };

    const recordTouchedModule = (moduleBoundary?: string): void => {
      if (moduleBoundary) {
        touchedModules.add(moduleBoundary);
      }
    };

    const reanalyzePath = async (relativePath: string, impacted = false): Promise<void> => {
      const analyzed = await analyzeFile(this.analysisContext, relativePath);
      if (!analyzed) {
        return;
      }

      this.store.upsertNode(buildFileNode(analyzed, this.store.getState().techStack));
      this.store.replaceOutgoingEdges(createFileNodeId(relativePath), buildEdgesForFile(analyzed));
      for (const directoryPath of collectAncestorDirectories(relativePath)) {
        affectedDirectories.add(directoryPath);
      }

      if (impacted) {
        impactedDependentPaths.add(relativePath);
        impactedDependentModules.add(analyzed.moduleBoundary);
      }
    };

    const queueResolvedImporters = (resolvedPath: string): void => {
      for (const node of this.store.getNodes()) {
        if (node.type !== "file" || node.path === resolvedPath) {
          continue;
        }

        for (const specifier of node.metadata.unresolvedImports ?? []) {
          const resolution = this.analysisContext.dependencyResolver.resolve(specifier, node.path, {
            language: node.language
          });
          if (resolution.resolvedPath === resolvedPath) {
            reanalyzeQueue.add(node.path);
            break;
          }
        }
      }
    };

    const handleUnlink = async (relativePath: string): Promise<void> => {
      const nodeId = createFileNodeId(relativePath);
      const existing = this.store.getNode(nodeId);
      if (existing) {
        recordTouchedModule(existing.metadata.moduleBoundary);
      }
      recordTouchedPath(relativePath);

      const dependents = this.store
        .getIncomingEdges(nodeId)
        .map((edge) => this.store.getNode(edge.source)?.path)
        .filter((value): value is string => Boolean(value));
      for (const dependentPath of dependents) {
        impactedDependentPaths.add(dependentPath);
        const dependentNode = this.store.getNode(createFileNodeId(dependentPath));
        if (dependentNode?.metadata.moduleBoundary) {
          impactedDependentModules.add(dependentNode.metadata.moduleBoundary);
        }
        reanalyzeQueue.add(dependentPath);
      }

      this.store.removeNode(nodeId);

      if (this.analysisContext.dependencyResolver.shouldReloadForPath(relativePath)) {
        this.analysisContext.dependencyResolver.reload();
        reanalyzeAllFiles = true;
      }
      if (isTechStackTrigger(relativePath)) {
        refreshTechStack = true;
      }
    };

    const handleAddOrChange = async (relativePath: string, added = false): Promise<void> => {
      const analyzed = await analyzeFile(this.analysisContext, relativePath);
      if (!analyzed) {
        return;
      }

      recordTouchedPath(relativePath);
      recordTouchedModule(analyzed.moduleBoundary);
      this.store.upsertNode(buildFileNode(analyzed, this.store.getState().techStack));
      this.store.replaceOutgoingEdges(createFileNodeId(relativePath), buildEdgesForFile(analyzed));

      if (this.analysisContext.dependencyResolver.shouldReloadForPath(relativePath)) {
        this.analysisContext.dependencyResolver.reload();
        reanalyzeAllFiles = true;
      }

      if (isTechStackTrigger(relativePath)) {
        refreshTechStack = true;
      }

      if (added) {
        queueResolvedImporters(relativePath);
      }
    };

    for (const event of changeSet.events) {
      if (event.op === "rename") {
        if (event.previousPath) {
          await handleUnlink(event.previousPath);
        }
        await handleAddOrChange(event.path, true);
        recordTouchedPath(event.path);
        continue;
      }

      if (event.op === "unlink") {
        await handleUnlink(event.path);
        continue;
      }

      await handleAddOrChange(event.path, event.op === "add");
    }

    if (reanalyzeAllFiles) {
      for (const node of this.store.getNodes()) {
        if (node.type === "file") {
          reanalyzeQueue.add(node.path);
        }
      }
    }

    for (const relativePath of reanalyzeQueue) {
      if (!touchedPaths.has(relativePath)) {
        await reanalyzePath(relativePath, true);
      }
    }

    if (refreshTechStack) {
      this.store.setTechStack(this.recomputeTechStack());
      for (const node of this.store.getNodes()) {
        const updatedNode = {
          ...node,
          metadata: {
            ...node.metadata,
            techStack: this.store.getState().techStack.frameworks
          }
        };
        this.store.upsertNode(updatedNode);
      }
    }

    for (const directoryPath of affectedDirectories) {
      const hasChildren = this.store
        .getNodes()
        .some((node) => node.type === "file" && node.path.startsWith(`${directoryPath}/`));
      if (hasChildren) {
        this.store.upsertNode(buildDirectoryNode(directoryPath, this.store.getState().techStack));
      } else {
        this.store.removeNode(createDirectoryNodeId(directoryPath));
      }
    }

    return {
      touchedPaths: unique([
        ...touchedPaths,
        ...changeSet.events.flatMap((event) => (event.previousPath ? [event.previousPath, event.path] : [event.path]))
      ]),
      touchedModules: unique(touchedModules),
      impactedDependents: unique(impactedDependentPaths),
      impactedDependentModules: unique(impactedDependentModules),
      durationMs: Date.now() - startedAt
    };
  }

  private recomputeTechStack() {
    const files: FileScanEntry[] = this.store
      .getNodes()
      .filter((node) => node.type === "file")
      .map((node) => ({
        absolutePath: path.join(this.projectRoot, node.path),
        relativePath: node.path,
        size: node.metadata.linesOfCode,
        lastModified: node.metadata.lastModified
      }));

    return detectTechStack(this.projectRoot, files);
  }
}

export async function runDaemon(projectRoot: string): Promise<void> {
  const normalizedProjectRoot = path.resolve(projectRoot);
  const { configPath } = loadConfig(normalizedProjectRoot);
  const runtime = new SessionMapDaemonRuntime(normalizedProjectRoot, configPath);
  await runtime.initialize();
  await runtime.start();

  const shutdown = async () => {
    await runtime.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}
