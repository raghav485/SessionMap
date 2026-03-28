export const MCP_IMPLEMENTATION = {
  name: "sessionmap",
  version: "0.1.0"
} as const;

export const MCP_ENDPOINT_PATH = "/mcp";
export const MCP_ALLOWED_HOSTS = ["127.0.0.1", "localhost", "[::1]"] as const;

export const MCP_TOOLS = {
  getProjectOverview: "get_project_overview",
  getModuleContext: "get_module_context",
  getDependencies: "get_dependencies",
  searchProject: "search_project",
  getLatestSession: "get_latest_session",
  getSession: "get_session",
  beginSession: "begin_session",
  endSession: "end_session"
} as const;

export const MCP_RESOURCES = {
  projectOverview: "sessionmap://project/overview",
  projectRules: "sessionmap://project/rules",
  latestSession: "sessionmap://session/latest",
  moduleTemplate: "sessionmap://module/{encodedPath}",
  sessionTemplate: "sessionmap://session/{sessionId}"
} as const;

export const MCP_PROMPTS = {
  reviewLatestSession: "review_latest_session",
  planChangePlacement: "plan_change_placement"
} as const;
