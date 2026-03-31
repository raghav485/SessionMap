import type {
  DashboardOverviewResponse,
  ExplorerResponse,
  GraphGranularity,
  GraphHiddenCategory,
  GraphResponse,
  SessionSummaryResponse,
  WebLiveUpdateMessage
} from "../../types.js";
import type { AppRoute } from "./router.js";

export interface GraphViewportState {
  x: number;
  y: number;
  k: number;
}

export interface DashboardAppState {
  route: AppRoute;
  overview: DashboardOverviewResponse | null;
  sessions: SessionSummaryResponse[];
  graph: GraphResponse | null;
  explorer: ExplorerResponse | null;
  liveMessage: WebLiveUpdateMessage | null;
  explorerHighlightPath: string | null;
  graphViewport: GraphViewportState | null;
  projectGraphGranularity: GraphGranularity;
  projectGraphShowHidden: boolean;
  projectGraphActiveHiddenCategory: GraphHiddenCategory | null;
}

export function createInitialState(route: AppRoute): DashboardAppState {
  return {
    route,
    overview: null,
    sessions: [],
    graph: null,
    explorer: null,
    liveMessage: null,
    explorerHighlightPath: null,
    graphViewport: null,
    projectGraphGranularity: "module",
    projectGraphShowHidden: false,
    projectGraphActiveHiddenCategory: null
  };
}
