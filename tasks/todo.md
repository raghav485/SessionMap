# Current Sprint

## Source Install Simplification
- [x] Replace the wrapper- and publish-first install story with a standard source install flow based on `npm install -g .`
- [x] Remove beta-wrapper scripts, docs, and tests from the repo and package scripts
- [x] Update `README.md`, `docs/PRD.md`, `docs/TRD.md`, and `docs/RELEASE.md` to present one machine-level install story and keep `npm link` as contributor-only
- [x] Add smoke coverage for `npm install -g . --prefix <temp-prefix>` and confirm the installed CLI works from another project root
- [x] Run targeted verification and record results
- [x] Leave handoff summary

## Source Install Simplification Verification
- `npm run build`
- `npx tsc --noEmit`
- `npm run lint`
- `node dist/cli.js --help`
- `npm run pack:check`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/release/npm-package.test.ts`

## Source Install Simplification Handoff Summary
- Files changed:
  - `.gitignore`
  - `README.md`
  - `docs/PRD.md`
  - `docs/RELEASE.md`
  - `docs/TRD.md`
  - `package.json`
  - `tasks/lessons.md`
  - `tasks/todo.md`
  - `test/release/npm-package.test.ts`
- Files removed:
  - `docs/BETA_TESTING.md`
  - `scripts/create-beta-release.mjs`
  - `scripts/beta/sessionmap-beta.sh`
  - `scripts/beta/sessionmap-beta.ps1`
  - `scripts/beta/sessionmap-beta.cmd`
  - `test/release/beta-launchers.test.ts`
- Behavior changed:
  - The only supported pre-publish user install path is now clone/build plus `npm install -g .`, followed by plain `sessionmap ...` in any target repo.
  - `npm link` remains documented as a contributor convenience, not the default user workflow.
  - The beta-wrapper distribution path was removed from the repo and public docs.
  - Release smoke coverage now proves the real install path by installing into a temp prefix and running the installed CLI.
- Docs updated:
  - `README.md`
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `docs/RELEASE.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `npm run build`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `node dist/cli.js --help`
  - `npm run pack:check`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/release/npm-package.test.ts`
- Remaining risks:
  - Users whose Node/npm global environment does not expose global binaries correctly may still need normal machine-level npm/PATH troubleshooting outside this repo.
  - `package-lock.json` was already dirty in the worktree before this task and was left untouched.

## npm Packaging: `sessionmap`
- [x] Update `package.json` for npm publishing metadata, MIT licensing, and publish allowlist
- [x] Add local tarball verification tooling and package smoke coverage
- [x] Validate packaged runtime layout for daemon launch, web assets, and bundled grammars
- [x] Rewrite `README.md` for npm-first `npx sessionmap` usage while retaining contributor source-install docs
- [x] Update `docs/PRD.md`, `docs/TRD.md`, and add `docs/RELEASE.md` for npm distribution
- [x] Run packaging verification commands and record results
- [x] Leave packaging handoff summary

## npm Packaging Verification
- `node dist/cli.js --help`
- `npm run pack:check`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/release/npm-package.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (required escalation for loopback daemon tests in this environment)
- `npm run verify` (required escalation for loopback daemon tests and Playwright)

## npm Packaging Handoff Summary
- Files changed:
  - `package.json`
  - `LICENSE`
  - `README.md`
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `docs/RELEASE.md`
  - `scripts/verify-pack.mjs`
  - `test/release/npm-package.test.ts`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Behavior changed:
  - The repo is now publish-ready as an npm CLI package named `sessionmap` instead of a private source-only package.
  - Package tarballs now whitelist runtime assets (`dist`, `grammars`, `README.md`, `LICENSE`) and exclude dev-only repo directories.
  - Local pack verification uses an isolated npm cache so packaging checks do not fail on machines with broken global npm cache permissions.
  - README onboarding is npm-first with `npx sessionmap` and `npm install -g sessionmap`; source install is now contributor-focused.
- Docs updated:
  - `README.md`
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `docs/RELEASE.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `node dist/cli.js --help`
  - `npm run pack:check`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/release/npm-package.test.ts`
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm test` (escalated)
  - `npm run verify` (escalated)
- Remaining risks:
  - The exact unscoped npm package name `sessionmap` was not claimed or published in this task; actual release is still blocked until ownership/availability is confirmed.
  - README now documents the npm-first public path, but those commands depend on a real `npm publish` still being completed.
  - Manual public-registry smoke using `npm exec --package <tgz>` was documented in `docs/RELEASE.md` but not used as the automated test path because local tarball extraction is more reliable than npm cache state in this environment.

## README Publish-State Clarification
- [x] Align `README.md` installation language with the current repo state: publish-ready metadata, but not necessarily already published to npm
- [x] Keep both npm and source-clone workflows documented without implying that npm publication already happened
- [x] Update limitations and docs index to reflect `docs/RELEASE.md`
- [x] Verify the updated README against the current CLI and package metadata

## README Publish-State Clarification Verification
- Confirmed `README.md` no longer claims `package.json` is private
- Confirmed `README.md` distinguishes npm-published usage from direct GitHub-clone usage
- Confirmed `README.md` limitations now describe publish readiness vs actual publication
- Confirmed `README.md` links to `docs/RELEASE.md`
- Ran `node dist/cli.js --help` to confirm the documented CLI surface still matches the built CLI

## README Publish-State Clarification Handoff Summary
- Files changed:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Behavior changed:
  - No runtime behavior changed; the README now reflects the current repo reality instead of assuming npm publication has already happened.
- Docs updated:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `node dist/cli.js --help`
  - `README.md` cross-checked against `package.json`
- Remaining risks:
  - Until `npm publish` actually happens, README users still need to understand that `npx sessionmap` depends on package availability on the npm registry.

## README Target-Project Clarification
- [x] Make the "use SessionMap on another project" flow explicit with generic target-repo language
- [x] Add a direct-clone example that runs `node /path/to/SessionMap/dist/cli.js ...` from the target project
- [x] Avoid naming any specific project in the README examples
- [x] Verify the updated examples still match the built CLI entry point

## README Target-Project Clarification Verification
- Confirmed `README.md` now distinguishes the SessionMap repo location from the user's target project location
- Confirmed the README now includes a generic direct-clone target-project example using `node /path/to/SessionMap/dist/cli.js`
- Ran `node dist/cli.js --help` to confirm the documented CLI entry point still matches the built artifact

## README Target-Project Clarification Handoff Summary
- Files changed:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Behavior changed:
  - No runtime behavior changed; the README now makes the target-project execution model more explicit without referring to any specific project by name.
- Docs updated:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `node dist/cli.js --help`
- Remaining risks:
  - Until npm publication actually happens, some readers may still need the direct-clone `node /path/to/SessionMap/dist/cli.js ...` path more than the npm examples.

## Beta Distribution For Cross-OS Testers
- [x] Add a beta-release contract and prep flow built on the existing npm tarball
- [x] Add generated OS-specific launchers for macOS/Linux, PowerShell, and CMD that pin a GitHub Release tarball URL
- [x] Document beta tester setup and maintainer beta-release steps in `README.md`, `docs/BETA_TESTING.md`, and `docs/RELEASE.md`
- [x] Add verification coverage for wrapper generation and argument-forwarding shape
- [x] Run targeted beta-distribution verification and record results
- [x] Leave beta-distribution handoff summary

## Beta Distribution Verification
- `node dist/cli.js --help`
- `node scripts/create-beta-release.mjs --help`
- `npm run beta:check`
- `node scripts/create-beta-release.mjs --tag v0.1.0-beta.1 --output-dir /tmp/sessionmap-beta-release.kK89w2 --skip-release-check`
- `npx tsc --noEmit`
- `npm run lint`

## Beta Distribution Handoff Summary
- Files changed:
  - `.gitignore`
  - `package.json`
  - `README.md`
  - `docs/BETA_TESTING.md`
  - `docs/RELEASE.md`
  - `scripts/create-beta-release.mjs`
  - `scripts/beta/sessionmap-beta.sh`
  - `scripts/beta/sessionmap-beta.ps1`
  - `scripts/beta/sessionmap-beta.cmd`
  - `test/release/beta-launchers.test.ts`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Behavior changed:
  - Added a beta-release prep flow that packages the existing npm tarball into `out/beta-release/` and generates pinned macOS/Linux, PowerShell, and CMD wrappers for GitHub Release distribution.
  - Added repo scripts `beta:bundle` and `beta:check` to support repeatable beta release prep and wrapper verification.
  - External tester docs now point to GitHub beta release wrappers instead of `npm link` or unpublished npm install paths.
- Docs updated:
  - `README.md`
  - `docs/BETA_TESTING.md`
  - `docs/RELEASE.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `node dist/cli.js --help`
  - `node scripts/create-beta-release.mjs --help`
  - `npm run beta:check`
  - `node scripts/create-beta-release.mjs --tag v0.1.0-beta.1 --output-dir /tmp/sessionmap-beta-release.kK89w2 --skip-release-check`
  - `npx tsc --noEmit`
  - `npm run lint`
- Remaining risks:
  - Testers still need Node.js, npm, and a terminal; this beta path is easier than source install but not a no-terminal installer.
  - Cross-OS wrapper execution is only partially automated; Windows PowerShell and CMD behavior still need real-machine manual validation per beta release.
  - Public npm installation remains deferred, so external users must use the wrapper path or a local clone until publish happens.

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

## README Installation Clarification
- [x] Clarify SessionMap repo vs target repo install flow
- [x] Add common-mistake troubleshooting note for `npm install` in the target repo
- [x] Validate README command examples against current CLI and package scripts
- [x] Record doc verification results

## README Installation Clarification Verification
- Confirmed `README.md` now distinguishes `/path/to/SessionMap` from `/path/to/your/project`
- Confirmed the README states SessionMap is source-installed, not npm-published, and not added to the target repo's `package.json`
- Confirmed the README troubleshooting note explains that target-repo `npm audit` output is unrelated to SessionMap installation
- Ran `node dist/cli.js --help` to confirm the documented command surface still matches the built CLI

## README Installation Clarification Handoff Summary
- Files changed:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Behavior changed:
  - No runtime behavior changed; the README now explicitly separates installing SessionMap itself from using it against a target repository.
- Docs updated:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `node dist/cli.js --help`
  - command list cross-checked against `src/cli.ts`
- Remaining risks:
  - The repo is still source-installed and not npm-published, so users who expect package-manager installation may still need the README's installation distinction.

## README CLI Availability Clarification
- [x] Add explicit linked CLI workflow from clone to `sessionmap start`
- [x] Add explicit no-link fallback workflow using `node /path/to/SessionMap/dist/cli.js`
- [x] Add `command not found` troubleshooting and distinguish it from target-repo `npm install` output
- [x] Validate README command sequences against the current CLI and built artifact
- [x] Record verification results
- [x] Leave handoff summary

## README CLI Availability Clarification Verification
- Confirmed `README.md` now shows a complete linked workflow and a complete no-link fallback workflow
- Confirmed the README explains that `npm link` is the step that makes `sessionmap` available as a shell command
- Confirmed the README explains `command not found` as a CLI-availability issue, not a build failure
- Confirmed the fallback examples use `node /path/to/SessionMap/dist/cli.js`

## README CLI Availability Clarification Handoff Summary
- Files changed:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Behavior changed:
  - No runtime behavior changed; the README now shows the exact steps required to make the `sessionmap` command available, plus the direct no-link fallback.
- Docs updated:
  - `README.md`
  - `tasks/todo.md`
  - `tasks/lessons.md`
- Verification run:
  - `node dist/cli.js --help`
  - command list cross-checked against `src/cli.ts`
  - `package.json` cross-checked for `private` and `bin.sessionmap`
- Remaining risks:
  - The repo still depends on a source-install workflow, so users expecting package-manager installation may still skip `npm link` unless they follow one of the explicit README flows exactly.
