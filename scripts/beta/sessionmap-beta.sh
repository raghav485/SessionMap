#!/usr/bin/env sh
set -eu

SESSIONMAP_TARBALL_URL="__SESSIONMAP_TARBALL_URL__"

if ! command -v node >/dev/null 2>&1; then
  echo "SessionMap beta requires Node.js 20+." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "SessionMap beta requires npm 10+." >&2
  exit 1
fi

exec npm exec --yes --package="$SESSIONMAP_TARBALL_URL" -- sessionmap "$@"
