import http from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { DEFAULT_MCP_HOST } from "../constants.js";
import { createLogger } from "../logger.js";
import { MCP_ALLOWED_HOSTS, MCP_ENDPOINT_PATH, MCP_IMPLEMENTATION } from "./catalog.js";
import { registerMcpServer } from "./register.js";
import type { McpService } from "./service.js";

const logger = createLogger("mcp-http");

export interface McpHttpServerOptions {
  service: McpService;
  authToken: string;
  host?: string;
  port: number;
}

function writeJsonError(response: http.ServerResponse, statusCode: number, message: string): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message
      },
      id: null
    })
  );
}

function isAuthorized(request: http.IncomingMessage, authToken: string): boolean {
  return request.headers.authorization === `Bearer ${authToken}`;
}

function hasValidHostHeader(request: http.IncomingMessage): boolean {
  const hostHeader = request.headers.host;
  if (!hostHeader) {
    return false;
  }

  try {
    const hostname = new URL(`http://${hostHeader}`).hostname;
    return MCP_ALLOWED_HOSTS.includes(hostname as (typeof MCP_ALLOWED_HOSTS)[number]);
  } catch {
    return false;
  }
}

export async function startMcpHttpServer(options: McpHttpServerOptions): Promise<{
  server: http.Server;
  mcpHttpUrl: string;
}> {
  const host = options.host ?? DEFAULT_MCP_HOST;

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? MCP_ENDPOINT_PATH, `http://${host}`);

    if (requestUrl.pathname !== MCP_ENDPOINT_PATH) {
      writeJsonError(response, 404, "Not found");
      return;
    }

    if (!hasValidHostHeader(request)) {
      writeJsonError(response, 403, "Invalid host header");
      return;
    }

    if (!isAuthorized(request, options.authToken)) {
      writeJsonError(response, 401, "Unauthorized");
      return;
    }

    const mcpServer = new McpServer(MCP_IMPLEMENTATION);
    registerMcpServer(mcpServer, options.service);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    const cleanup = (): void => {
      void transport.close().catch((error) => {
        logger.warn("Failed to close MCP HTTP transport cleanly", {
          message: error instanceof Error ? error.message : String(error)
        });
      });
      void mcpServer.close().catch((error) => {
        logger.warn("Failed to close MCP server cleanly", {
          message: error instanceof Error ? error.message : String(error)
        });
      });
    };

    response.once("close", cleanup);

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      logger.error("Failed to handle MCP HTTP request", {
        message: error instanceof Error ? error.message : String(error)
      });
      response.off("close", cleanup);
      cleanup();
      if (!response.headersSent) {
        writeJsonError(response, 500, "Internal server error");
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine MCP HTTP server address");
  }

  const mcpHttpUrl = `http://${host}:${address.port}${MCP_ENDPOINT_PATH}`;
  logger.info("MCP HTTP server started", {
    mcpHttpUrl
  });

  return {
    server,
    mcpHttpUrl
  };
}
