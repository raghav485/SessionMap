# SessionMap

SessionMap is a local-first shared understanding layer for AI-assisted codebases. It gives agents project-aware context before changes and gives developers session-aware explanations after changes.

## What It Does
- Scans a codebase and builds a local structural graph of files, directories, dependencies, and module boundaries.
- Tracks both explicit and inferred coding sessions so you can see what changed and what was impacted.
- Serves a local dashboard with Sessions, Graph, and Explorer views.
- Exposes MCP tools, resources, and prompts for local AI clients.
- Generates `.sessionmap/` context files for future agent runs.
- Optionally enriches project and module summaries with a user-provided LLM key.

SessionMap is local-first. It does not persist raw source code in state, and LLM use is opt-in only.

## Who It Is For
- Developers reviewing AI-generated changes.
- Developers who want a local architectural map of a repository.
- AI agents or MCP clients that need project-aware context.
- Teams experimenting with AI-assisted development locally.

## Current MVP Capabilities

### CLI
- `sessionmap start`
- `sessionmap stop`
- `sessionmap status`
- `sessionmap scan`
- `sessionmap explain <path>`
- `sessionmap track -- <command...>`
- `sessionmap sessions`
- `sessionmap generate`
- `sessionmap mcp`

### Dashboard
- Sessions
- Graph
- Explorer

### MCP
- Local Streamable HTTP MCP
- Stdio bridge for local MCP hosts

### Generated Artifacts
- `.sessionmap/ARCHITECTURE.md`
- `.sessionmap/TECH_STACK.md`
- `.sessionmap/CONVENTIONS.md`
- `.sessionmap/MODULES.md`
- `.sessionmap/modules/*.md`

## Supported Languages

| Tier | Depth | Languages |
| --- | --- | --- |
| 1 | AST-backed imports/exports/declarations | TypeScript, JavaScript |
| 2 | Heuristic imports/exports/dependency mapping | Python, Go, Rust, Java, C#, Ruby, PHP |
| 3 | File/config indexing only | Everything else |

Tier 2 support is intentionally conservative and may prefer unresolved imports over incorrect dependency edges.

## Installation

### Requirements
- Node.js 20+
- npm 10+
- macOS, Linux, or WSL recommended
- A browser if you want to use the local dashboard
- Playwright/browser dependencies only if you want to run the full verification suite

### Clone And Install
```bash
git clone <your-repo-url>
cd SessionMap
npm install
npm run build
```

### Make The CLI Available
This repository is currently source-install only. It is not published as an npm package.

Option A, recommended for local development:
```bash
npm link
sessionmap --help
```

Option B, no global link:
```bash
node dist/cli.js --help
```

All examples below assume `sessionmap` is available on your `PATH` via `npm link`. If not, replace `sessionmap` with `node dist/cli.js`.

## Quick Start
Run SessionMap inside the repository you want to analyze:

```bash
cd /path/to/your/project
sessionmap start
sessionmap scan
sessionmap status
sessionmap explain src
```

- `sessionmap start` starts the project-local daemon.
- `sessionmap scan` builds the initial graph.
- `sessionmap status` shows daemon URLs, graph counts, and generation/session status.
- `sessionmap explain src` explains a file or directory using the current graph state.

SessionMap stores its local runtime and generated artifacts inside the target project's `.sessionmap/` directory.

## Track Agent Work
Use the wrapper to capture an explicit session:

```bash
sessionmap track -- claude-code
```

Or wrap any other command:

```bash
sessionmap track -- npm test
```

This creates an explicit session, records touched files and impacted dependents, and captures only bounded stdout locally.

## Open The Dashboard
Start SessionMap and read the `webUrl` from either:

```bash
sessionmap start
```

or

```bash
sessionmap status
```

Open the reported `webUrl` in your browser.

Main views:
- Sessions: latest work digest, touched modules, and review order
- Graph: dependency exploration
- Explorer: file and module details

## Generate Context Files
Generate `.sessionmap/` context artifacts from daemon state:

```bash
sessionmap generate
```

This writes generated files under `.sessionmap/`. They are derived from current daemon state and should not be edited by hand.

## Use With MCP

### Stdio Bridge
For local MCP hosts that launch a command:

```bash
sessionmap mcp --project-root /path/to/project
```

This is the stdio command your local MCP host can launch directly.

### HTTP MCP
SessionMap also exposes a loopback-only HTTP MCP endpoint.

1. Start the daemon for a project.
2. Run `sessionmap status`.
3. Read the `mcpHttpUrl`.

The MCP HTTP endpoint is bearer-protected and intended for local use only.

## Example Workflow
1. Start SessionMap in a repo with `sessionmap start`.
2. Build the initial graph with `sessionmap scan`.
3. Wrap your agent with `sessionmap track -- ...`.
4. Inspect the latest work in the dashboard.
5. Run `sessionmap generate` to create `.sessionmap/` files for future agent context.

## Configuration
SessionMap reads configuration from:

- `sessionmap.config.json` in the project root

Configurable areas include:
- ignore patterns
- port settings
- analysis limits
- session settings
- optional LLM settings
- architecture rules

For the full schema and defaults, see:
- [docs/TRD.md](docs/TRD.md)
- [src/config.ts](src/config.ts)

## LLM Support
- Disabled by default
- Requires a user-supplied API key
- Supports OpenAI, Anthropic, and Google
- Only enriches project-level and module-level summaries in the current MVP
- Does not send code anywhere unless you explicitly enable it

Environment variable resolution is provider-aware:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `LLM_API_KEY` as a fallback

## Limitations
- Local-first only; there is no cloud sync or team workspace.
- One daemon runs per project root.
- Tier 2 language support is heuristic, not full semantic analysis.
- File-level LLM summaries are not implemented.
- There is no semantic search or embeddings layer.
- There is no VS Code extension.
- `.sessionmap/` generation is manual, not automatic on every change.
- Package install from npm is not supported yet because the repo is not published and `package.json` is private.

## Development And Verification
Useful repo commands:

```bash
npm run build
npm run lint
npx tsc --noEmit
npm test
npm run verify
```

`npm run verify` includes MCP tests, daemon-backed tests, and Playwright dashboard checks. Some environments may require localhost or browser permissions for the full suite.

## Repository Docs
- [docs/PRD.md](docs/PRD.md) — product intent and scope
- [docs/TRD.md](docs/TRD.md) — architecture, data models, and contracts
- [AGENTS.md](AGENTS.md) — contributor and agent workflow rules

## Current Product Position
SessionMap is MVP-complete for local, single-user use. It is designed to help you understand AI-assisted changes, give agents project-aware context, and keep generated context local to your machine.
