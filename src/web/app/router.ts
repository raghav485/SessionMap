export type AppRoute =
  | { name: "sessions" }
  | { name: "graph"; scope: "latest-session" | "project"; focus?: string; drilldown?: string }
  | { name: "explorer"; path: string };

function normalizePath(pathValue: string | null): string {
  return pathValue && pathValue.trim().length > 0 ? pathValue : ".";
}

function normalizeDrilldownPath(pathValue: string | null): string | undefined {
  if (!pathValue || pathValue.trim().length === 0) {
    return undefined;
  }

  const normalized = pathValue
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\.\/+/u, "")
    .replace(/^\/+/u, "")
    .replace(/\/$/u, "");

  return normalized.length > 0 && normalized !== "." ? normalized : undefined;
}

export function parseRoute(hash: string): AppRoute {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const [rawPath, rawQuery = ""] = normalizedHash.split("?");
  const routePath = rawPath || "/sessions";
  const query = new URLSearchParams(rawQuery);

  if (routePath === "/graph") {
    const scope = query.get("scope") === "project" ? "project" : "latest-session";
    const focus = scope === "project" ? normalizePath(query.get("focus")) : ".";
    const drilldown = scope === "project" && focus !== "." ? normalizeDrilldownPath(query.get("drilldown")) : undefined;
    return {
      name: "graph",
      scope,
      focus: focus === "." ? undefined : focus,
      drilldown
    };
  }

  if (routePath === "/explorer") {
    return {
      name: "explorer",
      path: normalizePath(query.get("path"))
    };
  }

  return {
    name: "sessions"
  };
}

export function formatRoute(route: AppRoute): string {
  if (route.name === "graph") {
    const params = new URLSearchParams({ scope: route.scope });
    if (route.focus) {
      params.set("focus", route.focus);
    }
    if (route.drilldown) {
      params.set("drilldown", route.drilldown);
    }

    return `#/graph?${params.toString()}`;
  }

  if (route.name === "explorer") {
    return `#/explorer?path=${encodeURIComponent(route.path)}`;
  }

  return "#/sessions";
}

export function navigate(route: AppRoute): void {
  window.location.hash = formatRoute(route);
}
