@echo off
setlocal
set "SESSIONMAP_TARBALL_URL=__SESSIONMAP_TARBALL_URL__"

where node >nul 2>nul
if errorlevel 1 (
  echo SessionMap beta requires Node.js 20+. 1>&2
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo SessionMap beta requires npm 10+. 1>&2
  exit /b 1
)

call npm exec --yes --package=%SESSIONMAP_TARBALL_URL% -- sessionmap %*
exit /b %ERRORLEVEL%
