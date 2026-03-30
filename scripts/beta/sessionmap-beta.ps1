$ErrorActionPreference = "Stop"
$SessionMapTarballUrl = "__SESSIONMAP_TARBALL_URL__"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "SessionMap beta requires Node.js 20+."
  exit 1
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Error "SessionMap beta requires npm 10+."
  exit 1
}

& npm exec --yes "--package=$SessionMapTarballUrl" -- sessionmap @args
exit $LASTEXITCODE
