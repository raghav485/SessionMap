import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod";

import { MCP_PROMPTS, MCP_RESOURCES, MCP_TOOLS } from "./catalog.js";
import type { McpService } from "./service.js";
import { createJsonResource, createJsonTextContent, decodeResourcePath, toJsonText } from "./serialization.js";

function normalizeTemplateValue(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function summarizeOverview(overview: Awaited<ReturnType<McpService["getProjectOverview"]>>): string {
  return `Project ${overview.projectName} has ${overview.counts.nodes} nodes, ${overview.counts.edges} edges, and ${overview.counts.sessions} sessions.`;
}

function summarizeModuleContext(context: NonNullable<Awaited<ReturnType<McpService["getModuleContext"]>>>): string {
  if (context.kind === "file") {
    return `Module context for ${context.path} with ${context.dependencies.length} dependencies and ${context.dependents.length} dependents.`;
  }

  return `Directory context for ${context.path} covering ${context.fileCount} files.`;
}

function summarizeDependencies(response: NonNullable<Awaited<ReturnType<McpService["getDependencies"]>>>): string {
  return `${response.path} has ${response.dependencies.length} dependencies and ${response.dependents.length} dependents.`;
}

function summarizeLatestSession(session: Awaited<ReturnType<McpService["getLatestSession"]>>): string {
  if (!session) {
    return "No session has been captured yet.";
  }

  return `Latest session ${session.session.id} touched ${session.touchedFiles.length} files across ${session.touchedModules.length} modules.`;
}

function summarizeSession(session: NonNullable<Awaited<ReturnType<McpService["getSession"]>>>): string {
  return `Session ${session.session.id} touched ${session.touchedFiles.length} files across ${session.touchedModules.length} modules.`;
}

export function registerMcpServer(server: McpServer, service: McpService): void {
  server.registerTool(
    MCP_TOOLS.getProjectOverview,
    {
      title: "Project Overview",
      description: "Return the latest structural overview of the current project."
    },
    async () => {
      const overview = await service.getProjectOverview();
      return createJsonTextContent(summarizeOverview(overview), overview);
    }
  );

  server.registerTool(
    MCP_TOOLS.getModuleContext,
    {
      title: "Module Context",
      description: "Return structural context for a file or directory path.",
      inputSchema: {
        path: z.string().describe("Relative project path for a file or directory.")
      }
    },
    async ({ path }) => {
      const context = await service.getModuleContext(path);
      if (!context) {
        throw new Error(`Path not found: ${path}`);
      }

      return createJsonTextContent(summarizeModuleContext(context), context);
    }
  );

  server.registerTool(
    MCP_TOOLS.getDependencies,
    {
      title: "Dependencies",
      description: "Return one-hop dependencies and dependents for a file path.",
      inputSchema: {
        path: z.string().describe("Relative project path for a file."),
        direction: z.enum(["dependencies", "dependents", "both"]).optional().describe("Which dependency direction to include.")
      }
    },
    async ({ path, direction }) => {
      const response = await service.getDependencies(path, direction);
      if (!response) {
        throw new Error(`File not found: ${path}`);
      }

      return createJsonTextContent(summarizeDependencies(response), response);
    }
  );

  server.registerTool(
    MCP_TOOLS.searchProject,
    {
      title: "Search Project",
      description: "Search project structure by path, name, or summary text.",
      inputSchema: {
        query: z.string().describe("Search query."),
        limit: z.number().int().positive().max(100).optional().describe("Maximum number of results to return.")
      }
    },
    async ({ query, limit }) => {
      const results = await service.searchProject(query, limit);
      return createJsonTextContent(`Found ${results.length} project matches for "${query}".`, results);
    }
  );

  server.registerTool(
    MCP_TOOLS.getLatestSession,
    {
      title: "Latest Session",
      description: "Return the latest captured development session."
    },
    async () => {
      const session = await service.getLatestSession();
      return createJsonTextContent(summarizeLatestSession(session), session);
    }
  );

  server.registerTool(
    MCP_TOOLS.getSession,
    {
      title: "Session Detail",
      description: "Return a captured development session by ID.",
      inputSchema: {
        sessionId: z.string().describe("Captured session ID.")
      }
    },
    async ({ sessionId }) => {
      const session = await service.getSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      return createJsonTextContent(summarizeSession(session), session);
    }
  );

  server.registerTool(
    MCP_TOOLS.beginSession,
    {
      title: "Begin Session",
      description: "Start an explicit MCP-backed session so subsequent file changes are attributed to it.",
      inputSchema: {
        intent: z.string().optional().describe("Optional session goal or task intent."),
        agentCommand: z.string().optional().describe("Optional logical client identifier for the MCP caller.")
      }
    },
    async ({ intent, agentCommand }) => {
      const started = await service.beginSession({
        intent,
        agentCommand,
        source: "explicit-mcp"
      });
      return createJsonTextContent(`Started MCP session ${started.sessionId}.`, started);
    }
  );

  server.registerTool(
    MCP_TOOLS.endSession,
    {
      title: "End Session",
      description: "End an explicit MCP-backed session.",
      inputSchema: {
        sessionId: z.string().describe("Explicit session ID to end."),
        agentStdout: z.string().optional().describe("Optional bounded agent output preview to store with the session."),
        exitCode: z.number().int().nullable().optional().describe("Optional exit code or completion status.")
      }
    },
    async ({ sessionId, agentStdout, exitCode }) => {
      const session = await service.endSession(sessionId, {
        agentStdout,
        exitCode: exitCode ?? null
      });
      return createJsonTextContent(`Ended MCP session ${session.id}.`, session);
    }
  );

  server.registerResource(
    "project-overview",
    MCP_RESOURCES.projectOverview,
    {
      title: "Project Overview",
      description: "The latest structural overview of the project.",
      mimeType: "application/json"
    },
    async (uri) => {
      const overview = await service.getProjectOverview();
      return createJsonResource(uri.href, overview);
    }
  );

  server.registerResource(
    "project-rules",
    MCP_RESOURCES.projectRules,
    {
      title: "Project Rules",
      description: "User-defined architecture and import-boundary rules.",
      mimeType: "application/json"
    },
    async (uri) => {
      const rules = await service.getRules();
      return createJsonResource(uri.href, rules);
    }
  );

  server.registerResource(
    "latest-session",
    MCP_RESOURCES.latestSession,
    {
      title: "Latest Session",
      description: "The latest captured development session, if one exists.",
      mimeType: "application/json"
    },
    async (uri) => {
      const latestSession = await service.getLatestSession();
      return createJsonResource(uri.href, latestSession);
    }
  );

  server.registerResource(
    "module-context",
    new ResourceTemplate(MCP_RESOURCES.moduleTemplate, { list: undefined }),
    {
      title: "Module Context",
      description: "Structural context for a file or directory path.",
      mimeType: "application/json"
    },
    async (uri, { encodedPath }) => {
      const resourcePath = normalizeTemplateValue(encodedPath);
      const context = await service.getModuleContext(decodeResourcePath(resourcePath));
      if (!context) {
        throw new Error(`Path not found for resource: ${resourcePath}`);
      }

      return createJsonResource(uri.href, context);
    }
  );

  server.registerResource(
    "session-detail",
    new ResourceTemplate(MCP_RESOURCES.sessionTemplate, { list: undefined }),
    {
      title: "Session Detail",
      description: "Detailed session context by captured session ID.",
      mimeType: "application/json"
    },
    async (uri, { sessionId }) => {
      const resolvedSessionId = normalizeTemplateValue(sessionId);
      const session = await service.getSession(resolvedSessionId);
      if (!session) {
        throw new Error(`Session not found for resource: ${resolvedSessionId}`);
      }

      return createJsonResource(uri.href, session);
    }
  );

  server.registerPrompt(
    MCP_PROMPTS.reviewLatestSession,
    {
      title: "Review Latest Session",
      description: "Generate a review-oriented explanation of the latest captured session."
    },
    async () => {
      const latestSession = await service.getLatestSession();
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "resource",
              resource: {
                uri: MCP_RESOURCES.latestSession,
                mimeType: "application/json",
                text: toJsonText(latestSession)
              }
            }
          },
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Review the latest SessionMap session. Summarize what changed, identify impacted modules, explain the suggested review order, and call out risks without quoting source code."
            }
          }
        ]
      };
    }
  );

  server.registerPrompt(
    MCP_PROMPTS.planChangePlacement,
    {
      title: "Plan Change Placement",
      description: "Use current project structure to decide where a new change should live.",
      argsSchema: {
        goal: z.string().describe("What new behavior or change should be added."),
        candidatePath: z.string().optional().describe("Optional file or directory path to evaluate as a candidate location.")
      }
    },
    async ({ goal, candidatePath }) => {
      const overview = await service.getProjectOverview();
      const candidateContext = candidatePath ? await service.getModuleContext(candidatePath) : null;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "resource",
              resource: {
                uri: MCP_RESOURCES.projectOverview,
                mimeType: "application/json",
                text: toJsonText(overview)
              }
            }
          },
          ...(candidateContext
            ? [
                {
                  role: "user" as const,
                  content: {
                    type: "resource" as const,
                    resource: {
                      uri: `sessionmap://module/${encodeURIComponent(candidatePath ?? "")}`,
                      mimeType: "application/json",
                      text: toJsonText(candidateContext)
                    }
                  }
                }
              ]
            : []),
          {
            role: "user",
            content: {
              type: "text",
              text: `Goal: ${goal}\nCandidate path: ${candidatePath ?? "not provided"}\nRecommend the best placement, nearby files to inspect first, and architectural risks to avoid. Use only the structured SessionMap context provided above.`
            }
          }
        ]
      };
    }
  );
}
