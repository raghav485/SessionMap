import type {
  ActivitySession,
  ArchitectureRule,
  DashboardOverviewResponse,
  DaemonManifest,
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

async function request<T>(
  manifest: DaemonManifest,
  route: string,
  init?: RequestInit,
  includeAuth = true
): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (includeAuth) {
    headers.set("Authorization", `Bearer ${manifest.authToken}`);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  const response = await fetch(`${manifest.controlUrl}${route}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function pingDaemon(manifest: DaemonManifest): Promise<boolean> {
  try {
    const response = await fetch(`${manifest.controlUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export function getDaemonStatus(manifest: DaemonManifest): Promise<DaemonStatusResponse> {
  return request<DaemonStatusResponse>(manifest, "/v1/status");
}

export function getProjectOverview(manifest: DaemonManifest): Promise<DashboardOverviewResponse> {
  return request<DashboardOverviewResponse>(manifest, "/v1/overview");
}

export function triggerScan(manifest: DaemonManifest): Promise<ScanSummary> {
  return request<ScanSummary>(manifest, "/v1/scan", { method: "POST" });
}

export function triggerGenerate(manifest: DaemonManifest): Promise<GenerateSummary> {
  return request<GenerateSummary>(manifest, "/v1/generate", { method: "POST" });
}

export function getGeneratedContext(manifest: DaemonManifest): Promise<GeneratedContextResponse> {
  return request<GeneratedContextResponse>(manifest, "/v1/generated-context");
}

export function explainPath(manifest: DaemonManifest, targetPath: string): Promise<ExplainResponse> {
  const encoded = encodeURIComponent(targetPath);
  return request<ExplainResponse>(manifest, `/v1/explain?path=${encoded}`);
}

export function getExplorer(manifest: DaemonManifest, targetPath: string): Promise<ExplorerResponse> {
  const encoded = encodeURIComponent(targetPath);
  return request<ExplorerResponse>(manifest, `/v1/explorer?path=${encoded}`);
}

export function searchProject(
  manifest: DaemonManifest,
  query: string,
  limit?: number
): Promise<SearchResultResponse[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  return request<SearchResultResponse[]>(manifest, `/v1/search?${params.toString()}`);
}

export function getDependencies(
  manifest: DaemonManifest,
  targetPath: string,
  direction?: DependencyDirection
): Promise<DependencyResponse> {
  const params = new URLSearchParams();
  params.set("path", targetPath);
  if (direction) {
    params.set("direction", direction);
  }

  return request<DependencyResponse>(manifest, `/v1/dependencies?${params.toString()}`);
}

export function getRules(manifest: DaemonManifest): Promise<ArchitectureRule[]> {
  return request<ArchitectureRule[]>(manifest, "/v1/rules");
}

export function listSessions(manifest: DaemonManifest, limit?: number): Promise<ActivitySession[]> {
  const suffix = typeof limit === "number" ? `?limit=${limit}` : "";
  return request<ActivitySession[]>(manifest, `/v1/sessions${suffix}`);
}

export function getLatestSessionDetail(manifest: DaemonManifest): Promise<SessionDetailResponse | null> {
  return request<SessionDetailResponse | null>(manifest, "/v1/sessions/latest");
}

export function getSession(manifest: DaemonManifest, sessionId: string): Promise<ActivitySession> {
  return request<ActivitySession>(manifest, `/v1/sessions/${encodeURIComponent(sessionId)}`);
}

export function getSessionDetail(manifest: DaemonManifest, sessionId: string): Promise<SessionDetailResponse> {
  return request<SessionDetailResponse>(manifest, `/v1/sessions/${encodeURIComponent(sessionId)}/detail`);
}

export function startExplicitSession(
  manifest: DaemonManifest,
  payload: ExplicitSessionStartRequest
): Promise<ExplicitSessionStartResponse> {
  return request<ExplicitSessionStartResponse>(manifest, "/v1/sessions/explicit/start", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function endExplicitSession(
  manifest: DaemonManifest,
  sessionId: string,
  payload: ExplicitSessionEndRequest
): Promise<ActivitySession> {
  return request<ActivitySession>(manifest, `/v1/sessions/explicit/${encodeURIComponent(sessionId)}/end`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function shutdownDaemon(manifest: DaemonManifest): Promise<{ ok: true }> {
  return request<{ ok: true }>(manifest, "/v1/shutdown", { method: "POST" });
}
