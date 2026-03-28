import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { buildFileExplanation } from "../../src/graph/graph-query.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tier2 php analysis", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
  });

  test("resolves relative includes and composer psr-4 namespace imports", async () => {
    projectRoot = await copyFixtureToTempDir("tier2-php");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const explanation = buildFileExplanation(store, "bootstrap.php");
    expect(explanation?.dependencies).toEqual(["src/Service/Helper.php", "src/legacy.php"]);
    expect(explanation?.exports).toContain("run");
    expect(analyzed.state.techStack.packageManagers).toContain("composer");
    expect(analyzed.state.techStack.languages).toContain("php");
  });
});
