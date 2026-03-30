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

Public npm publish is intentionally deferred for now. The supported install path today is:

- download or clone this GitHub repo
- build SessionMap once
- install it globally from the repo with `npm install -g .`
- use `sessionmap ...` inside any project you want to analyze

### Requirements

- Node.js 20+
- npm 10+
- macOS, Linux, or WSL recommended
- A browser if you want to use the local dashboard
- Playwright/browser dependencies only if you want to run the full verification suite

> SessionMap is not installed into the target repository as an npm dependency.
> It runs against the repository you invoke it in.

### Standard Install From The GitHub Repo

```bash
git clone <your-repo-url>
cd /path/to/SessionMap
npm install
npm run build
npm install -g .
sessionmap --help
```

That installs SessionMap once on your machine. After that, switch to the other repository you want to analyze and run:

```bash
cd /path/to/your/project
sessionmap start
sessionmap scan
sessionmap status
sessionmap explain src
```

This is a machine-level install, not a per-project dependency. The target project does not add SessionMap to its `package.json`.

### Contributor Alternative: `npm link`

If you are developing SessionMap itself and prefer npm’s symlink workflow, this remains supported:

```bash
cd /path/to/SessionMap
npm link
sessionmap --help
```

`npm link` is a contributor convenience. `npm install -g .` is the standard user path.

### How It Works With Another Repo

Think of it as two separate locations:

- `/path/to/SessionMap` is where the SessionMap repo lives
- `/path/to/your/project` is the repository you want SessionMap to analyze

You install SessionMap once from `/path/to/SessionMap`, then you run `sessionmap ...` from `/path/to/your/project`.

### Common Mistakes

1. Running `npm install` inside the target repo only installs that repo's own dependencies and shows that repo's audit output. It does not install SessionMap into the repo.
2. Running SessionMap from the wrong directory points it at the wrong project. Change into `/path/to/your/project` before running `sessionmap ...` unless you are intentionally using `--project-root`.
3. If `sessionmap` is not found after install, your Node/npm global environment may not expose global binaries correctly. In that case, `npm link` may work on your machine, or your global npm prefix may need the normal Node/npm PATH setup for your OS.

### Future npm Publish Path

The repo is already package-safe and publish-ready, but the public npm package is not the current default path. Once public publish happens, users will be able to use:

```bash
npm install -g sessionmap
sessionmap start
```

Until then, install from the cloned GitHub repo with `npm install -g .`.

## Quick Start

After the one-time install above, run these commands inside the project you want SessionMap to analyze:

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

SessionMap stores its local runtime and generated artifacts inside the target project's `.sessionmap/` directory. It does not add itself to the target project's dependency graph.

## Track Agent Work

Use the CLI to capture an explicit session:

```bash
sessionmap track -- claude-code
```

Or wrap any other command:

```bash
sessionmap track -- npm test
```

This creates an explicit session, records touched files and impacted dependents, and captures only bounded stdout locally.

## Open The Dashboard

From `/path/to/your/project`, start SessionMap and read the `webUrl` from either:

```bash
sessionmap start
```

or

```bash
sessionmap status
```

Open the reported `webUrl` in your browser. The dashboard reflects the current target repo.

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

This is the stdio command your local MCP host can launch directly. The MCP host launches the SessionMap CLI from your machine, and `--project-root` tells it which repository to analyze.

### HTTP MCP

SessionMap also exposes a loopback-only HTTP MCP endpoint.

1. From `/path/to/your/project`, start the daemon for that project.
2. Run `sessionmap status`.
3. Read the `mcpHttpUrl`.

The MCP HTTP endpoint is bearer-protected, loopback-only, and intended for local use only. It exposes the analyzed target repo without copying SessionMap into that repo as a dependency.

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
- Public npm publish is deferred for now; install from the cloned GitHub repo with `npm install -g .`.

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
- [docs/RELEASE.md](docs/RELEASE.md) — manual npm release and publish checks
- [AGENTS.md](AGENTS.md) — contributor and agent workflow rules

## Current Product Position

SessionMap is MVP-complete for local, single-user use. It is designed to help you understand AI-assisted changes, give agents project-aware context, and keep generated context local to your machine.
