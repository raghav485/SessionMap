# Current Sprint

## Milestone 6: Tier 2 Language Support And MVP Hardening
- [x] Update `docs/PRD.md` and `docs/TRD.md` for Milestone 6 scope, bundled TS/JS grammar assets, heuristic Tier 2 extractor strategy, and MVP hardening acceptance
- [x] Replace TS/JS special-casing in `src/engine/analyzer.ts` with a language-dispatch extraction pipeline
- [x] Bundle `grammars/tree-sitter-typescript.wasm` and `grammars/tree-sitter-javascript.wasm` and harden grammar path resolution for built/runtime use
- [x] Extend `src/engine/dependency-resolver.ts` into language-aware resolution helpers for Python, Go, Rust, Java, C#, Ruby, and PHP
- [x] Add deterministic Tier 2 import/export extractors for Python, Go, Rust, Java, C#, Ruby, and PHP
- [x] Expand `src/engine/tech-stack-detector.ts` to recognize major non-JS ecosystems and package managers
- [x] Ensure `scan`, `explain`, dashboard Explorer, and MCP dependency/module-context flows consume Tier 2 graph data without transport changes
- [x] Add Tier 2 fixtures and tests for extractor behavior, graph edges, explain output, and grammar readiness
- [x] Verify `.sessionmap/` ignore behavior, stale-manifest/schema recovery, and incremental benchmark remain intact
- [x] Run `npx tsc --noEmit`
- [x] Run `npm run lint`
- [x] Run `npm test -- --grep "engine"`
- [x] Run `npm test`
- [x] Run `npm run verify`
- [x] Leave milestone handoff summary

## Blockers
- Verification that binds `127.0.0.1` or launches a browser still requires escalation in this environment.

## Notes
- Tier 2 provenance stays `heuristic` in this milestone; only TS/JS should report `source: "ast"` when grammar assets are present.
- `npm test -- --grep ...` remains supported through `scripts/run-vitest.mjs`; use the AGENTS-specified targeted verification commands instead of ad hoc Vitest flags.
- TS/JS grammars are now bundled under `grammars/` and resolved from the parser module location so both `src/` and built `dist/` runtimes load the same assets.
- Tier 2 coverage is heuristic and file-level: Python, Go, Rust, Java, C#, Ruby, and PHP now emit imports, exports, dependency metadata, and non-JS tech stack hints through the existing graph/query surfaces.

## Verification
- `npx tsc --noEmit`
- `npm run lint`
- `npm test -- --grep "engine"`
- `npm run verify` (escalated to allow loopback daemon tests and Playwright browser checks)
- `npm run verify` passed with `incremental benchmark median=1ms samples=1,2,0,1,0`

## Handoff Summary
- Files changed:
  - `docs/PRD.md`, `docs/TRD.md`, `tasks/todo.md`, `tasks/lessons.md`
  - `grammars/tree-sitter-typescript.wasm`, `grammars/tree-sitter-javascript.wasm`
  - `src/constants.ts`
  - `src/engine/analyzer.ts`
  - `src/engine/dependency-resolver.ts`
  - `src/engine/tree-sitter-parser.ts`
  - `src/engine/tech-stack-detector.ts`
  - `src/engine/import-extractors/python.ts`
  - `src/engine/import-extractors/go.ts`
  - `src/engine/import-extractors/rust.ts`
  - `src/engine/import-extractors/java.ts`
  - `src/engine/import-extractors/csharp.ts`
  - `src/engine/import-extractors/ruby.ts`
  - `src/engine/import-extractors/php.ts`
  - `src/daemon/main.ts`
  - `test/engine/tree-sitter-parser.test.ts`
  - `test/engine/tier2-python.test.ts`
  - `test/engine/tier2-go.test.ts`
  - `test/engine/tier2-rust.test.ts`
  - `test/engine/tier2-java.test.ts`
  - `test/engine/tier2-csharp.test.ts`
  - `test/engine/tier2-ruby.test.ts`
  - `test/engine/tier2-php.test.ts`
  - `test/mcp/service.test.ts`
  - `test/fixtures/tier2-python/**`
  - `test/fixtures/tier2-go/**`
  - `test/fixtures/tier2-rust/**`
  - `test/fixtures/tier2-java/**`
  - `test/fixtures/tier2-csharp/**`
  - `test/fixtures/tier2-ruby/**`
  - `test/fixtures/tier2-php/**`
- Behavior changed:
  - TS/JS analysis now uses bundled grammars by default and reports `source: "ast"` when they are available.
  - Tier 2 languages now emit heuristic imports, exports, internal dependency edges, external dependencies, and unresolved imports instead of Tier 3-style empty structural analysis.
  - Non-JS tech stack detection now recognizes Python, Go, Rust, Java, C#, Ruby, and PHP ecosystem files and package managers.
  - Existing `scan`, `explain`, dashboard, MCP, and incremental update flows now surface Tier 2 graph data without new transports or commands.
- Docs updated:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test -- --grep "engine"`
  - `npm run verify`
- Remaining risks:
  - Tier 2 resolution is intentionally conservative and heuristic, so some real-world multi-file package layouts may remain unresolved instead of producing edges.
  - Go and C# resolution are file-level approximations over package/namespace systems; they are designed to avoid false positives, not to model every legal project layout.

## Repository Docs: GitHub README
- [x] Add a root `README.md` for GitHub users that explains what SessionMap does
- [x] Document source-install usage from a cloned repo with `npm install`, `npm run build`, and `npm link`
- [x] Document current CLI, dashboard, MCP, generated artifacts, language tiers, configuration, and limitations
- [x] Verify README command references and repo-doc links against the current repo state

## README Verification
- Confirmed the documented CLI commands exist in `src/cli.ts`
- Confirmed install/build commands match `package.json`
- Confirmed doc links exist: `docs/PRD.md`, `docs/TRD.md`, `AGENTS.md`
