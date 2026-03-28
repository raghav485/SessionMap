import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { buildFileExplanation } from "../../src/graph/graph-query.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tier2 csharp analysis", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
  });

  test("creates internal edges only for uniquely matched namespaces and preserves unresolved imports otherwise", async () => {
    projectRoot = await copyFixtureToTempDir("tier2-csharp");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const explanation = buildFileExplanation(store, "Program.cs");
    expect(explanation?.dependencies).toEqual(["Utilities.cs"]);
    expect(explanation?.exports).toContain("Program");
    expect(explanation?.unresolvedImports).toContain("Missing.Namespace");
    expect(analyzed.state.techStack.packageManagers).toContain("dotnet");
  });
});
