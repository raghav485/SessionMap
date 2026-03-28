import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { scanProjectFiles } from "../../src/engine/scanner.js";
import { cleanupProjectDaemon, copyFixtureToTempDir } from "../helpers.js";

describe("scanner", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("respects gitignore, sessionmapignore, and default ignores", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    const { config } = loadConfig(projectRoot);
    const files = await scanProjectFiles(projectRoot, config);
    const relativePaths = files.map((file) => file.relativePath);

    expect(relativePaths).toContain("src/index.ts");
    expect(relativePaths).toContain("src/utils/math.ts");
    expect(relativePaths).not.toContain("ignored.ts");
    expect(relativePaths).not.toContain("sessionmap-ignored.ts");
    expect(relativePaths).not.toContain("dist/generated.js");
  });

  test("builds structural graph data for TS/JS files and does not crash on syntax errors", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);

    expect(analyzed.summary.filesScanned).toBeGreaterThan(0);
    expect(analyzed.state.nodes.some((node) => node.path === "src/index.ts")).toBe(true);
    expect(analyzed.state.edges.some((edge) => edge.target === "file:src/utils/math.ts")).toBe(true);

    const syntaxProject = await copyFixtureToTempDir("syntax-error-project");
    const syntaxAnalysis = await analyzeProject(syntaxProject, loadConfig(syntaxProject).config);
    expect(syntaxAnalysis.state.nodes.some((node) => node.path === "src/bad.ts")).toBe(true);
  });
});
