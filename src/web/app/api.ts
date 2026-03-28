import type {
  DashboardOverviewResponse,
  ExplorerResponse,
  GraphResponse,
  SearchResultResponse,
  SessionDetailResponse,
  SessionSummaryResponse,
  TechStackSummary,
  WebLiveUpdateMessage
} from "../../types.js";

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchOverview(): Promise<DashboardOverviewResponse> {
  return requestJson<DashboardOverviewResponse>("/api/overview");
}

export function fetchSessions(limit = 10): Promise<SessionSummaryResponse[]> {
  return requestJson<SessionSummaryResponse[]>(`/api/sessions?limit=${limit}`);
}

export function fetchLatestSession(): Promise<SessionDetailResponse | null> {
  return requestJson<SessionDetailResponse | null>("/api/sessions/latest");
}

export function fetchSessionDetail(sessionId: string): Promise<SessionDetailResponse> {
  return requestJson<SessionDetailResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function fetchGraph(scope: "latest-session" | "project", sessionId?: string, limitNodes?: number): Promise<GraphResponse> {
  const params = new URLSearchParams();
  params.set("scope", scope);
  if (sessionId) {
    params.set("sessionId", sessionId);
  }
  if (limitNodes !== undefined) {
    params.set("limitNodes", String(limitNodes));
  }

  return requestJson<GraphResponse>(`/api/graph?${params.toString()}`);
}

export function fetchExplorer(path: string): Promise<ExplorerResponse> {
  return requestJson<ExplorerResponse>(`/api/explorer?path=${encodeURIComponent(path)}`);
}

export function fetchSearch(query: string, limit = 20): Promise<SearchResultResponse[]> {
  return requestJson<SearchResultResponse[]>(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export function fetchTechStack(): Promise<TechStackSummary> {
  return requestJson<TechStackSummary>("/api/tech-stack");
}

export function connectLiveUpdates(onMessage: (message: WebLiveUpdateMessage) => void): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data as string) as WebLiveUpdateMessage;
    onMessage(payload);
  });
  return socket;
}
