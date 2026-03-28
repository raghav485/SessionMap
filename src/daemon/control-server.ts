import http from "node:http";

import type {
  ActivitySession,
  ArchitectureRule,
  DashboardOverviewResponse,
  DaemonStatusResponse,
  DependencyDirection,
  DependencyResponse,
  ExplorerResponse,
  ExplicitSessionEndRequest,
  ExplicitSessionStartRequest,
  ExplicitSessionStartResponse,
  ExplainResponse,
  GenerateSummary,
  GeneratedContextResponse,
  SearchResultResponse,
  ScanSummary,
  SessionDetailResponse
} from "../types.js";

export interface ControlService {
  getStatus(): Promise<DaemonStatusResponse>;
  getOverview(): Promise<DashboardOverviewResponse>;
  scan(): Promise<ScanSummary>;
  explain(targetPath: string): Promise<ExplainResponse>;
  getExplorer(targetPath: string): Promise<ExplorerResponse | null>;
  searchProject(query: string, limit?: number): Promise<SearchResultResponse[]>;
  getDependencies(targetPath: string, direction?: DependencyDirection): Promise<DependencyResponse | null>;
  getRules(): Promise<ArchitectureRule[]>;
  listSessions(limit?: number): Promise<ActivitySession[]>;
  getLatestSessionDetail(): Promise<SessionDetailResponse | null>;
  getSession(id: string): Promise<ActivitySession | null>;
  getSessionDetail(id: string): Promise<SessionDetailResponse | null>;
  startExplicitSession(request: ExplicitSessionStartRequest): Promise<ExplicitSessionStartResponse>;
  endExplicitSession(sessionId: string, request: ExplicitSessionEndRequest): Promise<ActivitySession>;
  generate(): Promise<GenerateSummary>;
  getGeneratedContext(): Promise<GeneratedContextResponse>;
  shutdown(): Promise<void>;
}

interface ControlServerOptions {
  host: string;
  port: number;
  authToken: string;
  service: ControlService;
}

interface StartedControlServer {
  server: http.Server;
  controlUrl: string;
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function isAuthorized(request: http.IncomingMessage, authToken: string): boolean {
  const header = request.headers.authorization;
  return header === `Bearer ${authToken}`;
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function writeError(response: http.ServerResponse, error: unknown): void {
  if (error instanceof Error && error.name === "SessionConflictError") {
    writeJson(response, 409, { error: error.message });
    return;
  }

  if (error instanceof Error && error.name === "GenerationConflictError") {
    writeJson(response, 409, { error: error.message });
    return;
  }

  if (error instanceof Error && error.message.startsWith("Unknown explicit session")) {
    writeJson(response, 404, { error: error.message });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown server error";
  writeJson(response, 500, { error: message });
}

export async function startControlServer(options: ControlServerOptions): Promise<StartedControlServer> {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${options.host}`);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { ok: true });
        return;
      }

      if (!isAuthorized(request, options.authToken)) {
        writeJson(response, 401, { error: "Unauthorized" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/status") {
        writeJson(response, 200, await options.service.getStatus());
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/overview") {
        writeJson(response, 200, await options.service.getOverview());
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/scan") {
        writeJson(response, 200, await options.service.scan());
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/generate") {
        writeJson(response, 200, await options.service.generate());
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/generated-context") {
        writeJson(response, 200, await options.service.getGeneratedContext());
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/explain") {
        const targetPath = url.searchParams.get("path");
        if (!targetPath) {
          writeJson(response, 400, { error: "Missing required query parameter: path" });
          return;
        }

        writeJson(response, 200, await options.service.explain(targetPath));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/explorer") {
        const targetPath = url.searchParams.get("path");
        if (!targetPath) {
          writeJson(response, 400, { error: "Missing required query parameter: path" });
          return;
        }

        const explorer = await options.service.getExplorer(targetPath);
        if (!explorer) {
          writeJson(response, 404, { error: "Path not found" });
          return;
        }

        writeJson(response, 200, explorer);
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/search") {
        const query = url.searchParams.get("q") ?? "";
        const limitValue = url.searchParams.get("limit");
        const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;
        writeJson(response, 200, await options.service.searchProject(query, limit));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/dependencies") {
        const targetPath = url.searchParams.get("path");
        if (!targetPath) {
          writeJson(response, 400, { error: "Missing required query parameter: path" });
          return;
        }

        const directionValue = url.searchParams.get("direction");
        const direction =
          directionValue === "dependencies" || directionValue === "dependents" || directionValue === "both"
            ? directionValue
            : undefined;
        const dependencies = await options.service.getDependencies(targetPath, direction);
        if (!dependencies) {
          writeJson(response, 404, { error: "File not found" });
          return;
        }

        writeJson(response, 200, dependencies);
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/rules") {
        writeJson(response, 200, await options.service.getRules());
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/sessions") {
        const limitValue = url.searchParams.get("limit");
        const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;
        writeJson(response, 200, await options.service.listSessions(limit));
        return;
      }

      if (request.method === "GET" && url.pathname === "/v1/sessions/latest") {
        writeJson(response, 200, await options.service.getLatestSessionDetail());
        return;
      }

      const sessionDetailResponseMatch =
        request.method === "GET" ? url.pathname.match(/^\/v1\/sessions\/([^/]+)\/detail$/u) : null;
      if (sessionDetailResponseMatch) {
        const detail = await options.service.getSessionDetail(decodeURIComponent(sessionDetailResponseMatch[1]));
        if (!detail) {
          writeJson(response, 404, { error: "Session not found" });
          return;
        }

        writeJson(response, 200, detail);
        return;
      }

      const sessionDetailMatch = request.method === "GET" ? url.pathname.match(/^\/v1\/sessions\/([^/]+)$/u) : null;
      if (sessionDetailMatch) {
        const session = await options.service.getSession(decodeURIComponent(sessionDetailMatch[1]));
        if (!session) {
          writeJson(response, 404, { error: "Session not found" });
          return;
        }

        writeJson(response, 200, session);
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/sessions/explicit/start") {
        const body = await readJsonBody<ExplicitSessionStartRequest>(request);
        writeJson(response, 200, await options.service.startExplicitSession(body));
        return;
      }

      const explicitEndMatch =
        request.method === "POST" ? url.pathname.match(/^\/v1\/sessions\/explicit\/([^/]+)\/end$/u) : null;
      if (explicitEndMatch) {
        const body = await readJsonBody<ExplicitSessionEndRequest>(request);
        writeJson(response, 200, await options.service.endExplicitSession(decodeURIComponent(explicitEndMatch[1]), body));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/shutdown") {
        writeJson(response, 200, { ok: true });
        setImmediate(() => {
          void options.service.shutdown();
        });
        return;
      }

      writeJson(response, 404, { error: "Not found" });
    } catch (error) {
      writeError(response, error);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine control server address");
  }

  return {
    server,
    controlUrl: `http://${options.host}:${address.port}`
  };
}
