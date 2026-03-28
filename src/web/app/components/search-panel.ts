import type { SearchResultResponse } from "../../../types.js";

interface SearchPanelOptions {
  onQuery(query: string): Promise<SearchResultResponse[]>;
  onSelect(result: SearchResultResponse): void;
}

export interface SearchPanelHandle {
  element: HTMLElement;
  reset(): void;
}

export function createSearchPanel(options: SearchPanelOptions): SearchPanelHandle {
  const root = document.createElement("div");
  root.className = "search-panel";

  const input = document.createElement("input");
  input.type = "search";
  input.className = "search-input";
  input.placeholder = "Search paths, files, or summaries";

  const results = document.createElement("div");
  results.className = "search-results";
  results.hidden = true;

  let debounceTimer: number | null = null;
  let activeRequest = 0;

  const renderResults = (items: SearchResultResponse[]): void => {
    results.innerHTML = "";
    if (items.length === 0) {
      results.hidden = true;
      return;
    }

    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.innerHTML = `
        <span class="search-result-path">${item.path}</span>
        <span class="search-result-meta">${item.language}${item.moduleBoundary ? ` • ${item.moduleBoundary}` : ""}</span>
      `;
      button.addEventListener("click", () => {
        options.onSelect(item);
        input.value = "";
        results.hidden = true;
      });
      results.appendChild(button);
    }

    results.hidden = false;
  };

  input.addEventListener("input", () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }

    debounceTimer = window.setTimeout(async () => {
      const query = input.value.trim();
      if (!query) {
        renderResults([]);
        return;
      }

      const requestId = ++activeRequest;
      const matches = await options.onQuery(query);
      if (requestId === activeRequest) {
        renderResults(matches);
      }
    }, 200);
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target as Node)) {
      results.hidden = true;
    }
  });

  root.append(input, results);

  return {
    element: root,
    reset() {
      input.value = "";
      results.hidden = true;
      results.innerHTML = "";
    }
  };
}
