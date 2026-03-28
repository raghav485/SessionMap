import http from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, test } from "vitest";

import { MCP_PROMPTS, MCP_RESOURCES, MCP_TOOLS } from "../../src/mcp/catalog.js";
import { encodeResourcePath } from "../../src/mcp/serialization.js";
import { cleanupProjectDaemon, copyFixtureToTempDir, pollUntil, readDaemonManifest, runCli } from "../helpers.js";

function rawHttpRequest(
  urlString: string,
  headers: Record<string, string>
): Promise<{
  statusCode: number;
  body: string;
}> {
  const url = new URL(urlString);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body
          });
        });
      }
    );

    request.once("error", reject);
    request.end("{}");
  });
}

describe("mcp http server", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("serves the MCP catalog over authenticated loopback streamable HTTP", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);
    await runCli(["track", "--project-root", projectRoot, "--", "node", "scripts/change-math.js"], projectRoot);
    await runCli(["generate", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);
    expect(manifest.mcpHttpUrl).toContain("127.0.0.1");

    await pollUntil(async () => {
      const latest = await fetch(`${manifest.controlUrl}/v1/sessions/latest`, {
        headers: {
          Authorization: `Bearer ${manifest.authToken}`
        }
      });
      const body = (await latest.json()) as { session?: { id: string } } | null;
      return Boolean(body?.session?.id);
    }, 8000);

    const unauthorized = await fetch(manifest.mcpHttpUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    expect(unauthorized.status).toBe(401);

    const invalidHost = await rawHttpRequest(manifest.mcpHttpUrl!, {
      Authorization: `Bearer ${manifest.authToken}`,
      Host: "malicious.invalid",
      "Content-Type": "application/json"
    });
    expect(invalidHost.statusCode).toBe(403);

    const client = new Client({
      name: "sessionmap-test-http",
      version: "1.0.0"
    });
    const transport = new StreamableHTTPClientTransport(new URL(manifest.mcpHttpUrl!), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${manifest.authToken}`
        }
      }
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

      const prompts = await client.listPrompts();
      expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(
        expect.arrayContaining([MCP_PROMPTS.reviewLatestSession, MCP_PROMPTS.planChangePlacement])
      );

      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toEqual(
        expect.arrayContaining([
          MCP_RESOURCES.projectOverview,
          MCP_RESOURCES.projectRules,
          MCP_RESOURCES.latestSession
        ])
      );

      const overviewResult = await client.callTool({
        name: MCP_TOOLS.getProjectOverview,
        arguments: {}
      });
      const overview = overviewResult.structuredContent as {
        projectRoot: string;
        counts: { nodes: number };
        projectSummary?: string;
      };
      expect(overview.projectRoot).toBe(projectRoot);
      expect(overview.counts.nodes).toBeGreaterThan(0);
      expect(overview.projectSummary).toContain("is organized into");

      const latestSessionResult = await client.callTool({
        name: MCP_TOOLS.getLatestSession,
        arguments: {}
      });
      const latestSession = latestSessionResult.structuredContent as {
        session: { source: string; id: string };
      };
      expect(latestSession.session.source).toBe("explicit-wrapper");
      expect(latestSession.session.id).toBeTruthy();

      const dependencyResult = await client.callTool({
        name: MCP_TOOLS.getDependencies,
        arguments: {
          path: "src/index.ts",
          direction: "both"
        }
      });
      const dependencies = dependencyResult.structuredContent as {
        dependencies: string[];
        externalDependencies: string[];
      };
      expect(dependencies.dependencies).toContain("src/utils/math.ts");
      expect(dependencies.externalDependencies).toContain("react");

      const projectOverviewResource = await client.readResource({
        uri: MCP_RESOURCES.projectOverview
      });
      expect(projectOverviewResource.contents[0]?.text).toContain(projectRoot);

      const moduleResource = await client.readResource({
        uri: `sessionmap://module/${encodeResourcePath("src/utils")}`
      });
      expect(moduleResource.contents[0]?.text).toContain("\"kind\": \"directory\"");
      expect(moduleResource.contents[0]?.text).toContain("Module src/utils");

      const reviewPrompt = await client.getPrompt({
        name: MCP_PROMPTS.reviewLatestSession
      });
      expect(reviewPrompt.messages.some((message) => message.content.type === "resource")).toBe(true);
      expect(reviewPrompt.messages.some((message) => message.content.type === "text")).toBe(true);
    } finally {
      await client.close();
    }
  });
});
