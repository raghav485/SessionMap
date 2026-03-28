import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { buildFileExplanation } from "../../src/graph/graph-query.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tier2 go analysis", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
  });

  test("resolves go.mod-local imports and exported top-level symbols", async () => {
    projectRoot = await copyFixtureToTempDir("tier2-go");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const explanation = buildFileExplanation(store, "main.go");
    expect(explanation?.dependencies).toEqual(["internal/helper.go"]);
    expect(explanation?.exports).toContain("Run");
    expect(analyzed.state.techStack.languages).toContain("go");
    expect(analyzed.state.techStack.packageManagers).toContain("go");
  });
});
