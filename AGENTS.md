# Agent Rules — SessionMap

Read this file before making ANY changes. This is your operating policy. The PRD and TRD are your product and architecture references. This file tells you HOW to work; they tell you WHAT to build.

## 1. Project Context

SessionMap is a shared understanding layer for AI-assisted codebases. It gives agents project-aware context before and during changes, and gives developers session-aware explanations after changes.

**You are an AI agent building a tool designed for AI agents.** Understand the irony — and build it well.

### Key Docs
- [`AGENTS.md`](./AGENTS.md) — how to work (this file)
- [`docs/PRD.md`](./docs/PRD.md) — product intent, features, user stories
- [`docs/TRD.md`](./docs/TRD.md) — architecture, data models, API specs
- [`tasks/todo.md`](./tasks/todo.md) — current task list
- [`tasks/lessons.md`](./tasks/lessons.md) — learned patterns and mistakes

### Startup Checklist
Before generating code in a new session:
1. Review `AGENTS.md`
2. Read relevant sections of `PRD.md` and `TRD.md`
3. Read `tasks/todo.md` to understand current sprint goals
4. Read `tasks/lessons.md` to avoid past mistakes
5. Inspect the existing module code before editing

---

## 2. Workflow Orchestration

### Plan First
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, **STOP and re-plan immediately** — don't keep pushing.
- Write a plan to `tasks/todo.md` with checkable items before implementing.
- Verify the plan aligns with the TRD architecture before starting.

### Verification Before Done
- Never mark a task complete without proving it works.
- Run tests, check logs, demonstrate correctness.
- Ask yourself: "Would a senior engineer approve this?"
- If verification is skipped, say so explicitly and explain why.

### Self-Improvement Loop
- After ANY correction from the user (or another agent): update `tasks/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake.
- Review lessons at session start for this project.

### Agent Handoff
- Multiple agents may work on this project sequentially.
- **Leave the codebase in a clean, understandable state** after every session.
- If you leave work in progress, document it clearly in `tasks/todo.md`.
- Never assume the next agent has your context — make your changes self-explanatory.
- Update `tasks/lessons.md` if you discover something non-obvious.
- **Handoff Summary Format**: When completing a session, leave a summary mapping:
  - Files changed:
  - Behavior changed:
  - Docs updated:
  - Verification run:
  - Remaining risks:

---

## 3. Architecture Rules

### Module Boundaries (from TRD §4)
```
src/
├── daemon/      — Daemon lifecycle, runtime manifest, internal control plane
├── engine/      — File scanning, language detection, tree-sitter parsing
├── graph/       — Knowledge graph data structures, queries, persistence
├── session/     — Session tracking, wrapper, inference, change tracking
├── watcher/     — File watching (chokidar)
├── mcp/         — MCP server, tools, resources, prompts
├── web/         — Fastify dashboard server + static frontend
├── generator/   — .sessionmap/ context file generation
└── llm/         — Optional LLM client and summarizer
```

**Respect these boundaries:**
- Do NOT put scanner, graph, or query logic in daemon code — daemon orchestrates services and transports only.
- Do NOT put graph logic in engine code.
- Do NOT put MCP tool implementations in web routes.
- Do NOT put session inference logic in the watcher — the watcher emits events, `session/` interprets them.
- Do NOT put LLM calls in engine or graph code — LLM is an optional enhancement layer called at the edges.
- Do NOT put Fastify/HTTP concerns in MCP server code — they are separate transports.
- If a module imports from a sibling it shouldn't, the architecture is wrong. Fix the boundary, don't add the import.

### Key Interfaces (from TRD §3.2)
- `IGraphStore` — storage abstraction. MVP uses JSON. Do NOT bake JSON assumptions into graph query logic.
- `ActivitySession` — the core data primitive. Every session-related feature builds on this.
- `ChangeEvent → ChangeSet → ActivitySession` — the three-layer event model. Respect the hierarchy.

### Config & Schema Policies
- **Source of truth**: Runtime config lives in `src/config.ts`. Environment variables are allowed for secrets (like `LLM_API_KEY`) but should be parsed into the typed config object there.
- **Config changes**: If config schema or defaults change, update `docs/TRD.md` in the same task.
- **Schema & Migration**: The `ActivitySession` and `ProjectNode` models are the core schemas. If their shape changes, bump the schema version. For MVP, backward compatibility of the JSON store is not strictly required, but old state must not crash the app (wipe and rescan if version mismatch).
- **Generated Artifacts**: Files in `.sessionmap/` are generated artifacts and runtime artifacts. They are NEVER hand-edited. Source code and config are the only source of truth. After any schema or format change, regeneration is required.

### Critical Technical Constraints
- **Stdio isolation**: ALL logging MUST go to stderr, never stdout. MCP uses stdout for JSON-RPC. A single `console.log()` will break the protocol. Use a logger configured for stderr.
- **Watcher self-loops**: The `.sessionmap/` directory MUST be in the watcher ignore list. The watcher must never trigger on its own output.
- **Tree-sitter**: Use `web-tree-sitter` (WASM), NOT native bindings. This is a distribution decision — do not change it.
- **Provenance**: Every generated data point (summaries, rules, session labels) MUST carry a `source` field (`'ast' | 'heuristic' | 'llm' | 'user'`).

---

## 4. Code Quality

- **Simplicity first.** Make every change as simple as possible. Impact minimal code.
- **No laziness.** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal impact.** Changes should only touch what's necessary. Avoid introducing bugs in unrelated areas.
- **Typed everything.** This is TypeScript — use the type system. No `any` unless absolutely unavoidable and documented.
- **No hardcoding.** URLs, ports, timeouts, gap durations, file size limits — all go in config. The only hardcoded values are true constants.
- **No dead code.** Don't add speculative abstractions, unused imports, or commented-out blocks.
- **No giant files.** If a file grows large and begins mixing responsibilities (e.g. data fetching + UI rendering, or parsing + state management), split it along a clear module boundary. Let cohesion drive file size, not a strict line limit.
- **Comments are for "why", not "what".** The code should explain what it does. Comments explain non-obvious decisions.
- **Package Manager:** Use `npm`. Do not use `pnpm`, `yarn`, or `bun` unless the repo is explicitly migrated.
- **Dependencies:** Prefer existing dependencies. Do not add a new package without clear justification (e.g. don't add `lodash` if a native array method works). Avoid overlapping libraries. Document why a new dependency was added in your task summary.
- **Doc-update trigger:** If behavior, contracts, config, CLI args, or schemas change, you MUST update `docs/PRD.md` or `docs/TRD.md` in the exact same task. Do not let code and docs drift.

---

## 5. Security and Privacy

SessionMap analyzes user code locally. This creates specific obligations:

- **Never transmit source code** unless the user has explicitly opted into LLM enhancement with their own API key.
- **Never persist raw file contents.** Store structural metadata (imports, exports, relationships), not source.
- **Never log file contents** to stdout, stderr, or any log file. Log paths and metadata only.
- **Never hardcode API keys, secrets, or tokens.** LLM keys come from user config only.
- **Respect ignore patterns.** `.gitignore` + `.sessionmapignore` must be honored at every layer: scanner, watcher, generator.
- **Wrapper stdout capture** may contain sensitive agent output. Store locally only. Never transmit. Respect `session.captureStdout` and `session.maxStdoutLines` config.

---

## 6. Task Management

1. **Plan first**: Write plan to `tasks/todo.md` with checkable items.
2. **Verify plan**: Check that it aligns with PRD/TRD before starting.
3. **Track progress**: Mark items complete as you go (`[ ]` → `[x]`).
4. **Explain changes**: High-level summary at each significant step.
5. **Document results**: Add verification results to `tasks/todo.md`.
6. **Capture lessons**: Update `tasks/lessons.md` after corrections.

### Task File Format
```markdown
# Current Sprint

## [Feature/Task Name]
- [ ] Subtask 1
- [ ] Subtask 2
  - [ ] Sub-subtask
- [x] Completed task

## Blockers
- Any blocking issues

## Notes
- Non-obvious decisions or context for the next agent
```

---

## 7. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

---

## 8. Conflict and Escalation

- The PRD/TRD are the source of truth for product and architecture decisions.
- Do NOT invent new product direction during implementation.
- If current code and PRD/TRD conflict, use current code as implementation reality, but do not treat it as product truth over PRD/TRD without surfacing the conflict.
- If a change would materially alter product direction, security posture, module boundaries, or data model beyond what PRD/TRD support, **stop and ask the user**.
- Explicit user instruction overrides prior docs, but surface architectural or security concerns.
- **For straightforward implementation details within the bounds of the PRD/TRD, proceed without asking.** Do not hesitate or ask for permission to write the obvious logic.

---

## 9. Verification Commands

> **Note**: If a referenced script (like `npm run lint` or `npm run verify`) does not exist yet, **create it** in the smallest repo-appropriate way instead of skipping verification.

```bash
# Type checking
npx tsc --noEmit

# Run all tests
npm test

# Run specific test suites (Targeted Verification)
#  engine/*  -> parser/scanner tests
#  session/* -> inference/wrapper tests
#  mcp/*     -> protocol/transport tests
#  web/*     -> route/UI tests
npm test -- --grep "engine"
npm test -- --grep "session"

# Lint
npm run lint

# Full verification (Run smallest sufficient verification first, then this for broad-impact)
npm run verify
```

If these commands don't exist yet, create the npm scripts when you set up the project.

---

## 10. Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Files | kebab-case | `language-detector.ts` |
| Classes/Interfaces | PascalCase | `KnowledgeGraph`, `IGraphStore` |
| Functions/methods | camelCase | `getModuleContext()` |
| Constants | UPPER_SNAKE | `DEFAULT_SESSION_GAP_MS` |
| Types | PascalCase | `SessionActor`, `Provenance` |
| Config keys | camelCase | `inactivityGapMs` |
| CLI commands | kebab-case | `sessionmap track` |
| Test files | `*.test.ts` | `scanner.test.ts` |

---

## 11. Growth Policy

- Keep this file focused and scannable in one pass.
- If it grows too large, move detailed guidance into `docs/agent/` and keep only summaries here.
- Do not let this become a handbook.
