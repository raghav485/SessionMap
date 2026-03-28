# SessionMap — Product Requirements Document (PRD)

> **Version**: 0.9
> **Date**: March 27, 2026

## 1. Product Vision

> **SessionMap is the shared understanding layer for AI-assisted codebases: it gives agents project-aware context before and during changes, and gives developers session-aware explanations after changes.**

Developers using AI coding agents face two related problems:
1. **Comprehension lag**: agents produce code faster than developers can understand what changed and why.
2. **Context gap**: agents lack structural awareness of the project and produce inconsistent changes.

SessionMap fills that gap with a local-first analysis, graph, and session-tracking layer shared by developers and agents.

## 2. Target Users

| User | Pain Point |
| --- | --- |
| Developers using AI agents | Need to quickly understand what the agent changed and how it fits the project |
| AI coding agents | Need project-aware context before editing |
| Teams using AI-assisted development | Need a shared map of architecture and recent evolution |

## 3. Core Features (MVP)

### 3.1 Codebase Analysis Engine
- Language-agnostic scanning via tree-sitter with tiered language support
- Auto tech-stack detection for languages, frameworks, and package managers
- Dependency extraction for imports, exports, and module relationships
- Local rescans and live watching to keep the graph fresh

### 3.2 Knowledge Graph
- Nodes represent files, directories, and later modules
- Edges represent imports and other structural relationships
- User-defined architecture rules and conventions
- Provenance on generated data: `ast`, `heuristic`, `llm`, or `user`

### 3.3 Session Tracking

**Explicit tracking**
- CLI wrapper: `sessionmap track -- claude-code`
- MCP tools: `begin_session` and `end_session`

**Passive inference**
- File changes are grouped into `ChangeSet`s and then clustered into `ActivitySession`s
- Session boundaries combine inactivity gap with path and graph locality
- Explicit sessions take precedence over inferred clustering
- Wrapper stdout capture remains local-only and bounded by config

### 3.4 Web Dashboard
- Sessions view for the latest work and impact
- Graph view for dependency exploration
- Explorer view for annotated file and module details
- Structural search in MVP, semantic search only when LLM is enabled
- Loopback-only local dashboard served by the daemon
- Live updates on scans, tracked sessions, and incremental file changes

### 3.5 MCP Server
- Loopback-only Streamable HTTP MCP server hosted by the daemon on its own port
- `sessionmap mcp --project-root <path>` stdio bridge for local MCP hosts such as Claude Desktop
- Project overview, module context, dependency, search, and session tools
- `sessionmap://` resources
- Session review and placement prompts
- `mcpHttpUrl` surfaced in the runtime manifest and CLI status surfaces

### 3.6 Hybrid Structural + Optional LLM Analysis
- Structural analysis always works locally without sending code anywhere
- Optional user-supplied LLM can enrich project-level and module-level summaries
- File-level explanations remain structural in Milestone 5
- LLM output is always tagged `source: 'llm'`

### 3.7 Context File Generation
- Generates `.sessionmap/` markdown artifacts for agent consumption
- Generated artifacts are derived from structured state and never hand-edited
- Generation is explicit in Milestone 5 via `sessionmap generate`

### 3.8 Runtime Model
- A project-local **SessionMap Daemon** owns the in-memory graph, persisted state, session tracking, the web adapter, and future MCP adapters
- Short-lived CLI commands act as clients that talk to the daemon over an authenticated loopback control API
- Future transports remain decoupled adapters over shared services
- The daemon owns the watcher lifecycle while `watcher/` emits raw file events only
- Incremental touched-file graph updates are the normal runtime path after changes
- The web adapter auto-starts with the daemon and remains loopback-only in MVP
- The MCP HTTP adapter auto-starts with the daemon on a separate loopback transport
- The stdio MCP bridge is a short-lived client that proxies to the daemon and must keep stdout protocol-clean

## 4. Language Support Tiers

| Tier | Depth | Languages |
| --- | --- | --- |
| 1 — Deep | AST imports, exports, declarations, and structural summaries | TypeScript, JavaScript |
| 2 — Imports | Import/export mapping and module boundaries | Python, Go, Rust, Java, C#, Ruby, PHP |
| 3 — File-level | File indexing, directory structure, config detection | All others |

## 5. User Stories

### Developer Stories
| # | Story |
| --- | --- |
| D1 | As a developer, I want to see a digest of what my last agent session changed so I can review efficiently |
| D2 | As a developer, I want to wrap my agent with `sessionmap track --` so sessions are captured automatically |
| D3 | As a developer, I want to explore a visual map of my project to understand module relationships |
| D4 | As a developer, I want to click any module and get an explanation of what it does |
| D5 | As a developer, I want detected tech stack and framework patterns surfaced automatically |

### Agent Stories
| # | Story |
| --- | --- |
| A1 | As an agent, I want to query project architecture before making changes |
| A2 | As an agent, I want to know what modules relate to the one I am editing |
| A3 | As an agent, I want to understand conventions so my code fits the project |
| A4 | As an agent, I want help finding the right place to add new functionality |

## 6. Information Architecture

```
SessionMap
├── Daemon
│   ├── Analysis engine
│   ├── Knowledge graph
│   ├── Session tracker
│   ├── Context generator
│   ├── Web adapter
│   └── MCP adapter
├── CLI clients
│   ├── sessionmap start
│   ├── sessionmap scan
│   ├── sessionmap explain
│   ├── sessionmap generate
│   ├── sessionmap track --
│   └── sessionmap mcp
└── Dashboard
    ├── Sessions
    ├── Graph
    ├── Explorer
    └── Settings
```

## 7. Success Metrics

| Metric | Target |
| --- | --- |
| Time to understand last agent session | < 60 seconds |
| Setup time to first useful scan | < 2 minutes |
| Tracked session accuracy | 100% |
| Inferred session boundary accuracy | > 80% |
| Initial scan speed (< 500 files) | < 10 seconds |

## 8. Scope

### In Scope (MVP)
- Analysis engine with tiered support
- Knowledge graph with provenance
- Session tracking
- Web dashboard
- MCP tools, resources, and prompts
- `.sessionmap/` generation
- CLI and daemon architecture
- Optional LLM infrastructure with default-off behavior

### Out Of Scope (Future)
- Team collaboration
- Cloud hosting
- VS Code extension
- Inferred architecture rules
- Advanced semantic search and embeddings

## 9. Milestone 1 Scope

Milestone 1 delivers the foundation only:
- Canonical SessionMap docs and repo bootstrap
- Project-local daemon and authenticated internal control API
- TS/JS Tier 1 analysis plus Tier 3 fallback
- JSON persistence behind `IGraphStore`
- CLI commands: `start`, `stop`, `status`, `scan`, `explain`

Milestone 1 explicitly excludes session tracking, web, MCP, `.sessionmap/` generation, LLM integration, and Tier 2 extractors.

## 10. Milestone 2 Scope

Milestone 2 delivers the session core:
- explicit tracking with `sessionmap track -- <command...>`
- passive inference from watcher events
- typed `ChangeEvent -> ChangeSet -> ActivitySession` persistence
- incremental touched-file graph updates without normal-path full rescans
- `sessionmap sessions` list/detail surfaces

Milestone 2 explicitly excludes web, MCP, generator, LLM, and Tier 2 language work.

## 11. Security And Privacy

- Local-first by default
- No raw source persisted
- No telemetry
- Optional LLM use is explicit opt-in only
- `.gitignore` and `.sessionmapignore` are respected by analysis components
- wrapper stdout capture is stored locally only and never transmitted
- the dashboard is loopback-only and does not expose the internal bearer-protected control API
- MCP HTTP remains loopback-only and bearer-protected
- MCP session queries expose only bounded session previews, not full raw `agentStdout`

## 12. Milestone 3 Scope

Milestone 3 delivers the dashboard:
- Fastify web adapter hosted inside the daemon
- Vite-built local frontend using Sessions, Graph, and Explorer views
- structural search and live updates over WebSocket
- `webUrl` surfaced in daemon manifest, `sessionmap start`, and `sessionmap status`

Milestone 3 explicitly excludes MCP, settings UI, remote access, semantic search, `.sessionmap/` generation, LLM work, and Tier 2 extractors.

## 13. Milestone 4 Scope

Milestone 4 delivers the MCP transport layer:
- daemon-hosted loopback Streamable HTTP MCP on a dedicated transport
- `sessionmap mcp --project-root <path>` stdio bridge for local MCP hosts
- MVP tools: project overview, module context, dependencies, search, latest session, session detail, begin session, end session
- MVP resources: project overview, project rules, latest session, module context, session detail
- MVP prompts: latest-session review and change-placement planning
- `mcpHttpUrl` surfaced in daemon manifest, `sessionmap start`, and `sessionmap status`

Milestone 4 keeps web and MCP fully decoupled, exposes bounded session output only, and excludes deprecated SSE compatibility, remote access, `.sessionmap/` generation, LLM work, and Tier 2 extractors.

## 14. Milestone 5 Scope

Milestone 5 delivers generated context files and opt-in LLM enrichment:
- `sessionmap generate`
- daemon-backed generation endpoint and generated-context state
- deterministic `.sessionmap/ARCHITECTURE.md`, `TECH_STACK.md`, `CONVENTIONS.md`, `MODULES.md`, and per-module docs
- persisted project and module summaries with provenance
- opt-in OpenAI, Anthropic, and Google provider support behind one abstraction
- dashboard, explorer, explain, and MCP overview/module-context surfaces read generated project/module summaries when available

Milestone 5 explicitly excludes Tier 2 language extractors, auto-regeneration on watcher updates, file-level LLM summaries, session-summary LLM enrichment, remote/cloud storage, and embeddings.

## 15. Milestone 6 Scope

Milestone 6 finishes the MVP with Tier 2 language support and hardening:
- real Tier 2 extraction for Python, Go, Rust, Java, C#, Ruby, and PHP
- bundled TypeScript and JavaScript `web-tree-sitter` grammar assets so Tier 1 AST mode works by default
- expanded non-JS tech-stack detection
- existing `scan`, `explain`, dashboard Explorer, and MCP dependency/module-context surfaces become more capable without adding new transports or commands
- hardening around grammar readiness, recovery, and regression verification

Milestone 6 keeps Tier 2 depth at import/export mapping, not full declaration-level semantic modeling, and still excludes file-level LLM summaries, embeddings, remote/cloud features, and watcher-triggered regeneration.
