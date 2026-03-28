import type {
  DashboardOverviewResponse,
  ExplorerResponse,
  GraphResponse,
  SessionSummaryResponse,
  WebLiveUpdateMessage
} from "../../types.js";
import type { AppRoute } from "./router.js";

export interface DashboardAppState {
  route: AppRoute;
  overview: DashboardOverviewResponse | null;
  sessions: SessionSummaryResponse[];
  graph: GraphResponse | null;
  explorer: ExplorerResponse | null;
  liveMessage: WebLiveUpdateMessage | null;
  explorerHighlightPath: string | null;
}

export function createInitialState(route: AppRoute): DashboardAppState {
  return {
    route,
    overview: null,
    sessions: [],
    graph: null,
    explorer: null,
    liveMessage: null,
    explorerHighlightPath: null
  };
}
