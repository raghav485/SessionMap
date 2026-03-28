import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { SCHEMA_VERSION } from "../../src/constants.js";
import { ensureSessionMapDirs } from "../../src/daemon/manifest.js";
import { cleanupProjectDaemon, copyFixtureToTempDir, runCli } from "../helpers.js";

describe("daemon launcher", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("replaces stale manifests when starting", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    const runtimePaths = ensureSessionMapDirs(projectRoot);

    await fs.writeFile(
      runtimePaths.manifestPath,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        projectRoot,
        pid: 999999,
        controlUrl: "http://127.0.0.1:1",
        authToken: "stale",
        startedAt: new Date().toISOString(),
        statePath: runtimePaths.statePath,
        logPath: runtimePaths.logPath
      }),
      "utf8"
    );

    const result = await runCli(["start", "--project-root", projectRoot], projectRoot);
    expect(result.stdout).toContain("SessionMap daemon running");

    const manifest = JSON.parse(await fs.readFile(runtimePaths.manifestPath, "utf8")) as {
      pid: number;
      webUrl?: string;
      mcpHttpUrl?: string;
    };
    expect(manifest.pid).not.toBe(999999);
    expect(manifest.webUrl).toContain("127.0.0.1");
    expect(manifest.mcpHttpUrl).toContain("127.0.0.1");
  });

  test("requires auth for control endpoints", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);

    const manifest = JSON.parse(
      await fs.readFile(path.join(projectRoot, ".sessionmap", "runtime", "daemon.json"), "utf8")
    ) as { controlUrl: string; authToken: string };

    const unauthorized = await fetch(`${manifest.controlUrl}/v1/status`);
    expect(unauthorized.status).toBe(401);

    const authorized = await fetch(`${manifest.controlUrl}/v1/status`, {
      headers: {
        Authorization: `Bearer ${manifest.authToken}`
      }
    });
    expect(authorized.status).toBe(200);

    const sessionUnauthorized = await fetch(`${manifest.controlUrl}/v1/sessions`);
    expect(sessionUnauthorized.status).toBe(401);
  });
});
