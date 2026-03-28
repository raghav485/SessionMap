import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { buildFileExplanation } from "../../src/graph/graph-query.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tier2 python analysis", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
  });

  test("resolves package and relative imports, exports public symbols, and records pip tech stack hints", async () => {
    projectRoot = await copyFixtureToTempDir("tier2-python");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const explanation = buildFileExplanation(store, "app/main.py");
    expect(explanation?.dependencies).toEqual(["app/helper.py", "app/package/worker.py"]);
    expect(explanation?.exports).toContain("run");
    expect(explanation?.externalDependencies).toContain("requests");
    expect(analyzed.state.techStack.languages).toContain("python");
    expect(analyzed.state.techStack.packageManagers).toContain("pip");
  });
});
