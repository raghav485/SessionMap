import type { DashboardOverviewResponse, SessionSummaryResponse } from "../../../types.js";
import { renderSessionDigest } from "../components/session-digest.js";

interface SessionsViewOptions {
  overview: DashboardOverviewResponse;
  sessions: SessionSummaryResponse[];
}

export function renderSessionsView(options: SessionsViewOptions): HTMLElement {
  const root = document.createElement("section");
  root.className = "view view-sessions";

  const hero = document.createElement("div");
  hero.className = "sessions-layout";
  hero.appendChild(renderSessionDigest(options.overview.latestSession));

  const sidebar = document.createElement("aside");
  sidebar.className = "sessions-sidebar";

  const health = document.createElement("section");
  health.className = "panel";
  health.innerHTML = `
    <div class="panel-header">
      <h2>Project Health</h2>
      <p class="panel-subtitle">${options.overview.projectName}</p>
    </div>
    <div class="digest-stats">
      <div><span class="stat-label">Nodes</span><strong>${options.overview.counts.nodes}</strong></div>
      <div><span class="stat-label">Edges</span><strong>${options.overview.counts.edges}</strong></div>
      <div><span class="stat-label">Sessions</span><strong>${options.overview.counts.sessions}</strong></div>
      <div><span class="stat-label">Last Incremental Update</span><strong>${options.overview.lastIncrementalUpdateMs ?? "n/a"} ms</strong></div>
      <div><span class="stat-label">Last Generated</span><strong>${options.overview.lastGeneratedAt ? new Date(options.overview.lastGeneratedAt).toLocaleString() : "never"}</strong></div>
    </div>
  `;
  sidebar.appendChild(health);

  const summaryPanel = document.createElement("section");
  summaryPanel.className = "panel";
  summaryPanel.innerHTML = `
    <div class="panel-header">
      <h2>Project Summary</h2>
      <p class="panel-subtitle">${options.overview.projectSummarySource ?? "structural"}</p>
    </div>
    <p class="explorer-summary">${options.overview.projectSummary ?? "Run sessionmap generate to materialize generated project context."}</p>
  `;
  sidebar.appendChild(summaryPanel);

  const recent = document.createElement("section");
  recent.className = "panel";
  recent.innerHTML = `
    <div class="panel-header">
      <h2>Recent Sessions</h2>
      <p class="panel-subtitle">Latest tracked and inferred work</p>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "recent-session-list";
  for (const session of options.sessions) {
    const item = document.createElement("article");
    item.className = "recent-session";
    item.innerHTML = `
      <strong>${session.source}</strong>
      <span>${new Date(session.startedAt).toLocaleString()}</span>
      <span>touched ${session.touchedPathsCount} files • modules ${session.touchedModulesCount}</span>
    `;
    list.appendChild(item);
  }
  if (options.sessions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "panel-subtitle";
    empty.textContent = "No sessions have been recorded yet.";
    recent.appendChild(empty);
  } else {
    recent.appendChild(list);
  }

  sidebar.appendChild(recent);
  hero.appendChild(sidebar);
  root.appendChild(hero);

  return root;
}
