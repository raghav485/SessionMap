import type { GraphGranularity, GraphHiddenCategory, GraphResponse } from "../../../types.js";
import { GraphCanvas } from "../components/graph-canvas.js";
import type { GraphViewportState } from "../state.js";

interface GraphViewOptions {
  graph: GraphResponse | null;
  scope: "latest-session" | "project";
  granularity: GraphGranularity;
  showHidden: boolean;
  activeHiddenCategory: GraphHiddenCategory | null;
  viewport: GraphViewportState | null;
  onScopeChange(scope: "latest-session" | "project"): void;
  onFocus(path: string): void;
  onDrilldown(path: string): void;
  onFocusExit(): void;
  onGranularityChange(granularity: GraphGranularity): void;
  onShowHiddenChange(showHidden: boolean): void;
  onHiddenCategoryChange(category: GraphHiddenCategory | null): void;
  onNodeSelect(path: string): void;
  onViewportChange(viewport: GraphViewportState | null): void;
}

const canvas = new GraphCanvas();

function getRelativeDrilldownPath(focusPath: string, targetPath: string): string | null {
  if (targetPath === focusPath) {
    return null;
  }

  const prefix = `${focusPath}/`;
  return targetPath.startsWith(prefix) ? targetPath.slice(prefix.length) : null;
}

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
  controls.className = "graph-toolbar";
  const focusApplied = options.scope === "project" && Boolean(options.graph?.focusApplied && options.graph.focus);

  const scopeControls = document.createElement("div");
  scopeControls.className = "segmented";
  for (const scope of ["latest-session", "project"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = scope === options.scope ? "segmented-button active" : "segmented-button";
    button.textContent = scope === "latest-session" ? "Latest Session" : "Project";
    button.addEventListener("click", () => options.onScopeChange(scope));
    scopeControls.appendChild(button);
  }
  controls.appendChild(scopeControls);

  if (focusApplied && options.graph?.focus) {
    const focusControls = document.createElement("div");
    focusControls.className = "graph-focus-controls";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "segmented-button";
    backButton.textContent = "Back";
    backButton.addEventListener("click", () => options.onFocusExit());
    focusControls.appendChild(backButton);

    const focusPill = document.createElement("span");
    focusPill.className = "graph-focus-pill";
    focusPill.textContent = `Focus: ${options.graph.focus.label}`;
    focusControls.appendChild(focusPill);

    controls.appendChild(focusControls);
  }

  if (options.scope === "project" && !focusApplied) {
    const granularityControls = document.createElement("div");
    granularityControls.className = "segmented";

    for (const granularity of ["module", "file"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        granularity === options.granularity ? "segmented-button active" : "segmented-button";
      button.textContent = granularity === "module" ? "Modules" : "Files";
      button.addEventListener("click", () => options.onGranularityChange(granularity));
      granularityControls.appendChild(button);
    }

    controls.appendChild(granularityControls);

    const hiddenButton = document.createElement("button");
    hiddenButton.type = "button";
    hiddenButton.className = options.showHidden ? "segmented-button active" : "segmented-button";
    hiddenButton.textContent = options.showHidden ? "Hide Hidden" : "Show Hidden";
    hiddenButton.setAttribute("aria-pressed", String(options.showHidden));
    hiddenButton.addEventListener("click", () => options.onShowHiddenChange(!options.showHidden));
    controls.appendChild(hiddenButton);
  }

  const navControls = document.createElement("div");
  navControls.className = "graph-nav-controls";

  const zoomOutButton = document.createElement("button");
  zoomOutButton.type = "button";
  zoomOutButton.className = "graph-nav-button";
  zoomOutButton.setAttribute("aria-label", "Zoom out");
  zoomOutButton.textContent = "−";
  zoomOutButton.addEventListener("click", () => canvas.zoomOut());
  navControls.appendChild(zoomOutButton);

  const zoomInButton = document.createElement("button");
  zoomInButton.type = "button";
  zoomInButton.className = "graph-nav-button";
  zoomInButton.setAttribute("aria-label", "Zoom in");
  zoomInButton.textContent = "+";
  zoomInButton.addEventListener("click", () => canvas.zoomIn());
  navControls.appendChild(zoomInButton);

  const fitButton = document.createElement("button");
  fitButton.type = "button";
  fitButton.className = "graph-nav-button graph-nav-button-fit";
  fitButton.setAttribute("aria-label", "Fit graph");
  fitButton.textContent = "Fit";
  fitButton.addEventListener("click", () => canvas.fitToView());
  navControls.appendChild(fitButton);

  controls.appendChild(navControls);

  header.appendChild(controls);
  panel.appendChild(header);

  if (options.scope === "project" && (options.graph?.hiddenSummary.length ?? 0) > 0 && !options.showHidden) {
    const hiddenSummary = document.createElement("div");
    hiddenSummary.className = "graph-summary-chips";

    for (const item of options.graph?.hiddenSummary ?? []) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className =
        item.category === options.activeHiddenCategory ? "graph-summary-chip active" : "graph-summary-chip";
      chip.dataset.category = item.category;
      chip.textContent = item.label;
      chip.setAttribute("aria-pressed", String(item.category === options.activeHiddenCategory));
      chip.addEventListener("click", () => {
        const shouldClose = item.category === options.activeHiddenCategory && !options.graph?.fallbackApplied;
        options.onHiddenCategoryChange(shouldClose ? null : item.category);
      });
      hiddenSummary.appendChild(chip);
    }

    panel.appendChild(hiddenSummary);
  }

  if (focusApplied && options.graph && options.graph.drilldownTrail.length > 0) {
    const breadcrumbs = document.createElement("div");
    breadcrumbs.className = "graph-breadcrumbs";

    for (const trailItem of options.graph.drilldownTrail) {
      const crumb = document.createElement("button");
      crumb.type = "button";
      crumb.className =
        trailItem.path === options.graph.drilldown?.path ? "graph-breadcrumb active" : "graph-breadcrumb";
      crumb.textContent = trailItem.label;
      crumb.addEventListener("click", () => options.onDrilldown(trailItem.relativePath));
      breadcrumbs.appendChild(crumb);
    }

    panel.appendChild(breadcrumbs);
  }

  const activeHiddenGroup =
    options.scope === "project" && !options.showHidden
      ? options.graph?.hiddenPreview.find((group) => group.category === options.activeHiddenCategory) ?? null
      : null;

  if (activeHiddenGroup) {
    const hiddenPanel = document.createElement("section");
    hiddenPanel.className = "graph-hidden-panel";

    const hiddenPanelHeader = document.createElement("div");
    hiddenPanelHeader.className = "graph-hidden-panel-header";
    hiddenPanelHeader.innerHTML = `
      <div>
        <h3>${options.graph?.hiddenSummary.find((item) => item.category === activeHiddenGroup.category)?.label ?? "Hidden items"}</h3>
        <p class="panel-subtitle">Select an item to open it in Explorer without flooding the graph canvas.</p>
      </div>
    `;
    hiddenPanel.appendChild(hiddenPanelHeader);

    const hiddenList = document.createElement("div");
    hiddenList.className = "graph-hidden-list";

    for (const item of activeHiddenGroup.items) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "graph-hidden-item";
      row.innerHTML = `
        <span class="graph-hidden-item-label">${item.label}</span>
        <span class="graph-hidden-item-path">${item.path}</span>
      `;
      row.addEventListener("click", () => options.onNodeSelect(item.path));
      hiddenList.appendChild(row);
    }

    hiddenPanel.appendChild(hiddenList);

    if (activeHiddenGroup.truncated) {
      const truncatedNotice = document.createElement("p");
      truncatedNotice.className = "graph-hidden-truncated";
      truncatedNotice.textContent = "Only the first 25 hidden items are shown here. Use Show Hidden for the full graph.";
      hiddenPanel.appendChild(truncatedNotice);
    }

    panel.appendChild(hiddenPanel);
  }

  if (options.graph?.truncated) {
    const banner = document.createElement("div");
    banner.className = "truncation-banner";
    banner.textContent = "Graph is truncated to keep the dashboard responsive. Switch scope or drill into Explorer for detail.";
    panel.appendChild(banner);
  }

  const canvasHost = document.createElement("div");
  canvasHost.className = "graph-host";
  panel.appendChild(canvasHost);

  const hint = document.createElement("p");
  hint.className = "graph-hint";
  hint.textContent =
    focusApplied && options.graph?.focus
      ? `Focus mode isolates ${options.graph.focus.label} and drills through its internal directories before dropping to raw files. Scroll to zoom, drag the background to pan, click directory clusters to drill deeper, and use Back to step out.`
      : options.scope === "project" && options.graph?.fallbackApplied
      ? "This project is sparse enough that the default architecture filter would be misleading as a graph. Use the hidden-items list above for quick drill-in, or Show Hidden to render everything in the canvas."
      : options.scope === "project" && options.granularity === "module"
      ? "Project view emphasizes architectural groups by default. Scroll to zoom, drag the background to pan, click an architecture node to focus it, and use Show Hidden to reveal filtered support files."
      : options.scope === "project"
        ? "Project file view keeps connected architecture files visible by default. Scroll to zoom, drag the background to pan, and use Show Hidden when you need the filtered support files too."
        : "Scroll to zoom, drag the background to pan, and drag nodes to untangle local clusters.";
  panel.appendChild(hint);

  root.appendChild(panel);

  if (options.graph && options.graph.nodes.length > 0) {
    canvas.render(
      canvasHost,
      options.graph,
      (node) => {
        if (options.scope === "project" && !focusApplied && options.graph?.granularity === "module" && node.type === "module") {
          options.onFocus(node.path);
          return;
        }

        if (focusApplied && options.graph?.focus && node.type === "directory") {
          const drilldownPath = getRelativeDrilldownPath(options.graph.focus.path, node.path);
          if (drilldownPath) {
            options.onDrilldown(drilldownPath);
            return;
          }
        }

        options.onNodeSelect(node.path);
      },
      {
        viewport: options.viewport,
        onViewportChange: options.onViewportChange
      }
    );
  } else if (options.graph?.fallbackApplied) {
    canvasHost.innerHTML = `<div class="empty-state">The project graph is intentionally filtered to stay architectural. Use the hidden-items list above or Show Hidden to inspect the filtered nodes.</div>`;
  } else if (options.graph) {
    canvasHost.innerHTML = `<div class="empty-state">No graph nodes are available for the selected scope yet.</div>`;
  } else {
    canvasHost.innerHTML = `<div class="empty-state">Loading graph data…</div>`;
  }

  return root;
}
