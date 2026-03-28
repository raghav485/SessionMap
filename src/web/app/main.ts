import "./styles.css";

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

async function loadRouteData(): Promise<void> {
  if (state.route.name === "sessions") {
    const [overview, sessions, graph] = await Promise.all([
      fetchOverview(),
      fetchSessions(),
      fetchGraph("latest-session")
    ]);
    state.overview = overview;
    state.sessions = sessions;
    state.graph = graph;
    state.explorer = null;
    state.explorerHighlightPath = null;
    return;
  }

  if (state.route.name === "graph") {
    const [overview, graph] = await Promise.all([fetchOverview(), fetchGraph(state.route.scope)]);
    state.overview = overview;
    state.graph = graph;
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
        onScopeChange(scope) {
          navigate({
            name: "graph",
            scope
          });
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
      state.graph = await fetchGraph(state.route.scope);
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
  state.route = parseRoute(window.location.hash);
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
