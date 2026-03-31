export type Provenance = "ast" | "heuristic" | "llm" | "user";

export type LanguageTier = 1 | 2 | 3;
export type GraphGranularity = "file" | "module";
export type GraphRelationshipSource = "import" | "package" | "entrypoint";
export type SessionSource = "auto-daemon" | "explicit-wrapper" | "explicit-mcp" | "watcher-inferred" | "git-enriched";
export type SessionActor = "agent" | "human" | "mixed" | "unknown";
export type TrackingMode = "auto" | "explicit-mcp" | "idle";
export type ChangeOperation = "add" | "change" | "unlink" | "rename";
export type ExplicitSessionSource = Extract<SessionSource, "explicit-wrapper" | "explicit-mcp">;
export type DependencyDirection = "dependencies" | "dependents" | "both";
export type LlmProvider = "openai" | "anthropic" | "google";
export type WebLiveUpdateReason =
  | "scan-completed"
  | "changes-applied"
  | "explicit-session-started"
  | "explicit-session-ended"
  | "generation-completed";

export interface ArchitectureRule {
  id: string;
  source: "user";
  description: string;
  check?: {
    type: "import-boundary";
    from: string;
    notTo: string;
  };
}

export interface SessionConfig {
  inactivityGapMs: number;
  debounceMs: number;
  captureStdout: boolean;
  maxStdoutLines: number;
}

export interface LlmConfig {
  enabled: boolean;
  provider: LlmProvider | null;
  apiKey: string | null;
  model: string | null;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface SessionMapConfig {
  projectName: string;
  ignore: string[];
  ports: {
    controlHost: string;
    controlPort: number;
    webPort: number;
    mcpPort: number;
  };
  analysis: {
    maxFileSizeBytes: number;
    maxDepth: number;
    languages: "auto" | string[];
  };
  session: SessionConfig;
  llm: LlmConfig;
  rules: ArchitectureRule[];
}

export interface LoadedConfig {
  config: SessionMapConfig;
  configPath: string;
}

export interface FileScanEntry {
  absolutePath: string;
  relativePath: string;
  size: number;
  lastModified: string;
}

export interface TechStackSummary {
  packageManagers: string[];
  frameworks: string[];
  languages: string[];
  configFiles: string[];
}

export interface ParsedImport {
  specifier: string;
  symbols: string[];
  kind: "import" | "export" | "require" | "side-effect";
  isTypeOnly: boolean;
  resolvedPath?: string;
  external: boolean;
}

export interface ParseResult {
  imports: ParsedImport[];
  exports: string[];
  declarations: string[];
  source: ExtractorSource;
  parserUsed: boolean;
}

export type ExtractorSource = "ast" | "heuristic";

export interface AnalyzedFile extends FileScanEntry {
  language: string;
  tier: LanguageTier;
  linesOfCode: number;
  imports: ParsedImport[];
  exports: string[];
  declarations: string[];
  source: ExtractorSource;
  moduleBoundary: string;
  externalDependencies: string[];
  unresolvedImports: string[];
}

export interface ProjectNode {
  id: string;
  type: "file" | "directory" | "module";
  path: string;
  language: string;
  tier: LanguageTier;
  name: string;
  summary?: string;
  summarySource?: Provenance;
  exports: string[];
  metadata: {
    linesOfCode: number;
    lastModified: string;
    techStack?: string[];
    moduleBoundary?: string;
    externalDependencies?: string[];
    unresolvedImports?: string[];
  };
}

export interface ProjectEdge {
  source: string;
  target: string;
  type: "imports" | "exports" | "extends" | "implements" | "composes";
  symbols: string[];
  weight: number;
}

export interface ScanSummary {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  filesScanned: number;
  nodes: number;
  edges: number;
  languages: Record<string, number>;
}

export interface ChangeEvent {
  id: string;
  ts: string;
  path: string;
  op: ChangeOperation;
  previousPath?: string;
  bytesChanged?: number;
  language?: string;
}

export interface ChangeSet {
  id: string;
  startedAt: string;
  endedAt: string;
  events: ChangeEvent[];
  source: SessionSource;
}

export interface ActivitySession {
  id: string;
  startedAt: string;
  endedAt: string;
  actor: SessionActor;
  source: SessionSource;
  confidence: number;
  title?: string;
  intent?: string;
  agentCommand?: string;
  agentStdout?: string;
  touchedPaths: string[];
  touchedModules: string[];
  changeSets: string[];
  relatedCommit?: string;
  impactedDependents?: string[];
}

export interface GenerateSummary {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  artifactCount: number;
  moduleCount: number;
  llmUsed: boolean;
  llmProvider?: LlmProvider;
  generatedFiles: string[];
}

export interface GeneratedSummaryRecord {
  text: string;
  source: Provenance;
  generatedAt: string;
  provider?: LlmProvider;
  model?: string;
}

export interface ModuleSummaryRecord extends GeneratedSummaryRecord {
  moduleBoundary: string;
  filePaths: string[];
}

export interface GeneratedContextState {
  lastGeneratedAt?: string;
  projectSummary?: GeneratedSummaryRecord;
  conventionsSummary?: GeneratedSummaryRecord;
  moduleSummaries: Record<string, ModuleSummaryRecord>;
  generatedFiles: string[];
}

export interface PersistedState {
  schemaVersion: number;
  generatedAt: string;
  projectRoot: string;
  techStack: TechStackSummary;
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  sessions: ActivitySession[];
  changeSets: ChangeSet[];
  generatedContext: GeneratedContextState;
  metadata: {
    lastScanSummary?: ScanSummary;
    lastIncrementalUpdateMs?: number;
    lastGenerateSummary?: GenerateSummary;
  };
}

export interface DaemonManifest {
  schemaVersion: number;
  projectRoot: string;
  pid: number;
  controlUrl: string;
  webUrl?: string;
  mcpHttpUrl?: string;
  authToken: string;
  startedAt: string;
  statePath: string;
  logPath: string;
}

export interface DaemonStatusResponse {
  status: "running" | "stale" | "stopped";
  projectRoot: string;
  schemaVersion: number;
  configPath: string;
  statePath: string;
  runtimePath: string;
  controlUrl?: string;
  webUrl?: string;
  mcpHttpUrl?: string;
  pid?: number;
  startedAt?: string;
  nodeCount: number;
  edgeCount: number;
  sessionCount: number;
  changeSetCount: number;
  watcherRunning: boolean;
  trackingMode: TrackingMode;
  activeSessionId?: string;
  lastScanSummary?: ScanSummary;
  lastIncrementalUpdateMs?: number;
  lastGeneratedAt?: string;
  generatedArtifactCount?: number;
  llmEnabled: boolean;
  llmProvider?: LlmProvider;
}

export interface FileExplainResponse {
  kind: "file";
  path: string;
  language: string;
  tier: LanguageTier;
  summary: string;
  summarySource: Provenance;
  exports: string[];
  dependencies: string[];
  dependents: string[];
  externalDependencies: string[];
  unresolvedImports: string[];
  moduleBoundary?: string;
}

export interface DirectoryExplainResponse {
  kind: "directory";
  path: string;
  fileCount: number;
  dominantLanguages: string[];
  children: string[];
  techStackHints: string[];
  summary?: string;
  summarySource?: Provenance;
}

export type ExplainResponse = FileExplainResponse | DirectoryExplainResponse;

export interface ExplicitSessionStartRequest {
  intent?: string;
  agentCommand?: string;
  source?: ExplicitSessionSource;
}

export interface ExplicitSessionStartResponse {
  sessionId: string;
  startedAt: string;
}

export interface ExplicitSessionEndRequest {
  agentStdout?: string;
  exitCode: number | null;
}

export interface WatcherEvent {
  ts: string;
  path: string;
  op: Exclude<ChangeOperation, "rename">;
}

export interface ChangeSetImpact {
  touchedPaths: string[];
  touchedModules: string[];
  impactedDependents: string[];
  impactedDependentModules: string[];
  durationMs: number;
}

export interface DashboardCounts {
  nodes: number;
  edges: number;
  sessions: number;
  changeSets: number;
}

export interface SessionSummaryResponse {
  id: string;
  source: SessionSource;
  actor: SessionActor;
  confidence: number;
  startedAt: string;
  endedAt: string;
  touchedPathsCount: number;
  touchedModulesCount: number;
}

export interface SessionFileImpactResponse {
  path: string;
  language: string;
  summary: string;
  summarySource: Provenance;
  moduleBoundary?: string;
  dependencyCount: number;
  dependentCount: number;
  externalDependencies: string[];
  touched: boolean;
  impacted: boolean;
}

export interface SessionModuleImpactResponse {
  moduleBoundary: string;
  touchedFileCount: number;
  impactedFileCount: number;
  filePaths: string[];
}

export interface SessionDetailResponse {
  session: ActivitySession;
  touchedFiles: SessionFileImpactResponse[];
  impactedFiles: SessionFileImpactResponse[];
  touchedModules: SessionModuleImpactResponse[];
  reviewOrder: string[];
  agentStdoutPreview?: string;
}

export interface DashboardOverviewResponse {
  projectName: string;
  projectRoot: string;
  watcherRunning: boolean;
  trackingMode: TrackingMode;
  activeSessionId?: string;
  counts: DashboardCounts;
  techStack: TechStackSummary;
  lastScanSummary?: ScanSummary;
  lastIncrementalUpdateMs?: number;
  projectSummary?: string;
  projectSummarySource?: Provenance;
  lastGeneratedAt?: string;
  latestSession: SessionDetailResponse | null;
}

export interface GraphNodeResponse {
  id: string;
  path: string;
  label: string;
  type: "file" | "directory" | "module";
  language: string;
  moduleBoundary?: string;
  architectureUnit?: string;
  tier: LanguageTier;
  touched: boolean;
  impacted: boolean;
  degree: number;
}

export interface GraphEdgeResponse {
  source: string;
  target: string;
  type: ProjectEdge["type"];
  weight: number;
  relationshipSources: GraphRelationshipSource[];
}

export type GraphHiddenCategory = "isolated" | "tests" | "config" | "assets" | "other-support";

export interface GraphHiddenSummaryItem {
  category: GraphHiddenCategory;
  count: number;
  label: string;
}

export interface GraphHiddenPreviewItem {
  path: string;
  label: string;
  type: "file" | "module" | "directory";
}

export interface GraphHiddenPreviewGroup {
  category: GraphHiddenCategory;
  truncated: boolean;
  items: GraphHiddenPreviewItem[];
}

export interface GraphFocusResponse {
  path: string;
  label: string;
}

export interface GraphDrilldownResponse {
  path: string;
  relativePath: string;
  label: string;
}

export interface GraphResponse {
  scope: "latest-session" | "project";
  granularity: GraphGranularity;
  nodeCount: number;
  edgeCount: number;
  truncated: boolean;
  fallbackApplied: boolean;
  focusApplied: boolean;
  focus?: GraphFocusResponse;
  drilldown?: GraphDrilldownResponse;
  drilldownTrail: GraphDrilldownResponse[];
  hiddenIsolatedCount: number;
  hiddenSummary: GraphHiddenSummaryItem[];
  hiddenPreview: GraphHiddenPreviewGroup[];
  nodes: GraphNodeResponse[];
  edges: GraphEdgeResponse[];
}

export interface SearchResultResponse {
  path: string;
  type: ProjectNode["type"];
  language: string;
  summary?: string;
  moduleBoundary?: string;
}

export interface DependencyResponse {
  path: string;
  direction: DependencyDirection;
  moduleBoundary?: string;
  dependencies: string[];
  dependents: string[];
  externalDependencies: string[];
  unresolvedImports: string[];
}

export interface ExplorerResponseFile extends FileExplainResponse {
  kind: "file";
  moduleFiles: string[];
  incomingCount: number;
  outgoingCount: number;
  lastTouchedByLatestSession: boolean;
}

export interface ExplorerResponseDirectory extends DirectoryExplainResponse {
  kind: "directory";
  moduleBoundary?: string;
  relatedSessions: SessionSummaryResponse[];
}

export type ExplorerResponse = ExplorerResponseFile | ExplorerResponseDirectory;

export interface WebLiveUpdateMessage {
  type: "state-updated";
  reason: WebLiveUpdateReason;
  affectedPaths?: string[];
  latestSessionId?: string;
  lastIncrementalUpdateMs?: number;
}

export interface GeneratedContextResponse {
  lastGeneratedAt?: string;
  projectSummary?: GeneratedSummaryRecord;
  conventionsSummary?: GeneratedSummaryRecord;
  moduleSummaries: Record<string, ModuleSummaryRecord>;
  generatedFiles: string[];
}

export interface IGraphStore {
  getNode(id: string): ProjectNode | null;
  getNodes(): ProjectNode[];
  getEdges(nodeId?: string): ProjectEdge[];
  getIncomingEdges(nodeId: string): ProjectEdge[];
  getOutgoingEdges(nodeId: string): ProjectEdge[];
  search(query: string): ProjectNode[];
  upsertNode(node: ProjectNode): void;
  removeNode(id: string): void;
  replaceOutgoingEdges(sourceId: string, edges: ProjectEdge[]): void;
  removeEdgesForNode(nodeId: string): void;
  getSessions(limit?: number): ActivitySession[];
  getSession(id: string): ActivitySession | null;
  upsertSession(session: ActivitySession): void;
  getChangeSets(limit?: number): ChangeSet[];
  getChangeSet(id: string): ChangeSet | null;
  addChangeSet(changeSet: ChangeSet): void;
  setTechStack(summary: TechStackSummary): void;
  getGeneratedContext(): GeneratedContextState;
  setGeneratedContext(generatedContext: GeneratedContextState): void;
  updateMetadata(metadata: Partial<PersistedState["metadata"]>): void;
  getState(): PersistedState;
  persist(): void;
  replace(state: PersistedState): void;
  load(): PersistedState | null;
}
