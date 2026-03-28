import path from "node:path";

import { describe, expect, test } from "vitest";

import { JsonGraphStore } from "../../src/graph/json-store.js";
import { createFileNodeId } from "../../src/graph/knowledge-graph.js";
import { SessionInferrer } from "../../src/session/inferrer.js";
import type { ActivitySession, ChangeSet, ChangeSetImpact, PersistedState } from "../../src/types.js";
import { SCHEMA_VERSION } from "../../src/constants.js";
import { copyFixtureToTempDir } from "../helpers.js";

function createState(projectRoot: string): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot,
    techStack: { packageManagers: [], frameworks: [], languages: [], configFiles: [] },
    nodes: [
      {
        id: createFileNodeId("src/index.ts"),
        type: "file",
        path: "src/index.ts",
        language: "typescript",
        tier: 1,
        name: "index.ts",
        exports: [],
        metadata: {
          linesOfCode: 1,
          lastModified: new Date().toISOString(),
          moduleBoundary: "src"
        }
      },
      {
        id: createFileNodeId("src/utils/math.ts"),
        type: "file",
        path: "src/utils/math.ts",
        language: "typescript",
        tier: 1,
        name: "math.ts",
        exports: [],
        metadata: {
          linesOfCode: 1,
          lastModified: new Date().toISOString(),
          moduleBoundary: "src/utils"
        }
      }
    ],
    edges: [
      {
        source: createFileNodeId("src/index.ts"),
        target: createFileNodeId("src/utils/math.ts"),
        type: "imports",
        symbols: ["add"],
        weight: 1
      }
    ],
    sessions: [],
    changeSets: [],
    generatedContext: {
      moduleSummaries: {},
      generatedFiles: []
    },
    metadata: {}
  };
}

describe("session inferrer", () => {
  test("merges nearby, related inferred changes", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(createState(projectRoot));

    const inferrer = new SessionInferrer(store, 180000);
    const latest: ActivitySession = {
      id: "session-1",
      startedAt: "2026-03-27T00:00:00.000Z",
      endedAt: "2026-03-27T00:01:00.000Z",
      actor: "unknown",
      source: "watcher-inferred",
      confidence: 0.45,
      touchedPaths: ["src/index.ts"],
      touchedModules: ["src"],
      changeSets: ["changeset-1"],
      impactedDependents: []
    };
    const changeSet: ChangeSet = {
      id: "changeset-2",
      startedAt: "2026-03-27T00:02:00.000Z",
      endedAt: "2026-03-27T00:02:00.100Z",
      source: "watcher-inferred",
      events: []
    };
    const impact: ChangeSetImpact = {
      touchedPaths: ["src/utils/math.ts"],
      touchedModules: ["src"],
      impactedDependents: [],
      impactedDependentModules: [],
      durationMs: 50
    };

    const decision = inferrer.decide(changeSet, impact, latest);
    expect(decision.mergeWithSessionId).toBe("session-1");
    expect(decision.confidence).toBeGreaterThan(0.6);
  });

  test("does not merge unrelated changes outside locality", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(createState(projectRoot));

    const inferrer = new SessionInferrer(store, 180000);
    const latest: ActivitySession = {
      id: "session-1",
      startedAt: "2026-03-27T00:00:00.000Z",
      endedAt: "2026-03-27T00:01:00.000Z",
      actor: "unknown",
      source: "watcher-inferred",
      confidence: 0.45,
      touchedPaths: ["src/index.ts"],
      touchedModules: ["src"],
      changeSets: ["changeset-1"],
      impactedDependents: []
    };
    const changeSet: ChangeSet = {
      id: "changeset-2",
      startedAt: "2026-03-27T00:02:00.000Z",
      endedAt: "2026-03-27T00:02:00.100Z",
      source: "watcher-inferred",
      events: []
    };
    const impact: ChangeSetImpact = {
      touchedPaths: ["docs/README.md"],
      touchedModules: ["docs"],
      impactedDependents: [],
      impactedDependentModules: [],
      durationMs: 10
    };

    const decision = inferrer.decide(changeSet, impact, latest);
    expect(decision.mergeWithSessionId).toBeUndefined();
  });
});
