export const APP_NAME = "SessionMap";
export const SCHEMA_VERSION = 3;
export const CONFIG_FILE_NAME = "sessionmap.config.json";

export const SESSIONMAP_DIR_NAME = ".sessionmap";
export const RUNTIME_DIR_NAME = `${SESSIONMAP_DIR_NAME}/runtime`;
export const STATE_DIR_NAME = `${SESSIONMAP_DIR_NAME}/state`;
export const GENERATED_MODULES_DIR_NAME = `${SESSIONMAP_DIR_NAME}/modules`;
export const MANIFEST_FILE_NAME = "daemon.json";
export const STORE_FILE_NAME = "store.json";
export const DAEMON_LOG_FILE_NAME = "daemon.stderr.log";
export const GENERATED_ARCHITECTURE_FILE_NAME = "ARCHITECTURE.md";
export const GENERATED_TECH_STACK_FILE_NAME = "TECH_STACK.md";
export const GENERATED_CONVENTIONS_FILE_NAME = "CONVENTIONS.md";
export const GENERATED_MODULES_INDEX_FILE_NAME = "MODULES.md";

export const DEFAULT_CONTROL_HOST = "127.0.0.1";
export const DEFAULT_CONTROL_PORT = 0;
export const DEFAULT_WEB_HOST = "127.0.0.1";
export const DEFAULT_WEB_PORT = 0;
export const DEFAULT_MCP_HOST = "127.0.0.1";
export const DEFAULT_MCP_PORT = 0;
export const DEFAULT_LLM_ENABLED = false;
export const DEFAULT_LLM_PROVIDER = null;
export const DEFAULT_LLM_MODEL = null;
export const DEFAULT_LLM_TEMPERATURE = 0.2;
export const DEFAULT_LLM_MAX_OUTPUT_TOKENS = 1200;
export const DEFAULT_LLM_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_FILE_SIZE_BYTES = 1024 * 1024;
export const DEFAULT_MAX_DEPTH = 20;
export const DEFAULT_ANALYSIS_LANGUAGES = "auto";
export const DEFAULT_SESSION_INACTIVITY_GAP_MS = 180_000;
export const DEFAULT_SESSION_DEBOUNCE_MS = 300;
export const DEFAULT_SESSION_CAPTURE_STDOUT = true;
export const DEFAULT_SESSION_MAX_STDOUT_LINES = 500;
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;
export const DEFAULT_START_TIMEOUT_MS = 5_000;
export const DEFAULT_HEALTH_TIMEOUT_MS = 1_000;
export const DEFAULT_SESSION_LIST_LIMIT = 10;
export const DEFAULT_SEARCH_LIMIT = 20;
export const DEFAULT_RELATED_SESSIONS_LIMIT = 5;
export const DEFAULT_GRAPH_LATEST_SESSION_LIMIT = 200;
export const DEFAULT_GRAPH_PROJECT_LIMIT = 400;
export const DEFAULT_GRAPH_PROJECT_MODULE_LIMIT = 120;
export const DEFAULT_GRAPH_SPARSE_FALLBACK_THRESHOLD = 3;
export const DEFAULT_GRAPH_HIDDEN_PREVIEW_LIMIT = 25;
export const DEFAULT_AGENT_STDOUT_PREVIEW_LINES = 20;
export const DEFAULT_DEPENDENCY_DIRECTION = "both";
export const DEFAULT_LLM_SOURCE_FILE_LIMIT = 6;
export const DEFAULT_LLM_SOURCE_FILE_LINE_LIMIT = 400;
export const DEFAULT_LLM_SOURCE_FILE_BYTE_LIMIT = 12 * 1024;
export const DEFAULT_LLM_TOTAL_SOURCE_BYTE_LIMIT = 48 * 1024;

export const DEFAULT_IGNORE_PATTERNS = ["node_modules", "dist", ".git", ".sessionmap"];
export const MANDATORY_IGNORE_PATTERNS = [".git", "node_modules", ".sessionmap"];
export const TECH_STACK_TRIGGER_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  "pyproject.toml",
  "poetry.lock",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "go.mod",
  "go.sum",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "packages.config",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock"
]);
export const TECH_STACK_TRIGGER_SUFFIXES = [".csproj", ".sln"];

export const TYPE_SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
export const JAVA_SCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs"]);
export const TS_JS_RESOLUTION_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json"
];
export const PYTHON_RESOLUTION_EXTENSIONS = [".py"];
export const PHP_RESOLUTION_EXTENSIONS = [".php"];
export const JAVA_RESOLUTION_EXTENSIONS = [".java"];
