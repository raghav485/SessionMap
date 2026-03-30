# SessionMap — Technical Requirements Document (TRD)

> **Version**: 0.9
> **Date**: March 27, 2026

## 1. System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        SESSIONMAP DAEMON                       │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Analysis     │  │ Knowledge    │  │ Session Tracker      │  │
│  │ Engine       │──│ Graph Store  │──│ + Change Tracking    │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                     │              │
│  ┌──────┴─────────────────┴─────────────────────┴───────────┐  │
│  │                 Shared Query / Service Layer             │  │
│  └──────┬───────────────────┬───────────────────┬───────────┘  │
│         │                   │                   │              │
│  ┌──────▼──────┐   ┌────────▼────────┐  ┌──────▼─────────┐    │
│  │ Control API │   │ Web Adapter     │  │ MCP Adapter    │    │
│  │ (loopback)  │   │ (loopback)      │  │ (loopback)     │    │
│  └─────────────┘   └─────────────────┘  └────────────────┘    │
└────────────────────────────────────────────────────────────────┘

       ▲                     ▲
       │                     │
  sessionmap CLI       dashboard clients and future stdio/HTTP MCP clients
```

- The daemon is the only long-lived process for a project root.
- CLI commands are short-lived clients.
- Web and MCP remain separate transports over shared services.
- All non-CLI logging goes to stderr.

## 2. Technology Stack

| Component | Technology | Rationale |
| --- | --- | --- |
| Runtime | Node.js 20+ | Stable platform for CLI, HTTP, and WASM |
| Language | TypeScript | Strong typing for graph and daemon contracts |
| AST parsing | `web-tree-sitter` | WASM distribution without native bindings |
| Ignore parsing | `ignore` | Correct `.gitignore` semantics |
| CLI | `commander` | Minimal CLI surface |
| Control plane | Node `http` | Internal loopback API without extra dependency |
| Persistence | JSON behind `IGraphStore` | Simple MVP persistence |
| File watching | `chokidar` | Cross-platform file events and debounced updates |
| Web adapter | `fastify` + `@fastify/static` + `@fastify/websocket` | Loopback-only dashboard transport and live updates |
| MCP adapter | `@modelcontextprotocol/sdk` + `zod` | Shared MCP catalog over Streamable HTTP and stdio |
| Frontend | `vite` + vanilla TypeScript + `d3` | Small local dashboard with explicit graph rendering |
| Tests | `vitest` + `@playwright/test` | Route/integration coverage plus one browser-level dashboard proof |
| Distribution | npm package | First-class `npx sessionmap` and global install UX |

## 2.1 Packaging And Distribution

- SessionMap is packaged as an npm CLI named exactly `sessionmap`
- The primary public invocation is `npx sessionmap <command>`
- Persistent install uses `npm install -g sessionmap`
- Contributor/source installs remain supported, but they are not the primary end-user path
- `package.json` remains the source of truth for npm metadata, `bin`, publish allowlist, and pack scripts
- The published tarball must include:
  - `dist/**`
  - `grammars/**`
  - `README.md`
  - `LICENSE`
  - `package.json`
- The published tarball must not depend on:
  - `src/**`
  - `test/**`
  - `tasks/**`
  - contributor-only process docs
- Packaging verification must validate that installed-package runtime paths still resolve:
  - `dist/cli.js`
  - `dist/web/**`
  - `grammars/**`
- The initial publish workflow is manual-first and documented in `docs/RELEASE.md`

## 3. Component Design

### 3.1 Project Structure

```
src/
├── cli.ts
├── config.ts
├── constants.ts
├── logger.ts
├── types.ts
├── daemon/
│   ├── launcher.ts
│   ├── main.ts
│   ├── manifest.ts
│   ├── control-server.ts
│   └── client.ts
├── engine/
│   ├── scanner.ts
│   ├── ignore-resolver.ts
│   ├── language-detector.ts
│   ├── tech-stack-detector.ts
│   ├── tree-sitter-parser.ts
│   ├── dependency-resolver.ts
│   ├── module-boundary.ts
│   └── import-extractors/
│       ├── typescript.ts
│       ├── javascript.ts
│       ├── python.ts
│       ├── go.ts
│       ├── rust.ts
│       ├── java.ts
│       ├── csharp.ts
│       ├── ruby.ts
│       └── php.ts
├── graph/
│   ├── knowledge-graph.ts
│   ├── graph-builder.ts
│   ├── graph-query.ts
│   └── json-store.ts
├── watcher/
│   └── file-watcher.ts
├── session/
│   ├── change-tracker.ts
│   ├── inferrer.ts
│   ├── session-tracker.ts
│   └── wrapper.ts
├── web/
│   ├── server.ts
│   ├── routes.ts
│   ├── live-updates.ts
│   └── app/
│       ├── index.html
│       ├── main.ts
│       ├── api.ts
│       ├── router.ts
│       ├── state.ts
│       ├── styles.css
│       ├── views/
│       └── components/
├── mcp/
│   ├── catalog.ts
│   ├── service.ts
│   ├── register.ts
│   ├── http-server.ts
│   ├── stdio-bridge.ts
│   └── serialization.ts
├── generator/
│   ├── service.ts
│   ├── snapshot.ts
│   ├── templates.ts
│   └── writer.ts
└── llm/
    ├── client.ts
    ├── prompt-builder.ts
    ├── summarizer.ts
    └── providers/
        ├── openai.ts
        ├── anthropic.ts
        └── google.ts
```

Docs and release support files:

```
docs/
├── PRD.md
├── TRD.md
└── RELEASE.md
```

### 3.2 Core Types

```ts
type Provenance = 'ast' | 'heuristic' | 'llm' | 'user';
type SessionSource = 'explicit-wrapper' | 'explicit-mcp' | 'watcher-inferred' | 'git-enriched';
type SessionActor = 'agent' | 'human' | 'mixed' | 'unknown';

interface ProjectNode {
  id: string;
  type: 'file' | 'directory' | 'module';
  path: string;
  language: string;
  tier: 1 | 2 | 3;
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

interface ProjectEdge {
  source: string;
  target: string;
  type: 'imports' | 'exports' | 'extends' | 'implements' | 'composes';
  symbols: string[];
  weight: number;
}

interface ScanSummary {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  filesScanned: number;
  nodes: number;
  edges: number;
  languages: Record<string, number>;
}

interface TechStackSummary {
  packageManagers: string[];
  frameworks: string[];
  languages: string[];
  configFiles: string[];
}

interface ChangeEvent {
  id: string;
  ts: string;
  path: string;
  op: 'add' | 'change' | 'unlink' | 'rename';
  previousPath?: string;
  bytesChanged?: number;
  language?: string;
}

interface ChangeSet {
  id: string;
  startedAt: string;
  endedAt: string;
  events: ChangeEvent[];
  source: SessionSource;
}

interface ActivitySession {
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

interface PersistedState {
  schemaVersion: number;
  generatedAt: string;
  projectRoot: string;
  techStack: TechStackSummary;
  nodes: ProjectNode[];
  edges: ProjectEdge[];
  sessions: ActivitySession[];
  changeSets: ChangeSet[];
  generatedContext: {
    lastGeneratedAt?: string;
    projectSummary?: {
      text: string;
      source: Provenance;
      generatedAt: string;
      provider?: 'openai' | 'anthropic' | 'google';
      model?: string;
    };
    conventionsSummary?: {
      text: string;
      source: Provenance;
      generatedAt: string;
      provider?: 'openai' | 'anthropic' | 'google';
      model?: string;
    };
    moduleSummaries: Record<string, {
      text: string;
      source: Provenance;
      generatedAt: string;
      provider?: 'openai' | 'anthropic' | 'google';
      model?: string;
      moduleBoundary: string;
      filePaths: string[];
    }>;
    generatedFiles: string[];
  };
  metadata: {
    lastScanSummary?: ScanSummary;
    lastIncrementalUpdateMs?: number;
    lastGenerateSummary?: {
      startedAt: string;
      completedAt: string;
      durationMs: number;
      artifactCount: number;
      moduleCount: number;
      llmUsed: boolean;
      llmProvider?: 'openai' | 'anthropic' | 'google';
      generatedFiles: string[];
    };
  };
}

interface DaemonManifest {
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
```

### 3.3 Configuration

```json
{
  "projectName": "My Project",
  "ignore": ["node_modules", "dist", ".git", ".sessionmap"],
  "ports": {
    "controlHost": "127.0.0.1",
    "controlPort": 0,
    "webPort": 0,
    "mcpPort": 0
  },
  "analysis": {
    "maxFileSizeBytes": 1048576,
    "maxDepth": 20,
    "languages": "auto"
  },
  "session": {
    "inactivityGapMs": 180000,
    "debounceMs": 300,
    "captureStdout": true,
    "maxStdoutLines": 500
  },
  "llm": {
    "enabled": false,
    "provider": null,
    "apiKey": null,
    "model": null,
    "temperature": 0.2,
    "maxOutputTokens": 1200,
    "timeoutMs": 30000
  },
  "rules": []
}
```

### 3.4 npm Package Contract

- `package.json.name` must stay exactly `sessionmap`
- `package.json.bin.sessionmap` must point to `dist/cli.js`
- `package.json.private` must remain `false` for publish-ready builds
- `prepack` must build the runtime payload before tarball creation
- `pack:check` must verify the tarball contents locally without requiring publication
- Publishing is blocked if:
  - the exact unscoped npm name is unavailable to the owning account
  - tarball verification fails
  - MIT license metadata or file is missing

### 3.5 Runtime Path Expectations For Installed Packages

- `src/daemon/launcher.ts` must be able to spawn the packaged `dist/cli.js`
- `src/web/server.ts` must resolve static assets from packaged `dist/web`
- `src/engine/tree-sitter-parser.ts` must resolve bundled grammars from packaged `grammars/`
- No runtime path may assume the source repository layout exists once installed from npm

- Runtime config lives in `src/config.ts`.
- Secrets may come from env vars but must be parsed into the typed config object.
- Session config drives debounce, inactivity, and stdout-capture behavior.
- LLM secrets resolve from provider-specific env vars and are stored only in runtime config.

### 3.4 Daemon Lifecycle

- `sessionmap start` starts or reuses a project-local daemon.
- The daemon writes `.sessionmap/runtime/daemon.json` and `.sessionmap/runtime/daemon.stderr.log`.
- The daemon also starts a loopback-only Fastify dashboard server and records `webUrl` in the runtime manifest.
- The daemon also starts a loopback-only MCP HTTP server on a separate Node `http` transport and records `mcpHttpUrl` in the runtime manifest.
- Control API endpoints:
  - `GET /health`
  - `GET /v1/status`
  - `GET /v1/overview`
  - `GET /v1/generated-context`
  - `POST /v1/scan`
  - `POST /v1/generate`
  - `GET /v1/explain?path=...`
  - `GET /v1/explorer?path=...`
  - `GET /v1/search?q=...`
  - `GET /v1/dependencies?path=...&direction=...`
  - `GET /v1/rules`
  - `GET /v1/sessions?limit=...`
  - `GET /v1/sessions/latest`
  - `GET /v1/sessions/:id`
  - `GET /v1/sessions/:id/detail`
  - `POST /v1/sessions/explicit/start`
  - `POST /v1/sessions/explicit/:id/end`
  - `POST /v1/shutdown`
- All authenticated endpoints require `Authorization: Bearer <token>`.
- On schema mismatch, persisted state is discarded and rebuilt.
- The daemon startup order is: load config/state, construct services, start control server, start web server, start MCP server, start watcher, then write the manifest.
- The dashboard transport is not allowed to call the internal control API over HTTP.
- The MCP transport is not allowed to reuse Fastify routes or the internal control API server; it consumes shared services directly.
- Generation is manual in Milestone 5; the daemon does not auto-regenerate `.sessionmap/` artifacts from watcher events.

### 3.5 Analysis Engine

1. Walk the file tree while respecting `.gitignore`, `.sessionmapignore`, config ignores, and mandatory ignores.
2. Detect stack signals from root config files and lockfiles.
3. For each file:
   - Determine language and tier
   - Parse TS/JS with `web-tree-sitter` when grammar support is available
   - Fall back to Tier 3 indexing on parser failure or unsupported languages
4. Resolve internal dependencies and record unresolved or external imports in metadata.
5. Build graph nodes and edges.
6. Persist JSON state without raw file contents.
7. Use incremental touched-file graph updates during normal watcher operation.

### 3.6 Graph Store

```ts
interface IGraphStore {
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
  getState(): PersistedState;
  persist(): void;
  replace(state: PersistedState): void;
  load(): PersistedState | null;
}
```

### 3.7 Explain Output

- File explanations include structural summary, exports, internal dependencies, dependents, and external dependencies.
- Directory explanations aggregate child files, dominant languages, tech stack hints, and generated module summaries when available.
- Milestone 1 explanations are structural only and use `ast` or `heuristic` provenance.

### 3.8 Watcher And Session Flow

- `watcher/file-watcher.ts` emits raw `add`, `change`, and `unlink` events only.
- `session/change-tracker.ts` debounces raw watcher events into `ChangeSet`s.
- `session/session-tracker.ts` owns explicit sessions and inferred session clustering.
- `session/inferrer.ts` merges change sets into inferred sessions using inactivity gap plus path and graph locality.
- Explicit sessions take precedence over inferred session creation and merging.
- Normal watcher traffic updates only touched files and directly affected dependents.

### 3.9 Web Adapter

- REST endpoints are served from the Fastify web adapter only:
  - `GET /`
  - `GET /api/status`
  - `GET /api/overview`
  - `GET /api/sessions?limit=...`
  - `GET /api/sessions/latest`
  - `GET /api/sessions/:id`
  - `GET /api/graph?scope=...`
  - `GET /api/explorer?path=...`
  - `GET /api/search?q=...`
  - `GET /api/tech-stack`
- Live updates are delivered over `GET /ws`.
- The frontend uses hash routes only:
  - `#/sessions`
  - `#/graph?scope=latest-session|project`
  - `#/explorer?path=...`
- The Sessions view is the default landing experience and must surface the latest session digest first.
- The web adapter is loopback-only and unauthenticated in Milestone 3.

### 3.10 MCP Adapter

- The MCP HTTP server runs on its own loopback-only Node `http` server at `/mcp`.
- Streamable HTTP requires `Authorization: Bearer <authToken>` and host-header validation against loopback hosts.
- `sessionmap mcp --project-root <path>` runs a stdio bridge built on `StdioServerTransport`.
- The HTTP transport and stdio bridge share one transport-neutral catalog and service layer in `src/mcp/`.
- Supported tools:
  - `get_project_overview`
  - `get_module_context`
  - `get_dependencies`
  - `search_project`
  - `get_latest_session`
  - `get_session`
  - `begin_session`
  - `end_session`
- Supported resources:
  - `sessionmap://project/overview`
  - `sessionmap://project/rules`
  - `sessionmap://session/latest`
  - `sessionmap://module/{encodedPath}`
  - `sessionmap://session/{sessionId}`
- Supported prompts:
  - `review_latest_session`
  - `plan_change_placement`
- MCP resources return JSON text with `mimeType: application/json`.
- MCP tool results return structured content plus a concise text summary.
- MCP session surfaces expose bounded session previews only; full `agentStdout` remains local-only.

### 3.11 Generated Context And LLM

- `sessionmap generate` triggers one daemon-backed generation run against persisted structural state.
- Generated artifacts live under `.sessionmap/`:
  - `ARCHITECTURE.md`
  - `TECH_STACK.md`
  - `CONVENTIONS.md`
  - `MODULES.md`
  - `modules/<encoded-module-boundary>.md`
- Generated markdown is deterministic in ordering and never contains raw source snippets.
- The generator writes structural summaries first, then optionally replaces project/module summaries with LLM output when enabled.
- LLM scope in Milestone 5:
  - project summary
  - conventions summary
  - module summaries
- File-level summaries remain structural in Milestone 5.
- LLM provider implementations use direct HTTPS requests via `fetch`:
  - OpenAI Responses API
  - Anthropic Messages API
  - Google Gemini `generateContent`
- Provider failures do not fail the generation run; they fall back to structural summaries and still write artifacts.
- Raw source is never persisted, never logged, and only read on demand for bounded module summarization when LLM is enabled.

## 4. Module Boundary Rules

- `daemon/` handles process lifecycle and the internal control plane only.
- `engine/` performs scanning, parsing, and extraction only.
- `graph/` owns graph state, persistence, and queries only.
- `watcher/` emits file events only.
- `session/` owns change grouping, inference, and explicit session lifecycle only.
- `web/` owns HTTP, static assets, and live-update delivery only.
- `mcp/` owns MCP registration, transports, and serialization only.
- `generator/` owns context snapshots, markdown rendering, and file output only.
- `llm/` owns provider clients and summarization only.

## 5. Security And Privacy

- No raw file contents are persisted.
- Ignore patterns are respected throughout scanning.
- `.sessionmap/` must always be ignored as input.
- Daemon control traffic is loopback-only with bearer-token auth.
- MCP HTTP traffic is loopback-only with bearer-token auth and loopback host validation.
- Runtime logs must go to stderr.
- Wrapper stdout capture is local-only and bounded by config.
- MCP prompts and tools must never embed raw source or unbounded session stdout.
- Generated markdown must never contain raw source code.
- LLM provider requests may read bounded source text only after explicit user opt-in via config and key.

## 6. Testing Strategy

| Layer | Approach |
| --- | --- |
| Config | Unit tests for defaults, validation, env parsing |
| Engine | Fixture-based tests for scanning, parsing, and dependency extraction |
| Graph | Unit tests for graph build/query/persistence |
| Watcher | Integration tests for ignore behavior and event emission |
| Session | Unit and integration tests for debounce, inference, and explicit tracking |
| Daemon | Integration tests for manifest lifecycle and control API auth |
| CLI | Integration tests for `start`, `status`, `scan`, `explain`, `track`, `sessions`, and `stop` |
| Web | Route tests, live-update integration tests, and a Playwright dashboard smoke test |
| MCP | Service, Streamable HTTP, and stdio bridge tests covering tools, resources, prompts, and session attribution |
| Generator | Deterministic artifact generation tests and CLI/control endpoint tests |
| LLM | Unit tests for provider request/response mapping and structural fallback behavior |
| Tier 2 | Fixture-based extractor, resolution, and explain/query tests for each supported Tier 2 language |

## 7. Milestone 1 Acceptance

- Canonical `SessionMap` docs and AGENTS workflow files exist.
- Daemon lifecycle works and self-heals stale runtime state.
- TS/JS projects can be scanned and explained.
- Typed `ChangeEvent`, `ChangeSet`, and `ActivitySession` persistence works.
- Incremental single-file graph updates are the default runtime path.
- `verify` passes.

## 8. Milestone 4 Acceptance

- The daemon starts a dedicated loopback MCP HTTP server and records `mcpHttpUrl`.
- `sessionmap mcp` serves the same MCP catalog over stdio without polluting stdout.
- MCP HTTP and stdio expose identical tool, resource, and prompt behavior over shared services.
- `begin_session` and `end_session` produce `explicit-mcp` sessions and reuse the shared session tracker.
- `test:mcp`, `npm test`, and `npm run verify` pass.

## 9. Milestone 5 Acceptance

- `sessionmap generate` exists and uses daemon state as the source of truth.
- `.sessionmap/ARCHITECTURE.md`, `TECH_STACK.md`, `CONVENTIONS.md`, `MODULES.md`, and per-module docs are generated deterministically.
- Project and module generated summaries persist in state with provenance.
- Dashboard, explorer, explain, and MCP overview/module-context surfaces consume generated project/module summaries when present.
- OpenAI, Anthropic, and Google provider clients are implemented behind one abstraction.
- LLM-disabled mode remains fully functional with structural-only generation.
- `npm run verify` passes.

## 10. Milestone 6 Acceptance

- Tier 2 languages no longer fall back to empty structural analysis; they emit imports, exports, and dependency metadata.
- Existing runtime surfaces show Tier 2 context without adding new commands or transports.
- TypeScript/JavaScript grammar assets are bundled and verified in-repo.
- Non-JS tech-stack detection recognizes the major ecosystem files for all supported Tier 2 languages.
- Current session, web, MCP, and generator behavior remains intact.
- Existing incremental update benchmark does not regress beyond the current target.
- `npm run verify` passes.
