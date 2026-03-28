import fs from "node:fs/promises";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, test } from "vitest";

import { MCP_PROMPTS, MCP_RESOURCES, MCP_TOOLS } from "../../src/mcp/catalog.js";
import { encodeResourcePath } from "../../src/mcp/serialization.js";
import { cleanupProjectDaemon, copyFixtureToTempDir, getCliEntryPath, runCli } from "../helpers.js";

describe("mcp stdio bridge", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("serves the MCP catalog over stdio and records explicit-mcp sessions", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [getCliEntryPath(), "mcp", "--project-root", projectRoot],
      cwd: projectRoot,
      stderr: "pipe"
    });
    const stderrStream = transport.stderr;
    let stderrOutput = "";
    stderrStream?.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    const client = new Client({
      name: "sessionmap-test-stdio",
      version: "1.0.0"
    });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining([
          MCP_TOOLS.getProjectOverview,
          MCP_TOOLS.getModuleContext,
          MCP_TOOLS.getDependencies,
          MCP_TOOLS.searchProject,
          MCP_TOOLS.getLatestSession,
          MCP_TOOLS.getSession,
          MCP_TOOLS.beginSession,
          MCP_TOOLS.endSession
        ])
      );

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toEqual(
        expect.arrayContaining([MCP_RESOURCES.projectOverview, MCP_RESOURCES.projectRules, MCP_RESOURCES.latestSession])
      );

      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(
        expect.arrayContaining([MCP_PROMPTS.reviewLatestSession, MCP_PROMPTS.planChangePlacement])
      );

      const beginResult = await client.callTool({
        name: MCP_TOOLS.beginSession,
        arguments: {
          intent: "update index value",
          agentCommand: "test-mcp-client"
        }
      });
      const started = beginResult.structuredContent as {
        sessionId: string;
        startedAt: string;
      };
      expect(started.sessionId).toBeTruthy();
      expect(started.startedAt).toBeTruthy();

      await fs.writeFile(
        path.join(projectRoot, "src", "index.ts"),
        'import { add } from "./utils/math";\nexport const value = add(3, 4);\n',
        "utf8"
      );

      const endResult = await client.callTool({
        name: MCP_TOOLS.endSession,
        arguments: {
          sessionId: started.sessionId,
          agentStdout: "bounded output",
          exitCode: 0
        }
      });
      const endedSession = endResult.structuredContent as {
        id: string;
        source: string;
        touchedPaths: string[];
      };
      expect(endedSession.id).toBe(started.sessionId);
      expect(endedSession.source).toBe("explicit-mcp");
      expect(endedSession.touchedPaths).toContain("src/index.ts");

      await runCli(["generate", "--project-root", projectRoot], projectRoot);

      const sessionDetailResult = await client.callTool({
        name: MCP_TOOLS.getSession,
        arguments: {
          sessionId: started.sessionId
        }
      });
      const sessionDetail = sessionDetailResult.structuredContent as {
        session: { source: string; id: string };
        agentStdoutPreview?: string;
      };
      expect(sessionDetail.session.id).toBe(started.sessionId);
      expect(sessionDetail.session.source).toBe("explicit-mcp");
      expect(sessionDetail.agentStdoutPreview).toContain("bounded output");

      const sessionResource = await client.readResource({
        uri: `sessionmap://session/${started.sessionId}`
      });
      expect(sessionResource.contents[0]?.text).toContain("\"source\": \"explicit-mcp\"");

      const moduleResource = await client.readResource({
        uri: `sessionmap://module/${encodeResourcePath("src/utils")}`
      });
      expect(moduleResource.contents[0]?.text).toContain("\"kind\": \"directory\"");
      expect(moduleResource.contents[0]?.text).toContain("Module src/utils");

      const placementPrompt = await client.getPrompt({
        name: MCP_PROMPTS.planChangePlacement,
        arguments: {
          goal: "Add a new way to compute totals.",
          candidatePath: "src/index.ts"
        }
      });
      expect(placementPrompt.messages.some((message) => message.content.type === "resource")).toBe(true);
      expect(placementPrompt.messages.some((message) => message.content.type === "text")).toBe(true);
    } finally {
      await client.close();
    }

    expect(stderrOutput).not.toContain("MCP stdio bridge failed");
  });
});
