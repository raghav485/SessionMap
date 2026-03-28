import path from "node:path";
import { fileURLToPath } from "node:url";

import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

import { DEFAULT_WEB_HOST } from "../constants.js";
import { createLogger } from "../logger.js";
import type { RuntimeEventBus } from "../daemon/runtime-events.js";
import type { IGraphStore } from "../types.js";
import { registerLiveUpdatesRoute } from "./live-updates.js";
import { registerWebRoutes } from "./routes.js";

const logger = createLogger("web-server");

export interface WebServerOptions {
  store: IGraphStore;
  projectName: string;
  projectRoot: string;
  getWatcherRunning(): boolean;
  getActiveExplicitSessionId(): string | null;
  eventBus: RuntimeEventBus;
  port: number;
  host?: string;
  staticRoot?: string;
}

function getDefaultStaticRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/web");
}

export async function createWebServer(options: Omit<WebServerOptions, "port" | "host">): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    disableRequestLogging: true
  });

  app.setErrorHandler((error, _request, reply) => {
    logger.error("Web request failed", {
      message: error instanceof Error ? error.message : String(error)
    });
    reply.status(500).send({
      error: "Internal server error"
    });
  });

  await app.register(websocket);
  await registerWebRoutes(app, {
    store: options.store,
    projectName: options.projectName,
    projectRoot: options.projectRoot,
    getWatcherRunning: options.getWatcherRunning,
    getActiveExplicitSessionId: options.getActiveExplicitSessionId
  });
  registerLiveUpdatesRoute(app, options.eventBus);

  await app.register(fastifyStatic, {
    root: options.staticRoot ?? getDefaultStaticRoot(),
    prefix: "/"
  });

  app.get("/", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  return app;
}

export async function startWebServer(options: WebServerOptions): Promise<{
  app: FastifyInstance;
  webUrl: string;
}> {
  const app = await createWebServer(options);
  const address = await app.listen({
    host: options.host ?? DEFAULT_WEB_HOST,
    port: options.port
  });
  const webUrl = address.endsWith("/") ? address.slice(0, -1) : address;
  logger.info("Web server started", {
    webUrl,
    projectRoot: options.projectRoot
  });

  return {
    app,
    webUrl
  };
}
