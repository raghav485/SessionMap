import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { buildFileExplanation } from "../../src/graph/graph-query.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tier2 ruby analysis", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
  });

  test("resolves require_relative and project-local require paths", async () => {
    projectRoot = await copyFixtureToTempDir("tier2-ruby");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const explanation = buildFileExplanation(store, "app/main.rb");
    expect(explanation?.dependencies).toEqual(["app/support/helper.rb", "lib/app/models/user.rb"]);
    expect(explanation?.exports).toContain("AppRunner");
    expect(explanation?.exports).toContain("Commands");
    expect(analyzed.state.techStack.packageManagers).toContain("bundler");
    expect(analyzed.state.techStack.frameworks).toContain("rails");
  });
});
