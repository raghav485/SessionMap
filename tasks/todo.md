# Current Sprint

## Universal Static Graph Upgrade
- [x] Add importer-scoped workspace metadata so dependency resolution honors declared workspaces plus nearest package/app config context
- [x] Extend project graph contracts with focused directory drilldown metadata and route support for `drilldown`
- [x] Replace focused file spray with hierarchical directory-first drilldown while preserving top-level orchestration files only when they connect across multiple child directories
- [x] Update dashboard routing, state, graph UI, and copy for breadcrumb/back drilldown behavior
- [x] Expand resolver, graph-query, route, and dashboard verification for workspace resolution and hierarchical focused graphs
- [x] Update `docs/PRD.md`, `docs/TRD.md`, and record verification plus handoff summary

## Universal Static Graph Upgrade Verification
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/engine/dependency-resolver.test.ts test/graph/graph-query.test.ts`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (required escalation for daemon-backed loopback startup in this environment)
- `npx playwright test test/web/dashboard.test.ts` (required escalation for browser and loopback access in this environment)

## Universal Static Graph Upgrade Handoff Summary
- Files changed:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `src/engine/dependency-resolver.ts`
  - `src/graph/graph-query.ts`
  - `src/types.ts`
  - `src/web/app/api.ts`
  - `src/web/app/main.ts`
  - `src/web/app/router.ts`
  - `src/web/app/styles.css`
  - `src/web/app/views/graph-view.ts`
  - `src/web/routes.ts`
  - `tasks/lessons.md`
  - `tasks/todo.md`
  - `test/engine/dependency-resolver.test.ts`
  - `test/fixtures/monorepo-project/apps/api/src/index.ts`
  - `test/fixtures/monorepo-project/apps/api/src/auth/service.ts`
  - `test/fixtures/monorepo-project/apps/api/src/billing/service.ts`
  - `test/fixtures/monorepo-project/apps/api/src/services/hosted.ts`
  - `test/fixtures/monorepo-project/apps/api/tsconfig.json`
  - `test/fixtures/monorepo-project/packages/contracts/package.json`
  - `test/fixtures/monorepo-project/packages/contracts/src/runtime/logger.ts`
  - `test/graph/graph-query.test.ts`
  - `test/web/dashboard.test.ts`
  - `test/web/routes.test.ts`
- Behavior changed:
  - Project overview remains architecture-first, but focused graphs now drill by directory instead of exploding straight into a flat file star. Child directories render as graph nodes, root orchestration files stay visible when they connect across sibling directories, and raw files appear only at the deepest relevant layer.
  - `/api/graph` and the dashboard hash route now support `drilldown=<relative-directory-path>` alongside `focus`, and graph responses include breadcrumb metadata so the UI can step through a focused unit cleanly.
  - TS/JS import resolution now keeps alias resolution scoped to the config that declared it, merges inherited config chains, and respects declared package-manager workspaces when deciding which nested packages are local workspace packages.
- Docs updated:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/lessons.md`
  - `tasks/todo.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run lint`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/engine/dependency-resolver.test.ts test/graph/graph-query.test.ts`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (escalated for loopback startup)
  - `npx playwright test test/web/dashboard.test.ts` (escalated for browser and loopback access)
- Remaining risks:
  - Focus-mode back navigation still steps through the explicit route state, so an auto-descended focus root can require one extra `Back` click before returning to the overview if the user previously drilled into a child directory.
  - Runtime-only relationships such as HTTP, IPC, registries, and env-selected wiring remain intentionally out of scope; the graph is now more readable and more correct for static structure, but it is still strictly static.

## Automatic Agent Tracking On Start
- [x] Replace wrapper-only tracking with daemon-armed automatic agent session tracking
- [x] Update session source/status/overview types for `auto-daemon`, `trackingMode`, and `activeSessionId`
- [x] Remove the `track` CLI command and wrapper path
- [x] Update session/dashboard copy and PRD/TRD docs for start-based automatic tracking
- [x] Refresh CLI, session, MCP, web, and dashboard verification for auto tracking
- [x] Record verification and leave handoff summary

## Automatic Agent Tracking On Start Verification
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/session/session-tracker.test.ts test/session/inferrer.test.ts test/mcp/service.test.ts test/cli/cli.test.ts`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/cli/cli.test.ts test/web/routes.test.ts test/web/live-updates.test.ts test/mcp/http-server.test.ts` (required escalation for loopback daemon startup in this environment)
- `npx playwright test test/web/dashboard.test.ts` (required escalation for browser launch and daemon-backed dashboard verification in this environment)

## Automatic Agent Tracking On Start Handoff Summary
- Files changed:
  - `README.md`
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `src/cli.ts`
  - `src/daemon/main.ts`
  - `src/mcp/register.ts`
  - `src/mcp/service.ts`
  - `src/session/session-query.ts`
  - `src/session/session-tracker.ts`
  - `src/types.ts`
  - `src/web/app/components/session-digest.ts`
  - `src/web/app/views/sessions-view.ts`
  - `src/web/routes.ts`
  - `src/web/server.ts`
  - `tasks/lessons.md`
  - `tasks/todo.md`
  - `test/cli/cli.test.ts`
  - `test/mcp/http-server.test.ts`
  - `test/mcp/service.test.ts`
  - `test/session/inferrer.test.ts`
  - `test/session/session-tracker.test.ts`
  - `test/web/dashboard.test.ts`
  - `test/web/live-updates.test.ts`
  - `test/web/routes.test.ts`
- Behavior changed:
  - `sessionmap start` now arms automatic session tracking, and the first post-start file changes create `auto-daemon` sessions with actor `agent` instead of requiring `sessionmap track -- ...`.
  - Status and overview surfaces now report `trackingMode` plus `activeSessionId`, while explicit MCP sessions temporarily override automatic tracking when active.
  - The CLI `track` command and wrapper path were removed, and user-facing copy now tells users to start SessionMap and make changes instead of wrapping commands.
- Docs updated:
  - `README.md`
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/lessons.md`
  - `tasks/todo.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/session/session-tracker.test.ts test/session/inferrer.test.ts test/mcp/service.test.ts test/cli/cli.test.ts`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/cli/cli.test.ts test/web/routes.test.ts test/web/live-updates.test.ts test/mcp/http-server.test.ts` (escalated for loopback daemon startup)
  - `npx playwright test test/web/dashboard.test.ts` (escalated for browser and loopback access)
- Remaining risks:
  - Legacy persisted sessions with `watcher-inferred` and `explicit-wrapper` remain readable for compatibility, so some legacy source labels still appear in backward-compat tests and old state.
  - Runtime session attribution is still file-change-driven; runtime-only work that produces no file edits will not create an automatic session until changes hit disk.

## Generic Architecture Extraction And Focus Mode
- [x] Add a generic architecture-projection layer for package/app roots, entrypoint-root signals, and heuristic fallback grouping
- [x] Improve TS/JS dependency resolution for nearest `tsconfig`/`jsconfig` contexts plus local workspace package imports and subpaths
- [x] Replace project overview graph aggregation with architecture units and package-level relationship signals
- [x] Add Project focus mode so clicking an overview module isolates that unit's internal file graph with a back control
- [x] Update web routes, dashboard state, and graph UI for `focus`, focused file graphs, and architecture metadata
- [x] Add resolver, graph-query, route, and dashboard verification for monorepo/package overview and focus mode
- [x] Update `docs/PRD.md`, `docs/TRD.md`, and `tasks/lessons.md`
- [x] Record verification and leave handoff summary

## Generic Architecture Extraction And Focus Mode Verification
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/engine/dependency-resolver.test.ts test/graph/graph-query.test.ts`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (required escalation for loopback daemon startup in this environment)
- `npx playwright test test/web/dashboard.test.ts` (required escalation for Chromium launch and daemon-backed dashboard verification in this environment)

## Generic Architecture Extraction And Focus Mode Handoff Summary
- Files changed:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `src/engine/dependency-resolver.ts`
  - `src/graph/architecture-projection.ts`
  - `src/graph/graph-query.ts`
  - `src/types.ts`
  - `src/web/app/api.ts`
  - `src/web/app/components/graph-canvas.ts`
  - `src/web/app/main.ts`
  - `src/web/app/router.ts`
  - `src/web/app/state.ts`
  - `src/web/app/styles.css`
  - `src/web/app/views/graph-view.ts`
  - `src/web/routes.ts`
  - `tasks/lessons.md`
  - `tasks/todo.md`
  - `test/engine/dependency-resolver.test.ts`
  - `test/fixtures/monorepo-project/*`
  - `test/graph/graph-query.test.ts`
  - `test/web/dashboard.test.ts`
  - `test/web/routes.test.ts`
- Behavior changed:
  - Project graph overview is now architecture-first and generic: it prefers discovered package/app roots and statically declared entrypoint roots, then falls back to heuristic source-grouping for simpler repos.
  - TS/JS dependency resolution now uses nearest `tsconfig`/`jsconfig` contexts and resolves local workspace package imports and subpaths, so monorepo package edges show up as internal structure instead of external gaps.
  - Project overview nodes now carry architecture-unit metadata, aggregated edges expose relationship-source kinds, and clicking an overview node enters Focus Mode for that unit's internal file graph.
- Docs updated:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/lessons.md`
  - `tasks/todo.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/engine/dependency-resolver.test.ts test/graph/graph-query.test.ts`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (escalated)
  - `npx playwright test test/web/dashboard.test.ts` (escalated)
- Remaining risks:
  - Runtime-only architecture edges such as HTTP boundaries, message buses, registries, and env-selected wiring are still intentionally out of scope for this pass and remain future detector work.
  - Architecture-unit detection is now signal-driven rather than repo-specific, but unusual repos without nested manifests or static entrypoint hints still depend on the fallback heuristics.

## Sparse Project Graph Fallback
- [x] Extend `GraphResponse` with sparse-fallback metadata and bounded hidden previews
- [x] Keep project graph filtering, but add fallback detection for sparse module/file views with hidden-item previews
- [x] Add dashboard hidden-item side panel behavior with clickable chips and fallback-aware empty state
- [x] Update graph-query, route, and dashboard verification to cover sparse-project fallback behavior
- [x] Update `docs/PRD.md` and `docs/TRD.md` for sparse fallback and hidden-item side lists
- [x] Record verification and leave handoff summary

## Sparse Project Graph Fallback Verification
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/graph/graph-query.test.ts`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts`
- `npx playwright test test/web/dashboard.test.ts`

## Sparse Project Graph Fallback Handoff Summary
- Files changed:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `src/constants.ts`
  - `src/graph/graph-query.ts`
  - `src/types.ts`
  - `src/web/app/main.ts`
  - `src/web/app/state.ts`
  - `src/web/app/styles.css`
  - `src/web/app/views/graph-view.ts`
  - `tasks/lessons.md`
  - `tasks/todo.md`
  - `test/fixtures/sparse-project/package.json`
  - `test/fixtures/sparse-project/tsconfig.json`
  - `test/fixtures/sparse-project/styles.css`
  - `test/fixtures/sparse-project/src/main.ts`
  - `test/fixtures/sparse-project/src/utils/helper.ts`
  - `test/fixtures/sparse-project/src/services/api.ts`
  - `test/graph/graph-query.test.ts`
  - `test/web/dashboard.test.ts`
  - `test/web/routes.test.ts`
- Behavior changed:
  - Project graphs now expose `fallbackApplied` plus bounded `hiddenPreview` payloads so sparse project views can recover without dumping every hidden node into the canvas.
  - When a filtered project graph would show fewer than three nodes, the dashboard now auto-opens a hidden-items side list, preferring isolated architecture groups first.
  - Hidden summary chips are now clickable, switch the side-list category, and let users drill into Explorer even when the graph itself is intentionally sparse.
- Docs updated:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/lessons.md`
  - `tasks/todo.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/graph/graph-query.test.ts`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (required escalation for loopback daemon startup in this environment)
  - `npx playwright test test/web/dashboard.test.ts` (required escalation for Chromium launch and daemon-backed dashboard verification in this environment)
- Remaining risks:
  - The sparse fallback still depends on the current heuristic grouping and support-file classification, so unusual repo layouts may still need future tuning.
  - `/api/graph` still accepts `showIsolated` as a temporary compatibility alias during the `showHidden` transition.

## Project Graph Architecture View
- [x] Replace project graph aggregation with a graph-specific architecture grouping strategy instead of raw `moduleBoundary`
- [x] Hide support/noise files by default, preserve latest-session touched files, and expose `hiddenSummary` plus `showHidden`
- [x] Update `/api/graph`, shared types, and dashboard state/UI from `showIsolated` to `showHidden` while accepting the old query alias temporarily
- [x] Replace the isolated-only banner with hidden-summary chips and keep Explorer drill-in behavior for module/group and file nodes
- [x] Update graph-query, web route, and dashboard tests for architecture-first project graphs
- [x] Update `docs/PRD.md` and `docs/TRD.md` for the architecture-first graph behavior
- [x] Record verification and leave handoff summary

## Project Graph Architecture View Verification
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/graph/graph-query.test.ts`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts`
- `npx playwright test test/web/dashboard.test.ts`

## Project Graph Architecture View Handoff Summary
- Files changed:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `src/graph/graph-query.ts`
  - `src/types.ts`
  - `src/web/app/api.ts`
  - `src/web/app/main.ts`
  - `src/web/app/state.ts`
  - `src/web/app/styles.css`
  - `src/web/app/views/graph-view.ts`
  - `src/web/routes.ts`
  - `tasks/lessons.md`
  - `tasks/todo.md`
  - `test/graph/graph-query.test.ts`
  - `test/web/dashboard.test.ts`
  - `test/web/routes.test.ts`
- Behavior changed:
  - Project graphs now default to an architecture-first grouped view that uses graph-specific grouping instead of raw persisted `moduleBoundary` values.
  - Project graphs hide support/noise files and untouched isolated architecture nodes by default, while latest-session touched or impacted files still remain visible.
  - The dashboard now uses hidden-summary chips plus a `Show Hidden` toggle instead of the narrower isolated-only toggle, and module view can reveal support files alongside grouped architecture nodes when requested.
- Docs updated:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/lessons.md`
  - `tasks/todo.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/graph/graph-query.test.ts`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (required escalation for loopback daemon startup in this environment)
  - `npx playwright test test/web/dashboard.test.ts` (required escalation for Chromium launch and daemon-backed dashboard verification in this environment)
- Remaining risks:
  - The new grouping and support-file filtering are intentionally heuristic; unusual repo layouts can still need future tuning to feel perfectly architectural.
  - `/api/graph` still accepts `showIsolated` as a temporary compatibility alias during the transition to `showHidden`.

## Readable Project Graph Verification
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/graph/graph-query.test.ts`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (required escalation for loopback daemon startup in this environment)
- `npx playwright test test/web/dashboard.test.ts` (required escalation for loopback daemon startup and browser automation in this environment)

## Readable Project Graph Handoff Summary
- Files changed:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `src/constants.ts`
  - `src/graph/graph-query.ts`
  - `src/types.ts`
  - `src/web/app/api.ts`
  - `src/web/app/main.ts`
  - `src/web/app/state.ts`
  - `src/web/app/styles.css`
  - `src/web/app/views/graph-view.ts`
  - `src/web/routes.ts`
  - `tasks/lessons.md`
  - `tasks/todo.md`
  - `test/graph/graph-query.test.ts`
  - `test/web/dashboard.test.ts`
  - `test/web/routes.test.ts`
- Behavior changed:
  - Project graphs now default to module granularity and hide ordinary isolated nodes by default, while Latest Session stays file-focused.
  - Project graphs expose a file/module toggle plus isolated visibility toggle, and touched isolated work from the latest session remains visible even when isolated nodes are otherwise hidden.
  - `/api/graph` now accepts `granularity` and `showIsolated`, and the dashboard shows a compact hidden-isolated summary instead of spraying disconnected nodes.
- Docs updated:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/lessons.md`
  - `tasks/todo.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/graph/graph-query.test.ts`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (escalated)
  - `npx playwright test test/web/dashboard.test.ts` (escalated)
- Remaining risks:
  - Module aggregation uses the existing `moduleBoundary` heuristic, so odd repo layouts can still group files less intuitively than a hand-authored architecture model would.
  - The dashboard smoke covers the new project graph modes, but cross-browser interaction feel is still primarily validated through Chromium/Playwright.

## Graph Navigation For Dashboard
- [x] Add zoom and background pan support to the dependency graph canvas while preserving node drag and Explorer navigation
- [x] Add visible graph controls for zoom in, zoom out, and fit/reset
- [x] Preserve graph viewport state during same-scope refreshes and reset it on scope changes or when leaving the graph view
- [x] Update dashboard styling for graph affordance and controls
- [x] Extend dashboard verification for graph navigation and record results
- [x] Leave handoff summary

## Graph Navigation Verification
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (required escalation for loopback daemon startup in this environment)
- `npx playwright test test/web/dashboard.test.ts` (required escalation for loopback daemon startup and browser automation in this environment)

## Graph Navigation Handoff Summary
- Files changed:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `src/web/app/components/graph-canvas.ts`
  - `src/web/app/main.ts`
  - `src/web/app/state.ts`
  - `src/web/app/styles.css`
  - `src/web/app/views/graph-view.ts`
  - `tasks/todo.md`
  - `test/web/dashboard.test.ts`
- Behavior changed:
  - The dashboard dependency graph now supports wheel/trackpad zoom, background drag pan, visible zoom controls, and fit-to-view framing.
  - Node drag still repositions local layout, node click still drills into Explorer, and the viewport persists across same-scope refreshes.
  - Leaving the Graph route or switching graph scope resets the next view to a fresh fit-to-view framing.
- Docs updated:
  - `docs/PRD.md`
  - `docs/TRD.md`
  - `tasks/todo.md`
- Verification run:
  - `npx tsc --noEmit`
  - `npm run lint`
  - `npm run build`
  - `node scripts/run-vitest.mjs run --testTimeout=15000 test/web/routes.test.ts` (escalated)
  - `npx playwright test test/web/dashboard.test.ts` (escalated)
- Remaining risks:
  - The dashboard browser proof covers zoom, pan, route reset, and Explorer drill-in, but cross-browser input feel is still primarily validated through Chromium/Playwright.
  - Loopback daemon-backed web verification needs escalation in this environment, so local failures there can still be sandbox-related rather than product regressions.

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
