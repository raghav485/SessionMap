import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ensureDaemonRunning } from "../daemon/launcher.js";
import { createLogger } from "../logger.js";
import { MCP_IMPLEMENTATION } from "./catalog.js";
import { registerMcpServer } from "./register.js";
import { createRemoteMcpService } from "./service.js";

const logger = createLogger("mcp-stdio");

export async function runMcpStdioBridge(projectRoot: string): Promise<void> {
  const manifest = await ensureDaemonRunning(projectRoot);
  const server = new McpServer(MCP_IMPLEMENTATION);
  const transport = new StdioServerTransport();

  registerMcpServer(server, createRemoteMcpService(manifest));

  const completion = new Promise<void>((resolve, reject) => {
    transport.onclose = () => resolve();
    transport.onerror = (error) => reject(error);
  });

  try {
    await server.connect(transport);
    await completion;
  } catch (error) {
    logger.error("MCP stdio bridge failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    await server.close().catch(() => undefined);
  }
}
