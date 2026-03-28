import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { DEFAULT_SHUTDOWN_TIMEOUT_MS, DEFAULT_START_TIMEOUT_MS } from "../constants.js";
import { createLogger } from "../logger.js";
import type { DaemonManifest } from "../types.js";
import { pingDaemon, shutdownDaemon } from "./client.js";
import { ensureSessionMapDirs, isProcessAlive, readManifest, removeManifest } from "./manifest.js";

const logger = createLogger("daemon-launcher");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getCliEntryPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const compiledCandidate = path.resolve(currentDir, "../cli.js");
  const sourceCandidate = path.resolve(currentDir, "../cli.ts");
  return fs.existsSync(compiledCandidate) ? compiledCandidate : sourceCandidate;
}

async function waitForHealthyManifest(projectRoot: string, timeoutMs: number): Promise<DaemonManifest> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const manifest = readManifest(projectRoot);
    if (manifest && (await pingDaemon(manifest))) {
      return manifest;
    }

    await sleep(100);
  }

  throw new Error("Timed out waiting for daemon startup");
}

export async function ensureDaemonRunning(projectRoot: string): Promise<DaemonManifest> {
  const existing = readManifest(projectRoot);
  if (existing && (await pingDaemon(existing))) {
    return existing;
  }

  if (existing && !isProcessAlive(existing.pid)) {
    removeManifest(projectRoot);
  }

  const paths = ensureSessionMapDirs(projectRoot);
  const logFileDescriptor = fs.openSync(paths.logPath, "a");
  const child = spawn(process.execPath, [getCliEntryPath(), "daemon", "--project-root", projectRoot], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", "ignore", logFileDescriptor]
  });

  child.unref();
  fs.closeSync(logFileDescriptor);
  logger.info("Spawned daemon process", { pid: child.pid, projectRoot });

  return waitForHealthyManifest(projectRoot, DEFAULT_START_TIMEOUT_MS);
}

export async function stopDaemon(projectRoot: string): Promise<"stopped" | "already-stopped" | "stale-cleaned"> {
  const manifest = readManifest(projectRoot);
  if (!manifest) {
    return "already-stopped";
  }

  if (!(await pingDaemon(manifest))) {
    if (!isProcessAlive(manifest.pid)) {
      removeManifest(projectRoot);
      return "stale-cleaned";
    }

    return "already-stopped";
  }

  await shutdownDaemon(manifest);
  const deadline = Date.now() + DEFAULT_SHUTDOWN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (!isProcessAlive(manifest.pid)) {
      removeManifest(projectRoot);
      return "stopped";
    }

    await sleep(100);
  }

  if (!isProcessAlive(manifest.pid)) {
    removeManifest(projectRoot);
    return "stopped";
  }

  throw new Error("Timed out waiting for daemon shutdown");
}
