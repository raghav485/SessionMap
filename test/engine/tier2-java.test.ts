import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { buildFileExplanation } from "../../src/graph/graph-query.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tier2 java analysis", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
  });

  test("resolves package imports and public top-level types", async () => {
    projectRoot = await copyFixtureToTempDir("tier2-java");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const explanation = buildFileExplanation(store, "src/main/java/com/example/app/Main.java");
    expect(explanation?.dependencies).toEqual(["src/main/java/com/example/app/util/Helper.java"]);
    expect(explanation?.exports).toContain("Main");
    expect(analyzed.state.techStack.packageManagers).toContain("maven");
    expect(analyzed.state.techStack.languages).toContain("java");
  });
});
