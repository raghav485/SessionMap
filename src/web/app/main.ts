import "./styles.css";

import type { GraphHiddenCategory, GraphResponse } from "../../types.js";
import {
  connectLiveUpdates,
  fetchExplorer,
  fetchGraph,
  fetchOverview,
  fetchSearch,
  fetchSessions
} from "./api.js";
import { createSearchPanel } from "./components/search-panel.js";
import { navigate, parseRoute } from "./router.js";
import { createInitialState } from "./state.js";
import { renderExplorerView } from "./views/explorer-view.js";
import { renderGraphView } from "./views/graph-view.js";
import { renderSessionsView } from "./views/sessions-view.js";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("Dashboard root element not found");
}

const state = createInitialState(parseRoute(window.location.hash));

appRoot.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brand-block">
        <span class="eyebrow">SessionMap</span>
        <h1>Review Workbench</h1>
        <p id="project-meta" class="project-meta">Loading project state…</p>
      </div>
      <nav class="nav">
        <button type="button" data-route="sessions" class="nav-button">Sessions</button>
        <button type="button" data-route="graph" class="nav-button">Graph</button>
      </nav>
      <div id="search-slot"></div>
    </header>
    <main id="view-root" class="view-root"></main>
  </div>
`;

const viewRoot = document.querySelector<HTMLElement>("#view-root");
const projectMeta = document.querySelector<HTMLElement>("#project-meta");
const searchSlot = document.querySelector<HTMLElement>("#search-slot");

if (!viewRoot || !projectMeta || !searchSlot) {
  throw new Error("Dashboard shell failed to initialize");
}

const resolvedViewRoot = viewRoot;
const resolvedProjectMeta = projectMeta;
const resolvedSearchSlot = searchSlot;

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".nav-button"))) {
  button.addEventListener("click", () => {
    if (button.dataset.route === "graph") {
      navigate({ name: "graph", scope: "latest-session" });
      return;
    }

    navigate({ name: "sessions" });
  });
}

const searchPanel = createSearchPanel({
  onQuery: async (query) => fetchSearch(query),
  onSelect: (result) => {
    navigate({ name: "explorer", path: result.path });
  }
});
resolvedSearchSlot.appendChild(searchPanel.element);

function pulseView(): void {
  resolvedViewRoot.classList.remove("view-pulse");
  void resolvedViewRoot.offsetWidth;
  resolvedViewRoot.classList.add("view-pulse");
  window.setTimeout(() => {
    resolvedViewRoot.classList.remove("view-pulse");
  }, 700);
}

function updateChrome(): void {
  const overview = state.overview;
  resolvedProjectMeta.textContent = overview
    ? `${overview.projectName} • ${overview.counts.nodes} nodes • ${overview.counts.sessions} sessions • watcher ${overview.watcherRunning ? "online" : "offline"}`
    : "Loading project state…";

  for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>(".nav-button"))) {
    const isActive =
      (button.dataset.route === "sessions" && state.route.name === "sessions") ||
      (button.dataset.route === "graph" && state.route.name === "graph");
    button.classList.toggle("active", isActive);
  }
}

function shouldResetGraphViewport(previousRoute: typeof state.route, nextRoute: typeof state.route): boolean {
  if (previousRoute.name !== "graph" && nextRoute.name === "graph") {
    return true;
  }

  if (previousRoute.name === "graph" && nextRoute.name !== "graph") {
    return true;
  }

  return (
    previousRoute.name === "graph" &&
    nextRoute.name === "graph" &&
    (previousRoute.scope !== nextRoute.scope ||
      previousRoute.focus !== nextRoute.focus ||
      previousRoute.drilldown !== nextRoute.drilldown)
  );
}

function fetchGraphForScope(scope: "latest-session" | "project") {
  if (scope === "project") {
    const focus = state.route.name === "graph" && state.route.scope === "project" ? state.route.focus : undefined;
    const drilldown =
      state.route.name === "graph" && state.route.scope === "project" ? state.route.drilldown : undefined;
    return fetchGraph(scope, {
      granularity: focus ? "file" : state.projectGraphGranularity,
      showHidden: state.projectGraphShowHidden,
      focus,
      drilldown
    });
  }

  return fetchGraph(scope);
}

function getDefaultHiddenCategory(graph: GraphResponse | null): GraphHiddenCategory | null {
  if (!graph || graph.scope !== "project" || graph.hiddenPreview.length === 0) {
    return null;
  }

  if (graph.fallbackApplied) {
    return graph.hiddenPreview.find((group) => group.category === "isolated")?.category ?? graph.hiddenPreview[0]?.category ?? null;
  }

  return null;
}

function syncProjectHiddenCategorySelection(graph: GraphResponse | null): void {
  if (!graph || graph.scope !== "project" || state.projectGraphShowHidden || graph.hiddenPreview.length === 0) {
    state.projectGraphActiveHiddenCategory = null;
    return;
  }

  const availableCategories = new Set(graph.hiddenPreview.map((group) => group.category));
  const fallbackCategory = getDefaultHiddenCategory(graph);
  if (fallbackCategory) {
    state.projectGraphActiveHiddenCategory = fallbackCategory;
    return;
  }

  if (
    state.projectGraphActiveHiddenCategory &&
    availableCategories.has(state.projectGraphActiveHiddenCategory)
  ) {
    return;
  }

  state.projectGraphActiveHiddenCategory = null;
}

async function updateProjectGraphPreferences(next: {
  granularity?: typeof state.projectGraphGranularity;
  showHidden?: boolean;
}): Promise<void> {
  const nextGranularity = next.granularity ?? state.projectGraphGranularity;
  const nextShowHidden = next.showHidden ?? state.projectGraphShowHidden;
  const granularityChanged = nextGranularity !== state.projectGraphGranularity;
  const showHiddenChanged = nextShowHidden !== state.projectGraphShowHidden;

  if (!granularityChanged && !showHiddenChanged) {
    return;
  }

  state.projectGraphGranularity = nextGranularity;
  state.projectGraphShowHidden = nextShowHidden;
  if (granularityChanged || showHiddenChanged) {
    state.graphViewport = null;
  }

  state.graph = await fetchGraphForScope("project");
  syncProjectHiddenCategorySelection(state.graph);
  pulseView();
  render();
}

async function loadRouteData(): Promise<void> {
  if (state.route.name === "sessions") {
    const [overview, sessions, graph] = await Promise.all([
      fetchOverview(),
      fetchSessions(),
      fetchGraphForScope("latest-session")
    ]);
    state.overview = overview;
    state.sessions = sessions;
    state.graph = graph;
    state.projectGraphActiveHiddenCategory = null;
    state.explorer = null;
    state.explorerHighlightPath = null;
    return;
  }

  if (state.route.name === "graph") {
    const [overview, graph] = await Promise.all([fetchOverview(), fetchGraphForScope(state.route.scope)]);
    state.overview = overview;
    state.graph = graph;
    if (state.route.scope === "project") {
      syncProjectHiddenCategorySelection(graph);
    } else {
      state.projectGraphActiveHiddenCategory = null;
    }
    state.explorer = null;
    state.explorerHighlightPath = null;
    return;
  }

  const [overview, explorer] = await Promise.all([
    fetchOverview(),
    fetchExplorer(state.route.path).catch(() => null)
  ]);
  state.overview = overview;
  state.explorer = explorer;
}

function render(): void {
  updateChrome();
  resolvedViewRoot.innerHTML = "";

  if (!state.overview) {
    resolvedViewRoot.innerHTML = `<section class="panel"><div class="empty-state">Loading dashboard…</div></section>`;
    return;
  }

  if (state.route.name === "sessions") {
    resolvedViewRoot.appendChild(
      renderSessionsView({
        overview: state.overview,
        sessions: state.sessions
      })
    );
    return;
  }

  if (state.route.name === "graph") {
    resolvedViewRoot.appendChild(
      renderGraphView({
        graph: state.graph,
        scope: state.route.scope,
        granularity: state.projectGraphGranularity,
        showHidden: state.projectGraphShowHidden,
        activeHiddenCategory: state.projectGraphActiveHiddenCategory,
        viewport: state.graphViewport,
        onScopeChange(scope) {
          navigate({
            name: "graph",
            scope
          });
        },
        onFocus(path) {
          navigate({
            name: "graph",
            scope: "project",
            focus: path
          });
        },
        onDrilldown(drilldown) {
          const focus = state.route.name === "graph" && state.route.scope === "project" ? state.route.focus : undefined;
          if (!focus) {
            return;
          }

          navigate({
            name: "graph",
            scope: "project",
            focus,
            drilldown
          });
        },
        onFocusExit() {
          if (state.route.name === "graph" && state.route.scope === "project" && state.route.focus) {
            if (state.route.drilldown) {
              const segments = state.route.drilldown.split("/").filter(Boolean);
              if (segments.length > 1) {
                navigate({
                  name: "graph",
                  scope: "project",
                  focus: state.route.focus,
                  drilldown: segments.slice(0, -1).join("/")
                });
                return;
              }
            }

            if (state.route.focus && state.route.drilldown) {
              navigate({
                name: "graph",
                scope: "project",
                focus: state.route.focus
              });
              return;
            }
          }

          navigate({
            name: "graph",
            scope: "project"
          });
        },
        onGranularityChange(granularity) {
          void updateProjectGraphPreferences({
            granularity
          });
        },
        onShowHiddenChange(showHidden) {
          void updateProjectGraphPreferences({
            showHidden
          });
        },
        onHiddenCategoryChange(category) {
          state.projectGraphActiveHiddenCategory = category;
          render();
        },
        onViewportChange(viewport) {
          state.graphViewport = viewport;
        },
        onNodeSelect(path) {
          navigate({
            name: "explorer",
            path
          });
        }
      })
    );
    return;
  }

  resolvedViewRoot.appendChild(
    renderExplorerView({
      explorer: state.explorer,
      highlightPath: state.explorerHighlightPath
    })
  );
}

async function refreshForLiveUpdate(): Promise<void> {
  if (state.route.name === "sessions") {
    const [overview, sessions] = await Promise.all([fetchOverview(), fetchSessions()]);
    state.overview = overview;
    state.sessions = sessions;
    pulseView();
    return;
  }

  if (state.route.name === "graph") {
    state.overview = await fetchOverview();
    if (
      state.route.scope === "latest-session" ||
      state.liveMessage?.reason === "scan-completed" ||
      state.liveMessage?.reason === "generation-completed"
    ) {
      state.graph = await fetchGraphForScope(state.route.scope);
      if (state.route.scope === "project") {
        syncProjectHiddenCategorySelection(state.graph);
      } else {
        state.projectGraphActiveHiddenCategory = null;
      }
      pulseView();
    }
    return;
  }

  state.overview = await fetchOverview();
  const currentPath = state.route.path;
  const affectedPaths = state.liveMessage?.affectedPaths ?? [];
  if (
    affectedPaths.includes(currentPath) ||
    state.liveMessage?.reason === "scan-completed" ||
    state.liveMessage?.reason === "generation-completed"
  ) {
    state.explorer = await fetchExplorer(currentPath).catch(() => null);
    state.explorerHighlightPath = currentPath;
    pulseView();
    window.setTimeout(() => {
      state.explorerHighlightPath = null;
      render();
    }, 1200);
  }
}

window.addEventListener("hashchange", async () => {
  const nextRoute = parseRoute(window.location.hash);
  if (shouldResetGraphViewport(state.route, nextRoute)) {
    state.graphViewport = null;
  }
  state.route = nextRoute;
  searchPanel.reset();
  await loadRouteData();
  render();
});

void (async () => {
  await loadRouteData();
  render();
  connectLiveUpdates(async (message) => {
    state.liveMessage = message;
    await refreshForLiveUpdate();
    render();
  });
})();
