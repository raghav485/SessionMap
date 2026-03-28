export type AppRoute =
  | { name: "sessions" }
  | { name: "graph"; scope: "latest-session" | "project" }
  | { name: "explorer"; path: string };

function normalizePath(pathValue: string | null): string {
  return pathValue && pathValue.trim().length > 0 ? pathValue : ".";
}

export function parseRoute(hash: string): AppRoute {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const [rawPath, rawQuery = ""] = normalizedHash.split("?");
  const routePath = rawPath || "/sessions";
  const query = new URLSearchParams(rawQuery);

  if (routePath === "/graph") {
    return {
      name: "graph",
      scope: query.get("scope") === "project" ? "project" : "latest-session"
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
    return `#/graph?scope=${route.scope}`;
  }

  if (route.name === "explorer") {
    return `#/explorer?path=${encodeURIComponent(route.path)}`;
  }

  return "#/sessions";
}

export function navigate(route: AppRoute): void {
  window.location.hash = formatRoute(route);
}
