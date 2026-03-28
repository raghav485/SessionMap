import type { GraphResponse } from "../../../types.js";
import { GraphCanvas } from "../components/graph-canvas.js";

interface GraphViewOptions {
  graph: GraphResponse | null;
  scope: "latest-session" | "project";
  onScopeChange(scope: "latest-session" | "project"): void;
  onNodeSelect(path: string): void;
}

const canvas = new GraphCanvas();

export function renderGraphView(options: GraphViewOptions): HTMLElement {
  const root = document.createElement("section");
  root.className = "view view-graph";

  const panel = document.createElement("section");
  panel.className = "panel";

  const header = document.createElement("div");
  header.className = "panel-header graph-header";
  header.innerHTML = `
    <div>
      <h2>Dependency Graph</h2>
      <p class="panel-subtitle">Explore the latest-session slice or the whole project graph.</p>
    </div>
  `;

  const controls = document.createElement("div");
  controls.className = "segmented";
  for (const scope of ["latest-session", "project"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = scope === options.scope ? "segmented-button active" : "segmented-button";
    button.textContent = scope === "latest-session" ? "Latest Session" : "Project";
    button.addEventListener("click", () => options.onScopeChange(scope));
    controls.appendChild(button);
  }

  header.appendChild(controls);
  panel.appendChild(header);

  if (options.graph?.truncated) {
    const banner = document.createElement("div");
    banner.className = "truncation-banner";
    banner.textContent = "Graph is truncated to keep the dashboard responsive. Switch scope or drill into Explorer for detail.";
    panel.appendChild(banner);
  }

  const canvasHost = document.createElement("div");
  canvasHost.className = "graph-host";
  panel.appendChild(canvasHost);
  root.appendChild(panel);

  if (options.graph) {
    canvas.render(canvasHost, options.graph, options.onNodeSelect);
  } else {
    canvasHost.innerHTML = `<div class="empty-state">Loading graph data…</div>`;
  }

  return root;
}
