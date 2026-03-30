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
- In user-facing docs, explicitly separate "install SessionMap itself" from "use SessionMap on a target repo"; otherwise users may run `npm install` in the target repo and mistake that repo's npm audit output for a SessionMap problem.
- If docs depend on `npm link` to make a CLI command work, show the full sequence including `npm link` and a post-link sanity check; do not rely on a later note or assumption.
- When packaging is publish-ready but not yet actually published, the README must say that explicitly; do not present `npx <tool>` as currently available unless registry publication has really happened.
- Packaging verification should use an isolated writable `npm_config_cache`; user-global npm caches may contain root-owned files and break `npm pack` or `npm exec`.
- For npm packaging smoke tests, extracted-tarball runtime checks are more reliable than relying on `npm exec` cache state in sandboxed or mixed-permission environments.
- In install docs, describe the analyzed repo generically as the user's target project; do not hardcode or name a specific example project unless the user explicitly asks for that exact example.
- When npm publish is deferred but external testers still need easy setup, prefer versioned GitHub Release tarballs plus OS-specific wrappers over `npm link` or git-based npm installs.
