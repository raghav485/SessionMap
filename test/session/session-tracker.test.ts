import path from "node:path";

import { describe, expect, test } from "vitest";

import { SCHEMA_VERSION } from "../../src/constants.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { SessionInferrer } from "../../src/session/inferrer.js";
import { SessionTracker } from "../../src/session/session-tracker.js";
import type { ChangeSet, ChangeSetImpact, PersistedState } from "../../src/types.js";
import { copyFixtureToTempDir } from "../helpers.js";

function createState(projectRoot: string): PersistedState {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    projectRoot,
    techStack: { packageManagers: [], frameworks: [], languages: [], configFiles: [] },
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

describe("session tracker", () => {
  test("persists zero-change explicit sessions", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(createState(projectRoot));

    const tracker = new SessionTracker(store, new SessionInferrer(store, 180000), true, 180000);
    const started = tracker.startExplicitSession({ agentCommand: "node scripts/noop.js", source: "explicit-wrapper" });
    const ended = tracker.endExplicitSession(started.sessionId, { agentStdout: "no changes", exitCode: 0 });

    expect(ended.touchedPaths).toEqual([]);
    expect(store.getSessions()).toHaveLength(1);
  });

  test("arms auto tracking without creating an empty session", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(createState(projectRoot));

    const tracker = new SessionTracker(store, new SessionInferrer(store, 180000), true, 180000);
    tracker.armAutoTracking();

    expect(tracker.getTrackingMode()).toBe("auto");
    expect(tracker.getActiveSessionId()).toBeNull();
    expect(store.getSessions()).toHaveLength(0);
  });

  test("creates auto-daemon sessions when auto tracking is armed", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(createState(projectRoot));

    const tracker = new SessionTracker(store, new SessionInferrer(store, 180000), true, 180000);
    tracker.armAutoTracking();

    const changeSet: ChangeSet = {
      id: "changeset-auto-1",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      source: "watcher-inferred",
      events: []
    };
    const impact: ChangeSetImpact = {
      touchedPaths: ["src/utils/math.ts"],
      touchedModules: ["src/utils"],
      impactedDependents: ["src/index.ts"],
      impactedDependentModules: ["src"],
      durationMs: 20
    };

    const created = tracker.recordChangeSet(changeSet, impact);
    expect(created.source).toBe("auto-daemon");
    expect(created.actor).toBe("agent");
    expect(created.touchedPaths).toContain("src/utils/math.ts");
    expect(tracker.getTrackingMode()).toBe("auto");
    expect(tracker.getActiveSessionId()).toBe(created.id);
    expect(store.getChangeSets()[0]?.source).toBe("auto-daemon");
  });

  test("attaches change sets to the active explicit session before auto sessions", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(createState(projectRoot));

    const tracker = new SessionTracker(store, new SessionInferrer(store, 180000), true, 180000);
    tracker.armAutoTracking();
    const started = tracker.startExplicitSession({
      source: "explicit-mcp"
    });

    const changeSet: ChangeSet = {
      id: "changeset-1",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      source: "watcher-inferred",
      events: []
    };
    const impact: ChangeSetImpact = {
      touchedPaths: ["src/utils/math.ts"],
      touchedModules: ["src/utils"],
      impactedDependents: ["src/index.ts"],
      impactedDependentModules: ["src"],
      durationMs: 20
    };

    const updated = tracker.recordChangeSet(changeSet, impact);
    expect(updated.id).toBe(started.sessionId);
    expect(updated.source).toBe("explicit-mcp");
    expect(updated.touchedPaths).toContain("src/utils/math.ts");
    expect(store.getChangeSets()[0]?.source).toBe("explicit-mcp");
    expect(tracker.getTrackingMode()).toBe("explicit-mcp");
    tracker.endExplicitSession(started.sessionId, { exitCode: 0 });
    expect(tracker.getTrackingMode()).toBe("auto");
  });
});
