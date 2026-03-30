# SessionMap Release Guide

This document covers the current beta-release flow for external testers and the future public npm release flow.

## Beta Release Channel

Use the beta channel while public npm publish is deferred. The beta flow ships a versioned npm tarball plus OS-specific wrappers that call it through `npm exec`.

### Beta Preconditions

- The repo is in a releasable state.
- `package.json`, `README.md`, [docs/BETA_TESTING.md](./BETA_TESTING.md), and `LICENSE` are up to date.
- You have chosen a beta release tag such as `v0.1.0-beta.1`.
- The target GitHub repo release will host these assets:
  - `sessionmap-<version>.tgz`
  - `sessionmap-beta.sh`
  - `sessionmap-beta.ps1`
  - `sessionmap-beta.cmd`

### Prepare Beta Assets

1. Run targeted beta verification:
   - `npm run beta:check`
2. Run the beta bundle script with the intended release tag:
   - `npm run beta:bundle -- --tag v0.1.0-beta.1`
3. Review the generated output under:
   - `out/beta-release/`

The beta bundle script:

- runs `npm run release:check` by default
- runs `npm pack` with an isolated writable npm cache
- copies the tarball into `out/beta-release/`
- generates the three wrappers with an exact GitHub Release tarball URL pinned into each file

For local iteration only, you can skip the full release gate:

- `npm run beta:bundle -- --tag v0.1.0-beta.1 --skip-release-check`

Do not use `--skip-release-check` for an actual tester-facing beta release.

### Publish The Beta Release

1. Create or update the GitHub Release tag:
   - `v0.1.0-beta.1`
2. Upload these four assets from `out/beta-release/`:
   - `sessionmap-<version>.tgz`
   - `sessionmap-beta.sh`
   - `sessionmap-beta.ps1`
   - `sessionmap-beta.cmd`
3. Publish the GitHub Release.
4. Share [docs/BETA_TESTING.md](./BETA_TESTING.md) or equivalent tester instructions with the release link.

### Beta Validation

Before telling testers to use a beta release:

- confirm the uploaded wrappers point to the same GitHub Release tag
- download the macOS/Linux wrapper and run:
  - `./sessionmap-beta.sh --help`
- manually verify the Windows PowerShell and CMD wrappers on real Windows machines when possible
- ensure `status` and `start` work from a sample project directory

Cross-OS wrapper execution cannot be fully proven from one machine. Treat Windows and shell wrapper validation as part of each beta cycle.

### Replacing A Bad Beta

Do not mutate an already-shared beta wrapper in place. Cut a new beta tag such as:

- `v0.1.0-beta.2`

Then:

1. re-run `npm run beta:bundle -- --tag v0.1.0-beta.2`
2. upload the new assets to the new release
3. tell testers to switch to the new release assets

This keeps beta installs version-pinned and avoids silently changing an existing wrapper.

## Public npm Release

This remains the future release path once you decide to publish `sessionmap`.

### Release Preconditions

- The exact unscoped npm package name `sessionmap` is owned and available to publish from the current npm account.
- The repo is in a releasable state.
- `package.json` metadata, `README.md`, and `LICENSE` are up to date.

If the exact unscoped npm name is unavailable, do not publish. This repo does not define a scoped or alternate-name fallback.

### Release Steps

1. Confirm ownership and availability of the npm package name:
   - `npm view sessionmap version`
   - or verify ownership through the npm account that will publish
2. Log into npm:
   - `npm login`
3. Run full repo verification:
   - `npm run verify`
4. Run tarball verification:
   - `npm run pack:check`
5. Run manual package smoke checks:
   - `npm pack`
   - `npm exec --yes --package ./sessionmap-<version>.tgz -- sessionmap --help`
   - `npm exec --yes --package ./sessionmap-<version>.tgz -- sessionmap status --project-root <fixture-or-temp-project>`
6. Publish:
   - `npm publish`
7. Verify the public install path from a clean shell:
   - `npx sessionmap --help`
8. Create and push the git tag for the release.

### Notes

- `prepack` builds the packaged runtime before `npm pack` or `npm publish`.
- `pack:check` validates that the tarball contains runtime assets and excludes dev-only repo directories.
- If your local npm cache has permission issues, run pack/exec checks with a writable temporary cache:
  - `npm_config_cache="$(mktemp -d)" npm pack`
  - `npm_config_cache="$(mktemp -d)" npm exec --yes --package ./sessionmap-<version>.tgz -- sessionmap --help`
- If packaging validation fails, fix the tarball contract before publishing.
- If public verification fails after publish, stop further release activity and investigate the packaging/runtime path mismatch first.
