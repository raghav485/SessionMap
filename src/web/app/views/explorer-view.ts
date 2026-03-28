import type { ExplorerResponse } from "../../../types.js";

interface ExplorerViewOptions {
  explorer: ExplorerResponse | null;
  highlightPath: string | null;
}

export function renderExplorerView(options: ExplorerViewOptions): HTMLElement {
  const root = document.createElement("section");
  root.className = "view view-explorer";

  if (!options.explorer) {
    root.innerHTML = `<section class="panel"><div class="empty-state">Choose a file or search result to inspect it here.</div></section>`;
    return root;
  }

  const panel = document.createElement("section");
  panel.className = options.highlightPath ? "panel panel-highlight" : "panel";

  if (options.explorer.kind === "file") {
    panel.innerHTML = `
      <div class="panel-header">
        <h2>${options.explorer.path}</h2>
        <p class="panel-subtitle">${options.explorer.language} • ${options.explorer.moduleBoundary ?? "no module boundary"}</p>
      </div>
      <div class="digest-stats">
        <div><span class="stat-label">Incoming</span><strong>${options.explorer.incomingCount}</strong></div>
        <div><span class="stat-label">Outgoing</span><strong>${options.explorer.outgoingCount}</strong></div>
        <div><span class="stat-label">Recently Touched</span><strong>${options.explorer.lastTouchedByLatestSession ? "Yes" : "No"}</strong></div>
      </div>
      <p class="explorer-summary">${options.explorer.summary || "No structural summary available yet."}</p>
      <div class="explorer-columns">
        <div>
          <h3>Exports</h3>
          <ul>${options.explorer.exports.map((item) => `<li>${item}</li>`).join("") || "<li>None</li>"}</ul>
        </div>
        <div>
          <h3>Dependencies</h3>
          <ul>${options.explorer.dependencies.map((item) => `<li>${item}</li>`).join("") || "<li>None</li>"}</ul>
        </div>
        <div>
          <h3>Dependents</h3>
          <ul>${options.explorer.dependents.map((item) => `<li>${item}</li>`).join("") || "<li>None</li>"}</ul>
        </div>
      </div>
      <div class="module-files">
        <h3>Module Files</h3>
        <ul>${options.explorer.moduleFiles.map((item) => `<li>${item}</li>`).join("") || "<li>None</li>"}</ul>
      </div>
    `;
  } else {
    panel.innerHTML = `
      <div class="panel-header">
        <h2>${options.explorer.path}</h2>
        <p class="panel-subtitle">${options.explorer.fileCount} files • ${options.explorer.moduleBoundary ?? "directory view"}</p>
      </div>
      <p class="explorer-summary">${options.explorer.summary ?? "No generated module summary available yet."}</p>
      <p class="panel-subtitle">Summary source: ${options.explorer.summarySource ?? "n/a"}</p>
      <div class="explorer-columns">
        <div>
          <h3>Children</h3>
          <ul>${options.explorer.children.map((item) => `<li>${item}</li>`).join("") || "<li>None</li>"}</ul>
        </div>
        <div>
          <h3>Related Sessions</h3>
          <ul>${
            options.explorer.relatedSessions
              .map((session) => `<li>${session.source} • ${new Date(session.startedAt).toLocaleString()}</li>`)
              .join("") || "<li>None</li>"
          }</ul>
        </div>
      </div>
    `;
  }

  root.appendChild(panel);
  return root;
}
