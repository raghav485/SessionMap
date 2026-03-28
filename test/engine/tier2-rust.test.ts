import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { buildFileExplanation } from "../../src/graph/graph-query.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tier2 rust analysis", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await fs.rm(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
  });

  test("resolves crate and super imports and exposes pub exports", async () => {
    projectRoot = await copyFixtureToTempDir("tier2-rust");
    const analyzed = await analyzeProject(projectRoot, loadConfig(projectRoot).config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const libExplanation = buildFileExplanation(store, "src/lib.rs");
    const nestedExplanation = buildFileExplanation(store, "src/nested/mod.rs");
    expect(libExplanation?.dependencies).toContain("src/models.rs");
    expect(nestedExplanation?.dependencies).toContain("src/models.rs");
    expect(libExplanation?.exports).toContain("make_user");
    expect(analyzed.state.techStack.packageManagers).toContain("cargo");
  });
});
