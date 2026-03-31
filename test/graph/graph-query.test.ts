import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { ActivitySession, AnalyzedFile } from "../../src/types.js";
import { detectLanguage } from "../../src/engine/language-detector.js";
import { buildGraphState } from "../../src/graph/graph-builder.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { buildGraphResponse } from "../../src/graph/graph-query.js";
import { computeModuleBoundary } from "../../src/engine/module-boundary.js";

const tempDirs: string[] = [];

function createAnalyzedFile(relativePath: string, resolvedImports: string[] = []): AnalyzedFile {
  const detected = detectLanguage(relativePath);

  return {
    absolutePath: path.join("/virtual/project", relativePath),
    relativePath,
    size: 120,
    lastModified: "2026-03-30T00:00:00.000Z",
    language: detected.language,
    tier: detected.tier,
    linesOfCode: 12,
    imports: resolvedImports.map((resolvedPath) => ({
      specifier: resolvedPath,
      symbols: [],
      kind: "import" as const,
      isTypeOnly: false,
      resolvedPath,
      external: false
    })),
    exports: [],
    declarations: [],
    source: "ast",
    moduleBoundary: computeModuleBoundary(relativePath),
    externalDependencies: [],
    unresolvedImports: []
  };
}

function createSession(touchedPaths: string[]): ActivitySession {
  return {
    id: "session-1",
    startedAt: "2026-03-30T00:00:00.000Z",
    endedAt: "2026-03-30T00:10:00.000Z",
    actor: "agent",
    source: "explicit-wrapper",
    confidence: 1,
    touchedPaths,
    touchedModules: touchedPaths.map((relativePath) => computeModuleBoundary(relativePath)),
    changeSets: [],
    impactedDependents: []
  };
}

function createStore(analyzedFiles: AnalyzedFile[]): JsonGraphStore {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sessionmap-graph-query-"));
  tempDirs.push(tempDir);

  const store = new JsonGraphStore(path.join(tempDir, "store.json"));
  store.replace(
    buildGraphState({
      projectRoot: "/virtual/project",
      analyzedFiles,
      techStack: {
        packageManagers: [],
        frameworks: [],
        languages: ["typescript"],
        configFiles: []
      },
      startedAt: "2026-03-30T00:00:00.000Z",
      completedAt: "2026-03-30T00:00:01.000Z"
    })
  );

  return store;
}

function createFixtureBackedStore(fixtureName: string, analyzedFiles: AnalyzedFile[]): JsonGraphStore {
  const sourceDir = path.resolve(process.cwd(), "test/fixtures", fixtureName);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sessionmap-graph-fixture-"));
  fs.cpSync(sourceDir, tempDir, { recursive: true });
  tempDirs.push(tempDir);

  const store = new JsonGraphStore(path.join(tempDir, "store.json"));
  store.replace(
    buildGraphState({
      projectRoot: tempDir,
      analyzedFiles: analyzedFiles.map((file) => ({
        ...file,
        absolutePath: path.join(tempDir, file.relativePath)
      })),
      techStack: {
        packageManagers: ["npm"],
        frameworks: [],
        languages: ["typescript"],
        configFiles: ["package.json"]
      },
      startedAt: "2026-03-30T00:00:00.000Z",
      completedAt: "2026-03-30T00:00:01.000Z"
    })
  );

  return store;
}

function createMonorepoAnalyzedFiles(): AnalyzedFile[] {
  return [
    createAnalyzedFile("apps/api/src/index.ts", [
      "apps/api/src/auth/service.ts",
      "apps/api/src/billing/service.ts",
      "apps/api/src/services/hosted.ts",
      "packages/contracts/src/index.ts",
      "packages/contracts/src/runtime/logger.ts"
    ]),
    createAnalyzedFile("apps/api/src/auth/service.ts"),
    createAnalyzedFile("apps/api/src/billing/service.ts"),
    createAnalyzedFile("apps/api/src/services/hosted.ts"),
    createAnalyzedFile("apps/web/src/main.tsx", ["apps/web/src/App.tsx", "packages/contracts/src/index.ts"]),
    createAnalyzedFile("apps/web/src/App.tsx", ["shared/logger.ts"]),
    createAnalyzedFile("apps/extension/src/background/index.ts", ["packages/contracts/src/index.ts"]),
    createAnalyzedFile("packages/contracts/src/index.ts"),
    createAnalyzedFile("packages/contracts/src/runtime/logger.ts"),
    createAnalyzedFile("shared/logger.ts"),
    createAnalyzedFile("package.json"),
    createAnalyzedFile("tsconfig.base.json"),
    createAnalyzedFile("apps/api/package.json"),
    createAnalyzedFile("apps/api/tsconfig.json"),
    createAnalyzedFile("apps/web/package.json"),
    createAnalyzedFile("apps/web/tsconfig.json"),
    createAnalyzedFile("apps/web/vite.config.ts"),
    createAnalyzedFile("apps/extension/package.json"),
    createAnalyzedFile("apps/extension/manifest.json"),
    createAnalyzedFile("packages/contracts/package.json")
  ];
}

describe("graph query", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop() as string, { recursive: true, force: true });
    }
  });

  test("aggregates project graphs by module and hides ordinary isolated modules by default", () => {
    const store = createStore([
      createAnalyzedFile("server.ts", ["src/app/main.ts"]),
      createAnalyzedFile("src/index.ts", ["src/app/main.ts"]),
      createAnalyzedFile("src/app/main.ts", ["src/shared/util.ts"]),
      createAnalyzedFile("src/shared/util.ts"),
      createAnalyzedFile("package.json"),
      createAnalyzedFile("styles.css"),
      createAnalyzedFile("tests/app.test.ts"),
      createAnalyzedFile("scripts/noop.js")
    ]);

    const graph = buildGraphResponse(store, {
      scope: "project"
    });

    expect(graph.granularity).toBe("module");
    expect(graph.fallbackApplied).toBe(false);
    expect(graph.hiddenIsolatedCount).toBe(0);
    expect(graph.nodes.map((node) => node.path)).toEqual(
      expect.arrayContaining([".", "src", "src/app", "src/shared"])
    );
    expect(graph.nodes.every((node) => node.type === "module")).toBe(true);
    expect(graph.nodes.find((node) => node.path === ".")?.label).toBe("project-root");
    expect(graph.hiddenSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "config", count: 1 }),
        expect.objectContaining({ category: "assets", count: 1 }),
        expect.objectContaining({ category: "tests", count: 1 }),
        expect.objectContaining({ category: "other-support", count: 1 })
      ])
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "module:project-root",
          target: "module:src/app",
          type: "imports"
        }),
        expect.objectContaining({
          source: "module:src",
          target: "module:src/app",
          type: "imports"
        }),
        expect.objectContaining({
          source: "module:src/app",
          target: "module:src/shared",
          type: "imports"
        })
      ])
    );
    expect(graph.hiddenPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "other-support",
          items: [expect.objectContaining({ path: "scripts/noop.js", type: "file" })]
        })
      ])
    );
  });

  test("keeps touched support files visible in project file graphs even when hidden by default", () => {
    const store = createStore([
      createAnalyzedFile("src/app/main.ts", ["src/shared/util.ts"]),
      createAnalyzedFile("src/shared/util.ts"),
      createAnalyzedFile("package.json"),
      createAnalyzedFile("tests/app.test.ts")
    ]);

    const graph = buildGraphResponse(store, {
      scope: "project",
      granularity: "file",
      showHidden: false,
      session: createSession(["package.json"])
    });

    expect(graph.granularity).toBe("file");
    expect(graph.fallbackApplied).toBe(false);
    expect(graph.hiddenIsolatedCount).toBe(0);
    expect(graph.hiddenSummary).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "tests", count: 1 })])
    );
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "package.json",
          touched: true,
          type: "file"
        })
      ])
    );
  });

  test("applies sparse fallback previews for project module graphs with fewer than three visible nodes", () => {
    const store = createStore([
      createAnalyzedFile("src/main.ts"),
      createAnalyzedFile("src/utils/helper.ts"),
      createAnalyzedFile("src/services/api.ts"),
      createAnalyzedFile("package.json"),
      createAnalyzedFile("styles.css")
    ]);

    const graph = buildGraphResponse(store, {
      scope: "project"
    });

    expect(graph.granularity).toBe("module");
    expect(graph.nodeCount).toBe(0);
    expect(graph.fallbackApplied).toBe(true);
    expect(graph.hiddenSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "isolated", count: 3 }),
        expect.objectContaining({ category: "config", count: 1 }),
        expect.objectContaining({ category: "assets", count: 1 })
      ])
    );
    expect(graph.hiddenPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "isolated",
          truncated: false,
          items: expect.arrayContaining([
            expect.objectContaining({ path: "src", type: "module" }),
            expect.objectContaining({ path: "src/services", type: "module" }),
            expect.objectContaining({ path: "src/utils", type: "module" })
          ])
        }),
        expect.objectContaining({
          category: "config",
          items: [expect.objectContaining({ path: "package.json", type: "file" })]
        })
      ])
    );
  });

  test("applies sparse fallback previews for project file graphs with fewer than three visible nodes", () => {
    const store = createStore([
      createAnalyzedFile("src/main.ts"),
      createAnalyzedFile("src/utils/helper.ts"),
      createAnalyzedFile("src/services/api.ts"),
      createAnalyzedFile("package.json")
    ]);

    const graph = buildGraphResponse(store, {
      scope: "project",
      granularity: "file",
      showHidden: false
    });

    expect(graph.granularity).toBe("file");
    expect(graph.fallbackApplied).toBe(true);
    expect(graph.nodeCount).toBe(0);
    expect(graph.hiddenPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "isolated",
          items: expect.arrayContaining([
            expect.objectContaining({ path: "src/main.ts", type: "file" }),
            expect.objectContaining({ path: "src/services/api.ts", type: "file" }),
            expect.objectContaining({ path: "src/utils/helper.ts", type: "file" })
          ])
        })
      ])
    );
  });

  test("showHidden restores support files alongside grouped architecture in project module graphs", () => {
    const store = createStore([
      createAnalyzedFile("src/app/main.ts", ["src/shared/util.ts"]),
      createAnalyzedFile("src/shared/util.ts"),
      createAnalyzedFile("package.json"),
      createAnalyzedFile("styles.css")
    ]);

    const graph = buildGraphResponse(store, {
      scope: "project",
      showHidden: true
    });

    expect(graph.granularity).toBe("module");
    expect(graph.hiddenSummary).toEqual([]);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "src/app", type: "module" }),
        expect.objectContaining({ path: "src/shared", type: "module" }),
        expect.objectContaining({ path: "package.json", type: "file" }),
        expect.objectContaining({ path: "styles.css", type: "file" })
      ])
    );
  });

  test("keeps latest-session graphs file-focused even if module granularity is requested", () => {
    const store = createStore([
      createAnalyzedFile("src/app/main.ts", ["src/feature/widget.ts", "src/shared/util.ts"]),
      createAnalyzedFile("src/feature/widget.ts", ["src/shared/util.ts"]),
      createAnalyzedFile("src/shared/util.ts")
    ]);

    const graph = buildGraphResponse(store, {
      scope: "latest-session",
      granularity: "module",
      showHidden: false,
      session: createSession(["src/app/main.ts"])
    });

    expect(graph.granularity).toBe("file");
    expect(graph.fallbackApplied).toBe(false);
    expect(graph.hiddenIsolatedCount).toBe(0);
    expect(graph.hiddenSummary).toEqual([]);
    expect(graph.hiddenPreview).toEqual([]);
    expect(graph.nodes.every((node) => node.type === "file")).toBe(true);
  });

  test("defaults nested package repos to architecture-unit overview nodes", () => {
    const store = createFixtureBackedStore("monorepo-project", createMonorepoAnalyzedFiles());

    const graph = buildGraphResponse(store, {
      scope: "project"
    });

    expect(graph.granularity).toBe("module");
    expect(graph.focusApplied).toBe(false);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api", type: "module" }),
        expect.objectContaining({ path: "apps/web", type: "module" }),
        expect.objectContaining({ path: "apps/extension", type: "module" }),
        expect.objectContaining({ path: "packages/contracts", type: "module" }),
        expect.objectContaining({ path: "shared", type: "module" })
      ])
    );
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "module:apps/api",
          target: "module:packages/contracts",
          relationshipSources: expect.arrayContaining(["import", "package"])
        }),
        expect.objectContaining({
          source: "module:apps/web",
          target: "module:packages/contracts",
          relationshipSources: expect.arrayContaining(["import", "package"])
        }),
        expect.objectContaining({
          source: "module:apps/extension",
          target: "module:packages/contracts",
          relationshipSources: expect.arrayContaining(["import", "package"])
        }),
        expect.objectContaining({
          source: "module:apps/web",
          target: "module:shared",
          relationshipSources: expect.arrayContaining(["import"])
        })
      ])
    );
  });

  test("focus mode defaults to a directory-first drilldown for a selected architecture unit", () => {
    const store = createFixtureBackedStore("monorepo-project", createMonorepoAnalyzedFiles());

    const graph = buildGraphResponse(store, {
      scope: "project",
      granularity: "file",
      focusPath: "apps/api"
    });

    expect(graph.granularity).toBe("file");
    expect(graph.focusApplied).toBe(true);
    expect(graph.focus).toEqual({ path: "apps/api", label: "apps/api" });
    expect(graph.drilldown).toEqual({
      path: "apps/api/src",
      relativePath: "src",
      label: "src"
    });
    expect(graph.drilldownTrail).toEqual([
      expect.objectContaining({
        path: "apps/api/src",
        relativePath: "src",
        label: "src"
      })
    ]);
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api/src/index.ts", architectureUnit: "apps/api", type: "file" }),
        expect.objectContaining({ path: "apps/api/src/auth", architectureUnit: "apps/api", type: "directory" }),
        expect.objectContaining({ path: "apps/api/src/billing", architectureUnit: "apps/api", type: "directory" }),
        expect.objectContaining({ path: "apps/api/src/services", architectureUnit: "apps/api", type: "directory" })
      ])
    );
    expect(graph.nodes.some((node) => node.path === "apps/api/src/auth/service.ts")).toBe(false);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: expect.any(String),
          target: expect.any(String),
          relationshipSources: expect.arrayContaining(["import"])
        })
      ])
    );
  });

  test("focus drilldown reveals raw files only within the selected directory subtree", () => {
    const store = createFixtureBackedStore("monorepo-project", createMonorepoAnalyzedFiles());

    const graph = buildGraphResponse(store, {
      scope: "project",
      granularity: "file",
      focusPath: "apps/api",
      drilldownPath: "src/auth"
    });

    expect(graph.focus).toEqual({ path: "apps/api", label: "apps/api" });
    expect(graph.drilldown).toEqual({
      path: "apps/api/src/auth",
      relativePath: "src/auth",
      label: "auth"
    });
    expect(graph.drilldownTrail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api/src", relativePath: "src", label: "src" }),
        expect.objectContaining({ path: "apps/api/src/auth", relativePath: "src/auth", label: "auth" })
      ])
    );
    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api/src/auth/service.ts", type: "file", architectureUnit: "apps/api" })
      ])
    );
    expect(graph.nodes.some((node) => node.path === "apps/api/src/billing")).toBe(false);
  });
});
