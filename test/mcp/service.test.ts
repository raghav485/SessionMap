import path from "node:path";

import { describe, expect, test, vi } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeProject } from "../../src/engine/analyzer.js";
import { JsonGraphStore } from "../../src/graph/json-store.js";
import { createLocalMcpService } from "../../src/mcp/service.js";
import type { ActivitySession, ChangeSet } from "../../src/types.js";
import { copyFixtureToTempDir } from "../helpers.js";

function createAgentStdout(lines: number): string {
  return Array.from({ length: lines }, (_, index) => `line-${String(index + 1).padStart(3, "0")}`).join("\n");
}

describe("mcp service", () => {
  test("builds local MCP responses and preserves explicit-mcp session semantics", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const { config } = loadConfig(projectRoot);
    const analyzed = await analyzeProject(projectRoot, config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const changeSet: ChangeSet = {
      id: "changeset-mcp-1",
      startedAt: "2026-03-27T10:00:00.000Z",
      endedAt: "2026-03-27T10:00:02.000Z",
      source: "explicit-mcp",
      events: []
    };
    const session: ActivitySession = {
      id: "session-mcp-1",
      startedAt: "2026-03-27T10:00:00.000Z",
      endedAt: "2026-03-27T10:01:00.000Z",
      actor: "agent",
      source: "explicit-mcp",
      confidence: 1,
      intent: "update shared math helper",
      agentCommand: "mcp-client",
      agentStdout: createAgentStdout(25),
      touchedPaths: ["src/utils/math.ts"],
      touchedModules: ["src/utils"],
      changeSets: [changeSet.id],
      impactedDependents: ["src/index.ts"]
    };

    store.addChangeSet(changeSet);
    store.upsertSession(session);
    store.setGeneratedContext({
      lastGeneratedAt: "2026-03-27T11:30:00.000Z",
      projectSummary: {
        text: "Generated project summary",
        source: "heuristic",
        generatedAt: "2026-03-27T11:30:00.000Z"
      },
      conventionsSummary: {
        text: "Generated conventions summary",
        source: "heuristic",
        generatedAt: "2026-03-27T11:30:00.000Z"
      },
      moduleSummaries: {
        "src/utils": {
          moduleBoundary: "src/utils",
          filePaths: ["src/utils/math.ts"],
          text: "Generated module summary",
          source: "heuristic",
          generatedAt: "2026-03-27T11:30:00.000Z"
        }
      },
      generatedFiles: [".sessionmap/ARCHITECTURE.md"]
    });
    store.persist();

    const startExplicitSession = vi.fn(async () => ({
      sessionId: "session-started",
      startedAt: "2026-03-27T11:00:00.000Z"
    }));
    const endExplicitSession = vi.fn(async () => session);

    const service = createLocalMcpService({
      store,
      projectName: "sample-project",
      projectRoot,
      rules: [
        {
          id: "rule-1",
          source: "user",
          description: "Do not import app code into lib helpers.",
          check: {
            type: "import-boundary",
            from: "src/lib/**",
            notTo: "src/app/**"
          }
        }
      ],
      getWatcherRunning: () => true,
      getActiveExplicitSessionId: () => null,
      startExplicitSession,
      endExplicitSession
    });

    const overview = await service.getProjectOverview();
    expect(overview.projectRoot).toBe(projectRoot);
    expect(overview.counts.nodes).toBeGreaterThan(0);
    expect(overview.latestSession?.session.id).toBe(session.id);
    expect(overview.projectSummary).toBe("Generated project summary");

    const moduleContext = await service.getModuleContext("src/index.ts");
    expect(moduleContext?.kind).toBe("file");
    if (moduleContext?.kind === "file") {
      expect(moduleContext.dependencies).toContain("src/utils/math.ts");
    }

    const directoryContext = await service.getModuleContext("src/utils");
    expect(directoryContext?.kind).toBe("directory");
    if (directoryContext?.kind === "directory") {
      expect(directoryContext.summary).toBe("Generated module summary");
    }

    const dependencies = await service.getDependencies("src/index.ts", "both");
    expect(dependencies?.dependencies).toContain("src/utils/math.ts");
    expect(dependencies?.externalDependencies).toContain("react");

    const results = await service.searchProject("index");
    expect(results.some((result) => result.path === "src/index.ts")).toBe(true);

    const latestSession = await service.getLatestSession();
    expect(latestSession?.session.source).toBe("explicit-mcp");
    expect(latestSession?.agentStdoutPreview).toContain("line-025");
    expect(latestSession?.agentStdoutPreview).not.toContain("line-001");

    const rules = await service.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.description).toContain("Do not import");

    await service.beginSession({
      agentCommand: "remote-client"
    });
    expect(startExplicitSession).toHaveBeenCalledWith({
      agentCommand: "remote-client",
      source: "explicit-mcp"
    });

    await service.endSession("session-started", {
      exitCode: 0
    });
    expect(endExplicitSession).toHaveBeenCalledWith("session-started", {
      exitCode: 0
    });
  });

  test("surfaces tier2 dependency data through shared module-context and dependency queries", async () => {
    const projectRoot = await copyFixtureToTempDir("tier2-python");
    const { config } = loadConfig(projectRoot);
    const analyzed = await analyzeProject(projectRoot, config);
    const store = new JsonGraphStore(path.join(projectRoot, ".sessionmap", "state", "store.json"));
    store.replace(analyzed.state);

    const service = createLocalMcpService({
      store,
      projectName: "tier2-python",
      projectRoot,
      rules: [],
      getWatcherRunning: () => true,
      getActiveExplicitSessionId: () => null,
      startExplicitSession: async () => ({
        sessionId: "session-tier2",
        startedAt: "2026-03-27T12:00:00.000Z"
      }),
      endExplicitSession: async () => ({
        id: "session-tier2",
        startedAt: "2026-03-27T12:00:00.000Z",
        endedAt: "2026-03-27T12:01:00.000Z",
        actor: "agent",
        source: "explicit-mcp",
        confidence: 1,
        touchedPaths: [],
        touchedModules: [],
        changeSets: []
      })
    });

    const moduleContext = await service.getModuleContext("app/main.py");
    expect(moduleContext?.kind).toBe("file");
    if (moduleContext?.kind === "file") {
      expect(moduleContext.dependencies).toEqual(["app/helper.py", "app/package/worker.py"]);
      expect(moduleContext.externalDependencies).toContain("requests");
    }

    const dependencies = await service.getDependencies("app/main.py", "both");
    expect(dependencies?.dependencies).toEqual(["app/helper.py", "app/package/worker.py"]);
    expect(dependencies?.externalDependencies).toContain("requests");
  });
});
