import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { SCHEMA_VERSION } from "../../src/constants.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { createFileNodeId } from "../../src/graph/knowledge-graph.js";
import type { PersistedState } from "../../src/types.js";
import { copyFixtureToTempDir } from "../helpers.js";

function createState(projectRoot: string): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot,
    techStack: {
      packageManagers: ["npm"],
      frameworks: ["react"],
      languages: ["typescript"],
      configFiles: ["package.json", "tsconfig.json"]
    },
    nodes: [],
    edges: [],
    sessions: [],
    changeSets: [],
    generatedContext: {
      moduleSummaries: {},
      generatedFiles: []
    },
    metadata: {}
  };
}

describe("json-store", () => {
  test("persists and reloads state, then clears schema mismatches", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const statePath = path.join(projectRoot, ".sessionmap", "state", "store.json");
    const store = new JsonGraphStore(statePath);
    const state = createState(projectRoot);

    store.replace(state);
    expect(store.load()).toEqual({
      ...state,
      generatedAt: expect.any(String)
    });

    fs.writeFileSync(
      statePath,
      JSON.stringify({
        ...state,
        schemaVersion: SCHEMA_VERSION + 1
      }),
      "utf8"
    );

    expect(store.load()).toBeNull();
    expect(fs.existsSync(statePath)).toBe(false);
  });

  test("supports granular node, edge, session, and change-set mutation", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const statePath = path.join(projectRoot, ".sessionmap", "state", "store.json");
    const store = new JsonGraphStore(statePath);
    store.replace(createState(projectRoot));

    store.upsertNode({
      id: createFileNodeId("src/index.ts"),
      type: "file",
      path: "src/index.ts",
      language: "typescript",
      tier: 1,
      name: "index.ts",
      exports: ["main"],
      summary: "summary",
      summarySource: "heuristic",
      metadata: {
        linesOfCode: 10,
        lastModified: new Date().toISOString(),
        moduleBoundary: "src",
        externalDependencies: ["react"],
        unresolvedImports: []
      }
    });
    store.replaceOutgoingEdges(createFileNodeId("src/index.ts"), [
      {
        source: createFileNodeId("src/index.ts"),
        target: createFileNodeId("src/utils/math.ts"),
        type: "imports",
        symbols: ["add"],
        weight: 1
      }
    ]);
    store.addChangeSet({
      id: "changeset-1",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      source: "watcher-inferred",
      events: []
    });
    store.upsertSession({
      id: "session-1",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      actor: "unknown",
      source: "watcher-inferred",
      confidence: 0.45,
      touchedPaths: ["src/index.ts"],
      touchedModules: ["src"],
      changeSets: ["changeset-1"],
      impactedDependents: []
    });
    store.persist();

    const reloaded = store.load();
    expect(reloaded?.nodes).toHaveLength(1);
    expect(store.getOutgoingEdges(createFileNodeId("src/index.ts"))).toHaveLength(1);
    expect(store.getSessions()).toHaveLength(1);
    expect(store.getChangeSets()).toHaveLength(1);
    expect(store.getGeneratedContext().generatedFiles).toEqual([]);
  });
});
