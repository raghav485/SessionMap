import { describe, expect, test, afterEach } from "vitest";

import { cleanupProjectDaemon, copyFixtureToTempDir, pollUntil, readDaemonManifest, runCli } from "../helpers.js";

describe("web routes", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("serves dashboard assets and dashboard APIs over the web adapter", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);
    await runCli(["track", "--project-root", projectRoot, "--", "node", "scripts/change-math.js"], projectRoot);
    await runCli(["generate", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);
    expect(manifest.webUrl).toBeTruthy();

    await pollUntil(async () => {
      const latest = await fetch(`${manifest.webUrl}/api/sessions/latest`);
      const body = (await latest.json()) as { session?: { id: string } } | null;
      return Boolean(body?.session?.id);
    }, 8000);

    const home = await fetch(`${manifest.webUrl}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("SessionMap");

    const status = (await (await fetch(`${manifest.webUrl}/api/status`)).json()) as {
      projectRoot: string;
      counts: { nodes: number };
      watcherRunning: boolean;
    };
    expect(status.projectRoot).toBe(projectRoot);
    expect(status.watcherRunning).toBe(true);
    expect(status.counts.nodes).toBeGreaterThan(0);

    const overview = (await (await fetch(`${manifest.webUrl}/api/overview`)).json()) as {
      projectSummary?: string;
      latestSession: { session: { id: string } } | null;
    };
    expect(overview.latestSession?.session.id).toBeTruthy();
    expect(overview.projectSummary).toContain("is organized into");

    const latestSession = (await (await fetch(`${manifest.webUrl}/api/sessions/latest`)).json()) as {
      reviewOrder: string[];
      touchedFiles: Array<{ path: string }>;
    } | null;
    expect(latestSession?.reviewOrder.length).toBeGreaterThan(0);
    expect(latestSession?.touchedFiles.some((file) => file.path === "src/utils/math.ts")).toBe(true);

    const graph = (await (await fetch(`${manifest.webUrl}/api/graph?scope=latest-session`)).json()) as {
      nodes: Array<{ path: string }>;
      truncated: boolean;
    };
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(typeof graph.truncated).toBe("boolean");

    const explorer = (await (
      await fetch(`${manifest.webUrl}/api/explorer?path=${encodeURIComponent("src/index.ts")}`)
    ).json()) as { kind: string; path: string };
    expect(explorer.kind).toBe("file");
    expect(explorer.path).toBe("src/index.ts");

    const moduleExplorer = (await (
      await fetch(`${manifest.webUrl}/api/explorer?path=${encodeURIComponent("src/utils")}`)
    ).json()) as { kind: string; path: string; summary?: string };
    expect(moduleExplorer.kind).toBe("directory");
    expect(moduleExplorer.path).toBe("src/utils");
    expect(moduleExplorer.summary).toContain("Module src/utils");

    const search = (await (
      await fetch(`${manifest.webUrl}/api/search?q=${encodeURIComponent("index")}&limit=5`)
    ).json()) as Array<{ path: string }>;
    expect(search.some((result) => result.path === "src/index.ts")).toBe(true);
  });
});
