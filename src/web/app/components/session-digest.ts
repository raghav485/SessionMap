import type { SessionDetailResponse } from "../../../types.js";

function createChip(label: string): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = label;
  return chip;
}

export function renderSessionDigest(detail: SessionDetailResponse | null): HTMLElement {
  const section = document.createElement("section");
  section.className = "panel session-digest";

  const header = document.createElement("div");
  header.className = "panel-header";

  const title = document.createElement("h2");
  title.textContent = detail ? "Latest Session Digest" : "No Sessions Yet";
  header.appendChild(title);

  if (detail) {
    const meta = document.createElement("p");
    meta.className = "panel-subtitle";
    meta.textContent = `${detail.session.source} • ${detail.session.actor} • confidence ${detail.session.confidence.toFixed(2)}`;
    header.appendChild(meta);
  } else {
    const meta = document.createElement("p");
    meta.className = "panel-subtitle";
    meta.textContent = "Run sessionmap track -- <command...> to capture the next working session.";
    header.appendChild(meta);
  }

  section.appendChild(header);

  if (!detail) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <p>SessionMap is already analyzing the project and tracking file changes.</p>
      <p>The dashboard will surface the latest touched modules, impacted files, and review order once a session is captured.</p>
    `;
    section.appendChild(empty);
    return section;
  }

  const stats = document.createElement("div");
  stats.className = "digest-stats";
  stats.innerHTML = `
    <div><span class="stat-label">Started</span><strong>${new Date(detail.session.startedAt).toLocaleString()}</strong></div>
    <div><span class="stat-label">Ended</span><strong>${new Date(detail.session.endedAt).toLocaleString()}</strong></div>
    <div><span class="stat-label">Touched Files</span><strong>${detail.touchedFiles.length}</strong></div>
    <div><span class="stat-label">Impacted Files</span><strong>${detail.impactedFiles.length}</strong></div>
  `;
  section.appendChild(stats);

  const modules = document.createElement("div");
  modules.className = "chip-row";
  for (const moduleDetail of detail.touchedModules) {
    modules.appendChild(createChip(`${moduleDetail.moduleBoundary} (${moduleDetail.touchedFileCount})`));
  }
  section.appendChild(modules);

  const review = document.createElement("div");
  review.className = "review-order";
  review.innerHTML = `<h3>Suggested Review Order</h3>`;
  const list = document.createElement("ol");
  for (const item of detail.reviewOrder) {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    list.appendChild(listItem);
  }
  review.appendChild(list);
  section.appendChild(review);

  if (detail.agentStdoutPreview) {
    const preview = document.createElement("div");
    preview.className = "stdout-preview";
    preview.innerHTML = "<h3>Agent Output Preview</h3>";
    const pre = document.createElement("pre");
    pre.textContent = detail.agentStdoutPreview;
    preview.appendChild(pre);
    section.appendChild(preview);
  }

  return section;
}
