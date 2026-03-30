# SessionMap Release Guide

This document covers the current source-install workflow and the future public npm release workflow.

## Current Source Install Workflow

Public npm publish is deferred for now. The supported user path is to install SessionMap globally from the cloned repo.

### Source Install Preconditions

- The repo is in a usable state.
- `package.json`, `README.md`, and `LICENSE` are up to date.
- The user has Node.js 20+ and npm 10+ installed.

### Standard Source Install Steps

```bash
git clone <repo>
cd /path/to/SessionMap
npm install
npm run build
npm install -g .
sessionmap --help
```

Then, from any target project:

```bash
cd /path/to/your/project
sessionmap start
sessionmap scan
sessionmap status
```

### Contributor Alternative

Contributors can still use npm’s symlink flow:

```bash
cd /path/to/SessionMap
npm link
sessionmap --help
```

`npm link` is supported, but `npm install -g .` is the primary user path.

### Source Install Validation

Before documenting or recommending the source-install flow, validate:

1. `npm run pack:check`
2. `npm install -g . --prefix <temp-prefix>`
3. `<temp-prefix>/bin/sessionmap --help`
4. `<temp-prefix>/bin/sessionmap status --project-root <fixture-or-temp-project>`

This confirms the installed command works from a real global-binary layout rather than only through `node dist/cli.js`.

### Troubleshooting Notes

- If `sessionmap` is not found after `npm install -g .`, the issue is usually the user’s Node/npm global environment, not SessionMap’s CLI entrypoint.
- If standard global install is blocked on a machine, `npm link` may still work as a contributor/developer fallback.
- Do not add project-managed PATH-editing scripts, shell-profile writers, or custom OS installer scripts.

## Future Public npm Release

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
5. Run install smoke checks:
   - `npm install -g . --prefix <temp-prefix>`
   - `<temp-prefix>/bin/sessionmap --help`
   - `<temp-prefix>/bin/sessionmap status --project-root <fixture-or-temp-project>`
6. Publish:
   - `npm publish`
7. Verify the public install path from a clean shell:
   - `npx sessionmap --help`
8. Create and push the git tag for the release.

### Notes

- `prepack` builds the packaged runtime before `npm pack` or `npm publish`.
- `pack:check` validates that the tarball contains runtime assets and excludes dev-only repo directories.
- If your local npm cache has permission issues, run pack/install checks with a writable temporary cache:
  - `npm_config_cache="$(mktemp -d)" npm pack`
  - `npm_config_cache="$(mktemp -d)" npm install -g . --prefix <temp-prefix>`
- If packaging validation fails, fix the tarball contract before publishing.
- If public verification fails after publish, stop further release activity and investigate the packaging/runtime path mismatch first.
