import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function copyFixtureToTempDir(fixtureName: string): Promise<string> {
  const sourceDir = path.resolve(process.cwd(), "test/fixtures", fixtureName);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-"));
  await fs.cp(sourceDir, tempDir, { recursive: true });
  return tempDir;
}

export function getCliEntryPath(): string {
  return path.resolve(process.cwd(), "dist/cli.js");
}

export async function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(process.execPath, [getCliEntryPath(), ...args], {
    cwd,
    env: process.env
  });

  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}

export async function cleanupProjectDaemon(projectRoot: string): Promise<void> {
  try {
    await runCli(["stop", "--project-root", projectRoot], projectRoot);
  } catch {
    // Best-effort cleanup for integration tests.
  }
}

export async function readDaemonManifest(projectRoot: string): Promise<{
  controlUrl: string;
  webUrl?: string;
  mcpHttpUrl?: string;
  authToken: string;
  pid: number;
}> {
  const manifestPath = path.join(projectRoot, ".sessionmap", "runtime", "daemon.json");
  return JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    controlUrl: string;
    webUrl?: string;
    mcpHttpUrl?: string;
    authToken: string;
    pid: number;
  };
}

export async function pollUntil(
  check: () => Promise<boolean> | boolean,
  timeoutMs = 5000,
  intervalMs = 50
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for condition");
}
