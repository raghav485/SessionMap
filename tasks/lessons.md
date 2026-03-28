# Lessons Learned

## Active Rules
- Read `AGENTS.md`, `docs/PRD.md`, `docs/TRD.md`, `tasks/todo.md`, and `tasks/lessons.md` before non-trivial changes.
- Write or update `tasks/todo.md` before implementation and record verification results before closing work.
- Keep logging on stderr only; stdout is reserved for CLI output and future MCP protocol traffic.
- Generated `.sessionmap/` artifacts are never hand-edited and must be excluded from analysis inputs.
- Daemon integration verification may require escalated permissions when the sandbox blocks loopback port binding on `127.0.0.1`.
- Resolve daemon-served static asset paths from the server module location, not `process.cwd()`, because the daemon runs against arbitrary project roots.
- Scope Vitest explicitly to `test/**/*.test.ts` so dependency package tests in `node_modules` are not collected during repo verification.
- For targeted Vitest suites, prefer a concrete directory like `vitest run test/mcp` over shell-style globs in npm scripts; it is more reliable across npm/shell execution paths.
- The AGENTS-required command `npm test -- --grep "<pattern>"` is not supported directly by the current Vitest CLI in this repo; keep `scripts/run-vitest.mjs` in place so targeted verification keeps working.
- When heuristic extractors collapse syntax into `ParsedImport`, preserve enough path semantics in the specifier for the resolver to distinguish relative imports from package imports; otherwise downstream graph edges and incremental re-resolution will silently degrade.
