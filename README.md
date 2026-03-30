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

Public npm publish is intentionally deferred for now. Today there are two supported install paths:

- External testers: download a versioned GitHub beta wrapper for your OS from the matching GitHub Release
- Contributors or local developers: clone this repo and run the built CLI directly

### Requirements

- Node.js 20+
- npm 10+
- macOS, Linux, or WSL recommended
- A browser if you want to use the local dashboard
- Playwright/browser dependencies only if you want to run the full verification suite

> SessionMap is not installed into the target repository as an npm dependency.
> It runs against the repository you invoke it in.

### A. GitHub Beta Release Path For External Testers

This is the current low-friction path for friends or other testers. It does not require Git, `npm link`, or `npm install -g`.

Download the OS-specific wrapper from the matching GitHub Release, then run it from the project you want SessionMap to analyze.

macOS or Linux:

```bash
cd /path/to/your/project
/path/to/sessionmap-beta.sh start
/path/to/sessionmap-beta.sh scan
/path/to/sessionmap-beta.sh status
/path/to/sessionmap-beta.sh explain src
```

Windows PowerShell:

```powershell
cd C:\path\to\your\project
C:\path\to\sessionmap-beta.ps1 start
C:\path\to\sessionmap-beta.ps1 scan
C:\path\to\sessionmap-beta.ps1 status
C:\path\to\sessionmap-beta.ps1 explain src
```

Windows Command Prompt:

```bat
cd C:\path\to\your\project
C:\path\to\sessionmap-beta.cmd start
C:\path\to\sessionmap-beta.cmd scan
C:\path\to\sessionmap-beta.cmd status
C:\path\to\sessionmap-beta.cmd explain src
```

Full tester instructions are in [docs/BETA_TESTING.md](docs/BETA_TESTING.md).

### B. Use This GitHub Clone Directly

```bash
git clone <your-repo-url>
cd /path/to/SessionMap
npm install
npm run build
```

Run the built CLI directly from the other repository you want SessionMap to analyze:

```bash
cd /path/to/your/project
node /path/to/SessionMap/dist/cli.js start
node /path/to/SessionMap/dist/cli.js scan
node /path/to/SessionMap/dist/cli.js status
node /path/to/SessionMap/dist/cli.js explain src
```

If you want a local shell command while developing SessionMap itself, `npm link` still works on machines where global npm linking is permitted. It is a contributor convenience, not the recommended tester path.

### C. Future npm Install Path

The repo is already package-safe and publish-ready, but the public npm package is not the supported path yet. Once public publish happens, users will be able to use:

```bash
npx sessionmap start
```

or:

```bash
npm install -g sessionmap
sessionmap start
```

Until then, use the GitHub beta wrappers or the direct `node /path/to/SessionMap/dist/cli.js` path above.

### How It Works With Another Repo

SessionMap runs as a local CLI and daemon against the current working directory. It analyzes the repository you run it in, but SessionMap itself is launched either from a beta wrapper or from its own source repository.

Think of it as two separate locations:
- `/path/to/SessionMap` is where the SessionMap source repo lives if you cloned it
- `/path/to/your/project` is the other repository you want SessionMap to analyze

You always run the wrapper or CLI from `/path/to/your/project`, because that target project is what SessionMap will scan, watch, explain, and track.

### Common Mistakes

1. Running `npm install` inside the target repo only installs that repo's own dependencies and shows that repo's audit output. It does not install SessionMap into the repo.
2. Running SessionMap from the wrong directory points it at the wrong project. Change into `/path/to/your/project` before running the wrapper or CLI unless you are intentionally using `--project-root`.

## Quick Start

Choose one command form first:

- Beta testers: use the wrapper for your OS from the matching GitHub Release
- Local clone users: use `node /path/to/SessionMap/dist/cli.js`

Example beta flow on macOS or Linux:

```bash
cd /path/to/your/project
/path/to/sessionmap-beta.sh start
/path/to/sessionmap-beta.sh scan
/path/to/sessionmap-beta.sh status
/path/to/sessionmap-beta.sh explain src
```

Example local-clone flow:

```bash
cd /path/to/your/project
node /path/to/SessionMap/dist/cli.js start
node /path/to/SessionMap/dist/cli.js scan
node /path/to/SessionMap/dist/cli.js status
node /path/to/SessionMap/dist/cli.js explain src
```

In the examples below, `sessionmap` means “the command form you chose above.” Replace it with your beta wrapper or with `node /path/to/SessionMap/dist/cli.js` if you are not using a future npm install.

- `sessionmap start` starts the project-local daemon.
- `sessionmap scan` builds the initial graph.
- `sessionmap status` shows daemon URLs, graph counts, and generation/session status.
- `sessionmap explain src` explains a file or directory using the current graph state.

SessionMap stores its local runtime and generated artifacts inside the target project's `.sessionmap/` directory. It does not add itself to the target project's dependency graph.

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

From `/path/to/your/project`, start SessionMap and read the `webUrl` from either:

```bash
sessionmap start
```

or

```bash
sessionmap status
```

Open the reported `webUrl` in your browser. The dashboard reflects the current target repo whether you launched SessionMap from a beta wrapper, a local clone, or a future npm install.

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

If you are using the beta release channel, replace `sessionmap` with the wrapper for your OS. If you are using a local clone, replace it with `node /path/to/SessionMap/dist/cli.js`.

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
- Public npm publish is deferred for now; external testers should use the GitHub beta release wrappers or a local clone.

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
- [docs/BETA_TESTING.md](docs/BETA_TESTING.md) — cross-OS tester setup using GitHub beta release wrappers
- [docs/RELEASE.md](docs/RELEASE.md) — manual npm release and publish checks
- [AGENTS.md](AGENTS.md) — contributor and agent workflow rules

## Current Product Position

SessionMap is MVP-complete for local, single-user use. It is designed to help you understand AI-assisted changes, give agents project-aware context, and keep generated context local to your machine.
