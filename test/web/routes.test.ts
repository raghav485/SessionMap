import fs from "node:fs/promises";
import path from "node:path";

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
    await fs.writeFile(
      path.join(projectRoot, "src", "utils", "math.ts"),
      "export function add(left: number, right: number): number {\n  return left + right + 11;\n}\n",
      "utf8"
    );
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
      trackingMode: string;
    };
    expect(status.projectRoot).toBe(projectRoot);
    expect(status.watcherRunning).toBe(true);
    expect(status.trackingMode).toBe("auto");
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
      granularity: string;
      fallbackApplied: boolean;
      hiddenIsolatedCount: number;
      hiddenSummary: Array<{ category: string; label: string }>;
      hiddenPreview: Array<{ category: string }>;
      nodes: Array<{ path: string }>;
      truncated: boolean;
    };
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.granularity).toBe("file");
    expect(graph.fallbackApplied).toBe(false);
    expect(graph.hiddenIsolatedCount).toBe(0);
    expect(graph.hiddenSummary).toEqual([]);
    expect(graph.hiddenPreview).toEqual([]);
    expect(typeof graph.truncated).toBe("boolean");

    const projectGraph = (await (await fetch(`${manifest.webUrl}/api/graph?scope=project`)).json()) as {
      granularity: string;
      fallbackApplied: boolean;
      hiddenIsolatedCount: number;
      hiddenSummary: Array<{ category: string; label: string }>;
      hiddenPreview: Array<{ category: string; items: Array<{ path: string }> }>;
      nodes: Array<{ type: string; path: string }>;
    };
    expect(projectGraph.granularity).toBe("module");
    expect(projectGraph.fallbackApplied).toBe(false);
    expect(typeof projectGraph.hiddenIsolatedCount).toBe("number");
    expect(projectGraph.hiddenSummary.length).toBeGreaterThan(0);
    expect(projectGraph.hiddenSummary.some((item) => item.category === "config")).toBe(true);
    expect(projectGraph.hiddenPreview.some((item) => item.category === "config")).toBe(true);
    expect(projectGraph.nodes.every((node) => node.type === "module")).toBe(true);
    expect(projectGraph.nodes.some((node) => node.path === "src")).toBe(true);

    const projectFileGraph = (await (
      await fetch(`${manifest.webUrl}/api/graph?scope=project&granularity=file&showHidden=true`)
    ).json()) as {
      granularity: string;
      fallbackApplied: boolean;
      hiddenIsolatedCount: number;
      hiddenSummary: Array<{ category: string }>;
      hiddenPreview: Array<{ category: string }>;
      nodes: Array<{ type: string; path: string }>;
    };
    expect(projectFileGraph.granularity).toBe("file");
    expect(projectFileGraph.fallbackApplied).toBe(false);
    expect(projectFileGraph.hiddenIsolatedCount).toBe(0);
    expect(projectFileGraph.hiddenSummary).toEqual([]);
    expect(projectFileGraph.hiddenPreview).toEqual([]);
    expect(projectFileGraph.nodes.every((node) => node.type === "file")).toBe(true);
    expect(projectFileGraph.nodes.some((node) => node.path === "package.json")).toBe(true);

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

  test("returns sparse fallback previews for low-connectivity project graphs", async () => {
    projectRoot = await copyFixtureToTempDir("sparse-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);

    const projectGraph = (await (await fetch(`${manifest.webUrl}/api/graph?scope=project`)).json()) as {
      granularity: string;
      fallbackApplied: boolean;
      nodes: Array<{ path: string }>;
      hiddenSummary: Array<{ category: string; count: number }>;
      hiddenPreview: Array<{ category: string; items: Array<{ path: string; type: string }> }>;
    };
    expect(projectGraph.granularity).toBe("module");
    expect(projectGraph.fallbackApplied).toBe(true);
    expect(projectGraph.nodes).toEqual([]);
    expect(projectGraph.hiddenSummary).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "isolated", count: 3 })])
    );
    expect(projectGraph.hiddenPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "isolated",
          items: expect.arrayContaining([
            expect.objectContaining({ path: "src", type: "module" }),
            expect.objectContaining({ path: "src/services", type: "module" }),
            expect.objectContaining({ path: "src/utils", type: "module" })
          ])
        })
      ])
    );

    const projectFileGraph = (await (
      await fetch(`${manifest.webUrl}/api/graph?scope=project&granularity=file`)
    ).json()) as {
      granularity: string;
      fallbackApplied: boolean;
      hiddenPreview: Array<{ category: string; items: Array<{ path: string; type: string }> }>;
    };
    expect(projectFileGraph.granularity).toBe("file");
    expect(projectFileGraph.fallbackApplied).toBe(true);
    expect(projectFileGraph.hiddenPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "isolated",
          items: expect.arrayContaining([
            expect.objectContaining({ path: "src/main.ts", type: "file" })
          ])
        })
      ])
    );
  });

  test("returns architecture overview and focus-mode graphs for nested package repos", async () => {
    projectRoot = await copyFixtureToTempDir("monorepo-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);
    await runCli(["scan", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);

    const projectGraph = (await (await fetch(`${manifest.webUrl}/api/graph?scope=project`)).json()) as {
      granularity: string;
      focusApplied: boolean;
      nodes: Array<{ path: string; type: string }>;
      edges: Array<{ source: string; target: string; relationshipSources: string[] }>;
    };
    expect(projectGraph.granularity).toBe("module");
    expect(projectGraph.focusApplied).toBe(false);
    expect(projectGraph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api", type: "module" }),
        expect.objectContaining({ path: "apps/web", type: "module" }),
        expect.objectContaining({ path: "apps/extension", type: "module" }),
        expect.objectContaining({ path: "packages/contracts", type: "module" })
      ])
    );
    expect(projectGraph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "module:apps/web",
          target: "module:packages/contracts",
          relationshipSources: expect.arrayContaining(["import", "package"])
        })
      ])
    );

    const focusedGraph = (await (
      await fetch(`${manifest.webUrl}/api/graph?scope=project&focus=${encodeURIComponent("apps/web")}`)
    ).json()) as {
      granularity: string;
      focusApplied: boolean;
      focus?: { path: string; label: string };
      drilldown?: { path: string; relativePath: string; label: string };
      drilldownTrail: Array<{ path: string; relativePath: string; label: string }>;
      nodes: Array<{ path: string; architectureUnit?: string; type: string }>;
    };
    expect(focusedGraph.granularity).toBe("file");
    expect(focusedGraph.focusApplied).toBe(true);
    expect(focusedGraph.focus).toEqual({ path: "apps/web", label: "apps/web" });
    expect(focusedGraph.drilldown).toEqual({
      path: "apps/web/src",
      relativePath: "src",
      label: "src"
    });
    expect(focusedGraph.drilldownTrail).toEqual([
      expect.objectContaining({
        path: "apps/web/src",
        relativePath: "src",
        label: "src"
      })
    ]);
    expect(focusedGraph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/web/src/main.tsx", architectureUnit: "apps/web" }),
        expect.objectContaining({ path: "apps/web/src/App.tsx", architectureUnit: "apps/web" })
      ])
    );
    expect(focusedGraph.nodes.some((node) => node.path.startsWith("apps/api/"))).toBe(false);

    const focusedApiGraph = (await (
      await fetch(
        `${manifest.webUrl}/api/graph?scope=project&focus=${encodeURIComponent("apps/api")}`
      )
    ).json()) as {
      focusApplied: boolean;
      drilldown?: { path: string; relativePath: string; label: string };
      nodes: Array<{ path: string; type: string }>;
    };
    expect(focusedApiGraph.focusApplied).toBe(true);
    expect(focusedApiGraph.drilldown).toEqual({
      path: "apps/api/src",
      relativePath: "src",
      label: "src"
    });
    expect(focusedApiGraph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api/src/index.ts", type: "file" }),
        expect.objectContaining({ path: "apps/api/src/auth", type: "directory" }),
        expect.objectContaining({ path: "apps/api/src/billing", type: "directory" }),
        expect.objectContaining({ path: "apps/api/src/services", type: "directory" })
      ])
    );

    const authDrilldown = (await (
      await fetch(
        `${manifest.webUrl}/api/graph?scope=project&focus=${encodeURIComponent("apps/api")}&drilldown=${encodeURIComponent("src/auth")}`
      )
    ).json()) as {
      drilldown?: { path: string; relativePath: string; label: string };
      nodes: Array<{ path: string; type: string }>;
    };
    expect(authDrilldown.drilldown).toEqual({
      path: "apps/api/src/auth",
      relativePath: "src/auth",
      label: "auth"
    });
    expect(authDrilldown.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api/src/auth/service.ts", type: "file" })
      ])
    );
  });
});
