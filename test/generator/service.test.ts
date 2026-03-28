import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { GeneratorService } from "../../src/generator/service.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

function normalizeGeneratedMarkdown(markdown: string): string {
  return markdown
    .replace(/^Generated At: .*$/gmu, "Generated At: <normalized>")
    .replace(/^Summary Source: .*$/gmu, "Summary Source: <normalized>");
}

describe("generator service", () => {
  test("writes deterministic structural artifacts without raw source snippets", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const { config } = loadConfig(projectRoot);
    const analyzed = await analyzeProject(projectRoot, config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const service = new GeneratorService({
      store,
      projectName: config.projectName,
      projectRoot,
      rules: config.rules,
      llm: config.llm
    });

    const firstRun = await service.generate();
    const architecturePath = path.join(projectRoot, ".sessionmap", "ARCHITECTURE.md");
    const modulesPath = path.join(projectRoot, ".sessionmap", "MODULES.md");
    const moduleDocPath = path.join(projectRoot, ".sessionmap", "modules", "src%2Futils.md");

    expect(firstRun.summary.artifactCount).toBeGreaterThanOrEqual(5);
    expect(firstRun.summary.llmUsed).toBe(false);
    expect(await fs.readFile(architecturePath, "utf8")).toContain("Summary Source: heuristic");
    expect(await fs.readFile(modulesPath, "utf8")).toContain("src/utils");
    expect(await fs.readFile(moduleDocPath, "utf8")).not.toContain("export function add");

    const firstArchitecture = normalizeGeneratedMarkdown(await fs.readFile(architecturePath, "utf8"));
    const firstModules = normalizeGeneratedMarkdown(await fs.readFile(modulesPath, "utf8"));

    const secondRun = await service.generate();
    expect(secondRun.summary.generatedFiles).toEqual(firstRun.summary.generatedFiles);
    expect(store.getGeneratedContext().projectSummary?.source).toBe("heuristic");
    expect(store.getGeneratedContext().moduleSummaries["src/utils"]?.text).toContain("Module src/utils");

    const secondArchitecture = normalizeGeneratedMarkdown(await fs.readFile(architecturePath, "utf8"));
    const secondModules = normalizeGeneratedMarkdown(await fs.readFile(modulesPath, "utf8"));

    expect(secondArchitecture).toBe(firstArchitecture);
    expect(secondModules).toBe(firstModules);
  });
});
