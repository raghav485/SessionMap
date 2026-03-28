import fs from "node:fs";
import path from "node:path";

import {
  DAEMON_LOG_FILE_NAME,
  MANIFEST_FILE_NAME,
  RUNTIME_DIR_NAME,
  SESSIONMAP_DIR_NAME,
  STATE_DIR_NAME,
  STORE_FILE_NAME
} from "../constants.js";
import type { DaemonManifest } from "../types.js";

function normalizePathSegments(projectRoot: string, relativePath: string): string {
  return path.join(projectRoot, relativePath);
}

export function getSessionMapPaths(projectRoot: string) {
  const sessionMapRoot = normalizePathSegments(projectRoot, SESSIONMAP_DIR_NAME);
  const runtimeDir = normalizePathSegments(projectRoot, RUNTIME_DIR_NAME);
  const stateDir = normalizePathSegments(projectRoot, STATE_DIR_NAME);

  return {
    sessionMapRoot,
    runtimeDir,
    stateDir,
    manifestPath: path.join(runtimeDir, MANIFEST_FILE_NAME),
    statePath: path.join(stateDir, STORE_FILE_NAME),
    logPath: path.join(runtimeDir, DAEMON_LOG_FILE_NAME)
  };
}

export function ensureSessionMapDirs(projectRoot: string): ReturnType<typeof getSessionMapPaths> {
  const paths = getSessionMapPaths(projectRoot);
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.mkdirSync(paths.stateDir, { recursive: true });
  return paths;
}

export function readManifest(projectRoot: string): DaemonManifest | null {
  const { manifestPath } = getSessionMapPaths(projectRoot);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as DaemonManifest;
  } catch {
    return null;
  }
}

export function writeManifest(projectRoot: string, manifest: DaemonManifest): void {
  const { manifestPath } = ensureSessionMapDirs(projectRoot);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function removeManifest(projectRoot: string): void {
  const { manifestPath } = getSessionMapPaths(projectRoot);
  fs.rmSync(manifestPath, { force: true });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
