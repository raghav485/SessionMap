# SessionMap Beta Testing

SessionMap is not published to npm yet. The current low-friction tester path is a versioned GitHub Release that includes:

- `sessionmap-<version>.tgz`
- `sessionmap-beta.sh`
- `sessionmap-beta.ps1`
- `sessionmap-beta.cmd`

Testers only need the wrapper for their operating system. The wrapper pins the matching GitHub Release tarball URL and runs SessionMap through `npm exec`.

## Prerequisites

- Node.js 20+
- npm 10+
- Internet access to GitHub Releases
- A terminal

You do not need Git, `npm link`, or `npm install -g`.

## Get The Right Wrapper

1. Open the matching SessionMap GitHub Release.
2. Download the wrapper for your operating system:
   - `sessionmap-beta.sh` for macOS/Linux
   - `sessionmap-beta.ps1` for Windows PowerShell
   - `sessionmap-beta.cmd` for Windows Command Prompt
3. Save the wrapper somewhere convenient on your machine.

The wrapper can live anywhere. Run it from the project you want SessionMap to analyze.

## macOS Or Linux

1. Install Node.js 20+ and npm 10+.
2. Download `sessionmap-beta.sh`.
3. Make it executable:

```bash
chmod +x /path/to/sessionmap-beta.sh
```

4. Change into your project:

```bash
cd /path/to/your/project
```

5. Run SessionMap:

```bash
/path/to/sessionmap-beta.sh start
/path/to/sessionmap-beta.sh scan
/path/to/sessionmap-beta.sh status
```

## Windows PowerShell

1. Install Node.js 20+ and npm 10+.
2. Download `sessionmap-beta.ps1`.
3. Change into your project:

```powershell
cd C:\path\to\your\project
```

4. Run SessionMap:

```powershell
C:\path\to\sessionmap-beta.ps1 start
C:\path\to\sessionmap-beta.ps1 scan
C:\path\to\sessionmap-beta.ps1 status
```

## Windows Command Prompt

1. Install Node.js 20+ and npm 10+.
2. Download `sessionmap-beta.cmd`.
3. Change into your project:

```bat
cd C:\path\to\your\project
```

4. Run SessionMap:

```bat
C:\path\to\sessionmap-beta.cmd start
C:\path\to\sessionmap-beta.cmd scan
C:\path\to\sessionmap-beta.cmd status
```

## Common Commands

Run these from the project you want SessionMap to analyze:

- `start` starts the project-local daemon
- `scan` builds or refreshes the graph
- `status` shows daemon URLs and graph/session state
- `explain <path>` explains a file or directory
- `track -- <command...>` wraps an agent or other command in an explicit session
- `sessions` lists recent sessions
- `generate` writes `.sessionmap/` context files for later agent runs
- `mcp --project-root /path/to/project` launches the stdio MCP bridge

Examples:

```bash
/path/to/sessionmap-beta.sh explain src
/path/to/sessionmap-beta.sh track -- claude-code
/path/to/sessionmap-beta.sh generate
/path/to/sessionmap-beta.sh mcp --project-root /path/to/your/project
```

## Dashboard

After `start`, read `webUrl` from:

- `status`
- or the output of `start`

Open that URL in a browser. The dashboard is served locally from your machine and reflects the current project directory.

## MCP

For local MCP host configuration, point the host at the beta wrapper for your OS and pass `mcp --project-root /path/to/project`.

Examples:

- macOS/Linux: `/path/to/sessionmap-beta.sh mcp --project-root /path/to/project`
- PowerShell: `C:\path\to\sessionmap-beta.ps1 mcp --project-root C:\path\to\project`
- CMD: `C:\path\to\sessionmap-beta.cmd mcp --project-root C:\path\to\project`

## Troubleshooting

### `node` or `npm` not found

Install Node.js 20+ first. The wrappers fail early if `node` or `npm` is missing.

### The wrapper fails to download the package

The wrapper uses a pinned GitHub Release asset URL. Confirm that:

- you downloaded the wrapper from the same release you intend to test
- the release is still published
- your network can reach GitHub Releases

### I want the SessionMap command itself

That path is intentionally deferred until public npm publish. During beta, use the wrapper directly instead of `sessionmap`, `npm link`, or `npm install -g`.
