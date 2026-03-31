import fs from "node:fs";
import path from "node:path";

import type { GraphHiddenCategory, GraphRelationshipSource, LanguageTier, ProjectNode } from "../types.js";

const TEST_DIRECTORY_PATTERN = /(^|\/)(__tests__|test|tests)(\/|$)/u;
const TEST_FILE_PATTERN = /\.(test|spec)\.[^/]+$/u;
const CONFIG_FILE_PREFIXES = [
  "tsconfig",
  "vite.config.",
  "vitest.config.",
  "jest.config.",
  "eslint.config.",
  "prettier.config.",
  "tailwind.config.",
  "postcss.config.",
  "webpack.config.",
  "rollup.config.",
  "babel.config.",
  "next.config.",
  "nuxt.config.",
  "svelte.config.",
  "astro.config.",
  "playwright.config."
];
const CONFIG_EXTENSIONS = new Set([".json", ".jsonc", ".yaml", ".yml", ".toml", ".ini", ".conf", ".env"]);
const ASSET_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".avif"
]);
const ARCHITECTURE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".rb",
  ".php"
]);
const SUPPORT_DIRECTORY_SEGMENTS = new Set([
  "coverage",
  "dist",
  "build",
  "docs",
  "doc",
  "fixtures",
  "fixture",
  "__fixtures__",
  "e2e",
  "scripts",
  "script",
  "test-results",
  ".next",
  ".turbo",
  ".storybook"
]);
const SOURCE_ROOT_SEGMENTS = new Set(["src", "source", "app", "lib", "server", "client", "frontend", "backend", "web", "api"]);
const PACKAGE_MANIFEST_FILE = "package.json";
const JS_CONFIG_BASENAMES = new Set(["tsconfig.json", "jsconfig.json"]);
const BROWSER_MANIFEST_PATTERN = /^manifest(?:\.[^.]+)?\.json$/u;
const VITE_CONFIG_PATTERN = /^vite\.config\.(?:ts|js|mts|mjs|cts|cjs)$/u;

interface PackageManifestRecord {
  rootPath: string;
  name?: string;
  dependencies: string[];
  entryFiles: string[];
}

interface EntrypointSignal {
  rootPath: string;
  entryFiles: string[];
}

export interface ArchitectureFileDescriptor {
  node: ProjectNode;
  touched: boolean;
  impacted: boolean;
  hiddenCategory: GraphHiddenCategory | null;
  architectureUnitPath: string;
  architectureUnitLabel: string;
  architectureUnitId: string;
  architectureSignal: "package" | "entrypoint" | "heuristic";
  fileDegree: number;
}

export interface ArchitectureStaticRelationship {
  sourcePath: string;
  targetPath: string;
  sourceKind: GraphRelationshipSource;
}

export interface ArchitectureProjection {
  descriptors: ArchitectureFileDescriptor[];
  staticRelationships: ArchitectureStaticRelationship[];
  usesStrongUnits: boolean;
}

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/").replace(/\/$/u, "") || ".";
}

function getAbsolutePath(projectRoot: string, relativePath: string): string {
  return relativePath === "." ? projectRoot : path.join(projectRoot, relativePath);
}

function readJsonFile<T>(absolutePath: string): T | null {
  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function pathInside(rootPath: string, targetPath: string): boolean {
  if (rootPath === ".") {
    return true;
  }

  return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`);
}

function getDeepestAncestor(targetPath: string, candidates: string[]): string | null {
  const matchingCandidates = candidates.filter((candidate) => pathInside(candidate, targetPath));
  if (matchingCandidates.length === 0) {
    return null;
  }

  return matchingCandidates.sort((left, right) => right.length - left.length)[0] ?? null;
}

function getArchitectureUnitId(unitPath: string): string {
  return unitPath === "." ? "module:project-root" : `module:${unitPath}`;
}

function getArchitectureUnitLabel(unitPath: string): string {
  return unitPath === "." ? "project-root" : unitPath;
}

function isTestLikePath(normalizedPath: string): boolean {
  return TEST_DIRECTORY_PATTERN.test(normalizedPath) || TEST_FILE_PATTERN.test(normalizedPath);
}

function isConfigLikePath(normalizedPath: string): boolean {
  const lowerPath = normalizedPath.toLowerCase();
  const basename = path.posix.basename(lowerPath);
  const extension = path.posix.extname(lowerPath);

  if (basename.startsWith(".")) {
    return true;
  }

  if (basename.startsWith(".env")) {
    return true;
  }

  if (basename === PACKAGE_MANIFEST_FILE || JS_CONFIG_BASENAMES.has(basename)) {
    return true;
  }

  if (CONFIG_FILE_PREFIXES.some((prefix) => basename.startsWith(prefix))) {
    return true;
  }

  if (basename.includes("config") || basename.includes("settings")) {
    return CONFIG_EXTENSIONS.has(extension) || basename.endsWith(".json");
  }

  return !normalizedPath.includes("/") && CONFIG_EXTENSIONS.has(extension);
}

function isSupportDirectoryPath(normalizedPath: string): boolean {
  return normalizedPath.split("/").some((segment) => SUPPORT_DIRECTORY_SEGMENTS.has(segment));
}

function classifyProjectGraphFile(node: ProjectNode): GraphHiddenCategory | null {
  const normalizedPath = normalizeRelativePath(node.path);
  const extension = path.posix.extname(normalizedPath).toLowerCase();

  if (isTestLikePath(normalizedPath)) {
    return "tests";
  }

  if (isConfigLikePath(normalizedPath)) {
    return "config";
  }

  if (ASSET_EXTENSIONS.has(extension)) {
    return "assets";
  }

  if (isSupportDirectoryPath(normalizedPath)) {
    return "other-support";
  }

  if (!ARCHITECTURE_EXTENSIONS.has(extension)) {
    return "other-support";
  }

  return null;
}

function getFallbackArchitectureUnitPath(normalizedPath: string): string {
  const segments = normalizedPath.split("/");

  if (segments.length === 1) {
    return ".";
  }

  const rootSegment = segments[0] ?? ".";
  if (SOURCE_ROOT_SEGMENTS.has(rootSegment)) {
    return segments.length >= 3 ? `${rootSegment}/${segments[1]}` : rootSegment;
  }

  if (segments.length >= 3) {
    return `${rootSegment}/${segments[1]}`;
  }

  return rootSegment;
}

function collectPackageEntryFiles(raw: {
  main?: string;
  module?: string;
  types?: string;
  source?: string;
  browser?: string | Record<string, string>;
  bin?: string | Record<string, string>;
  exports?: unknown;
}): string[] {
  const entryFiles = new Set<string>();

  const addValue = (value: unknown): void => {
    if (typeof value === "string") {
      entryFiles.add(normalizeRelativePath(value));
      return;
    }

    if (value && typeof value === "object") {
      for (const nestedValue of Object.values(value as Record<string, unknown>)) {
        addValue(nestedValue);
      }
    }
  };

  addValue(raw.source);
  addValue(raw.types);
  addValue(raw.module);
  addValue(raw.main);
  addValue(raw.browser);
  addValue(raw.bin);
  addValue(raw.exports);

  return Array.from(entryFiles).filter((entry) => !entry.startsWith("."));
}

function discoverPackageManifests(projectRoot: string, fileNodes: ProjectNode[]): PackageManifestRecord[] {
  const packagePaths = fileNodes
    .map((node) => normalizeRelativePath(node.path))
    .filter((filePath) => path.posix.basename(filePath) === PACKAGE_MANIFEST_FILE)
    .sort((left, right) => left.localeCompare(right));

  return packagePaths.flatMap((packagePath) => {
    const manifest = readJsonFile<{
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      main?: string;
      module?: string;
      types?: string;
      source?: string;
      browser?: string | Record<string, string>;
      bin?: string | Record<string, string>;
      exports?: unknown;
    }>(getAbsolutePath(projectRoot, packagePath));

    if (!manifest) {
      return [];
    }

    const rootPath = normalizeRelativePath(path.posix.dirname(packagePath));
    const dependencies = new Set<string>();
    for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
      for (const dependencyName of Object.keys(manifest[key] ?? {})) {
        dependencies.add(dependencyName);
      }
    }

    return [
      {
        rootPath,
        name: manifest.name,
        dependencies: Array.from(dependencies).sort((left, right) => left.localeCompare(right)),
        entryFiles: collectPackageEntryFiles(manifest)
      }
    ];
  });
}

function discoverBrowserManifestSignals(projectRoot: string, fileNodes: ProjectNode[]): EntrypointSignal[] {
  const manifestPaths = fileNodes
    .map((node) => normalizeRelativePath(node.path))
    .filter((filePath) => BROWSER_MANIFEST_PATTERN.test(path.posix.basename(filePath)));

  return manifestPaths.flatMap((manifestPath) => {
    const manifest = readJsonFile<{
      background?: { service_worker?: string; scripts?: string[] };
      content_scripts?: Array<{ js?: string[] }>;
      options_page?: string;
      options_ui?: { page?: string };
      side_panel?: { default_path?: string };
      action?: { default_popup?: string };
    }>(getAbsolutePath(projectRoot, manifestPath));
    if (!manifest) {
      return [];
    }

    const entryFiles = new Set<string>();
    const addEntrypoint = (entry: string | undefined): void => {
      if (!entry) {
        return;
      }

      entryFiles.add(normalizeRelativePath(path.posix.join(path.posix.dirname(manifestPath), entry)));
    };

    addEntrypoint(manifest.background?.service_worker);
    for (const script of manifest.background?.scripts ?? []) {
      addEntrypoint(script);
    }
    for (const contentScript of manifest.content_scripts ?? []) {
      for (const script of contentScript.js ?? []) {
        addEntrypoint(script);
      }
    }
    addEntrypoint(manifest.options_page);
    addEntrypoint(manifest.options_ui?.page);
    addEntrypoint(manifest.side_panel?.default_path);
    addEntrypoint(manifest.action?.default_popup);

    if (entryFiles.size === 0) {
      return [];
    }

    return [
      {
        rootPath: normalizeRelativePath(path.posix.dirname(manifestPath)),
        entryFiles: Array.from(entryFiles)
      }
    ];
  });
}

function discoverBundlerSignals(projectRoot: string, fileNodes: ProjectNode[]): EntrypointSignal[] {
  const configPaths = fileNodes
    .map((node) => normalizeRelativePath(node.path))
    .filter((filePath) => VITE_CONFIG_PATTERN.test(path.posix.basename(filePath)));

  return configPaths.flatMap((configPath) => {
    const absolutePath = getAbsolutePath(projectRoot, configPath);
    if (!fs.existsSync(absolutePath)) {
      return [];
    }

    const source = fs.readFileSync(absolutePath, "utf8");
    const inputMatches = Array.from(
      source.matchAll(/input\s*:\s*(?:\{([\s\S]*?)\}|\[([\s\S]*?)\]|["'`]([^"'`]+)["'`])/gmu)
    );
    const entryFiles = new Set<string>();

    for (const match of inputMatches) {
      for (const group of match.slice(1)) {
        if (!group) {
          continue;
        }

        for (const pathMatch of group.matchAll(/["'`]([^"'`]+)["'`]/gmu)) {
          entryFiles.add(normalizeRelativePath(path.posix.join(path.posix.dirname(configPath), pathMatch[1] ?? "")));
        }
      }
    }

    if (entryFiles.size === 0) {
      return [];
    }

    return [
      {
        rootPath: normalizeRelativePath(path.posix.dirname(configPath)),
        entryFiles: Array.from(entryFiles)
      }
    ];
  });
}

function mergeEntrypointSignals(
  packageManifests: PackageManifestRecord[],
  browserSignals: EntrypointSignal[],
  bundlerSignals: EntrypointSignal[]
): Map<string, EntrypointSignal> {
  const merged = new Map<string, EntrypointSignal>();

  for (const signal of [
    ...packageManifests.map((manifest) => ({ rootPath: manifest.rootPath, entryFiles: manifest.entryFiles })),
    ...browserSignals,
    ...bundlerSignals
  ]) {
    const existing = merged.get(signal.rootPath) ?? { rootPath: signal.rootPath, entryFiles: [] };
    const entryFiles = new Set([...existing.entryFiles, ...signal.entryFiles].map((filePath) => normalizeRelativePath(filePath)));
    merged.set(signal.rootPath, {
      rootPath: signal.rootPath,
      entryFiles: Array.from(entryFiles).sort((left, right) => left.localeCompare(right))
    });
  }

  return merged;
}

function createStrongUnitSignals(
  packageManifests: PackageManifestRecord[],
  entrySignals: Map<string, EntrypointSignal>
): Map<string, "package" | "entrypoint"> {
  const strongSignals = new Map<string, "package" | "entrypoint">();

  for (const manifest of packageManifests) {
    if (manifest.rootPath !== ".") {
      strongSignals.set(manifest.rootPath, "package");
    }
  }

  for (const [rootPath] of entrySignals) {
    if (rootPath !== "." && !strongSignals.has(rootPath)) {
      strongSignals.set(rootPath, "entrypoint");
    }
  }

  return strongSignals;
}

function getArchitectureUnitPath(
  filePath: string,
  strongUnitPaths: string[],
  strongSignals: Map<string, "package" | "entrypoint">
): { unitPath: string; signal: "package" | "entrypoint" | "heuristic" } {
  const normalizedPath = normalizeRelativePath(filePath);
  const strongRoot = getDeepestAncestor(normalizedPath, strongUnitPaths);
  if (strongRoot) {
    return {
      unitPath: strongRoot,
      signal: strongSignals.get(strongRoot) ?? "heuristic"
    };
  }

  return {
    unitPath: getFallbackArchitectureUnitPath(normalizedPath),
    signal: "heuristic"
  };
}

function createDescriptor(
  node: ProjectNode,
  fileDegree: number,
  touchedPaths: Set<string>,
  impactedPaths: Set<string>,
  strongUnitPaths: string[],
  strongSignals: Map<string, "package" | "entrypoint">
): ArchitectureFileDescriptor {
  const { unitPath, signal } = getArchitectureUnitPath(node.path, strongUnitPaths, strongSignals);

  return {
    node,
    touched: touchedPaths.has(node.path),
    impacted: impactedPaths.has(node.path),
    hiddenCategory: classifyProjectGraphFile(node),
    architectureUnitPath: unitPath,
    architectureUnitLabel: getArchitectureUnitLabel(unitPath),
    architectureUnitId: getArchitectureUnitId(unitPath),
    architectureSignal: signal,
    fileDegree
  };
}

function collectPackageDependencyRelationships(
  packageManifests: PackageManifestRecord[],
  entrySignals: Map<string, EntrypointSignal>
): ArchitectureStaticRelationship[] {
  const byPackageName = new Map<string, string>();
  for (const manifest of packageManifests) {
    if (manifest.name) {
      byPackageName.set(manifest.name, manifest.rootPath);
    }
  }

  const relationships = new Map<string, ArchitectureStaticRelationship>();

  for (const manifest of packageManifests) {
    for (const dependencyName of manifest.dependencies) {
      const targetPath = byPackageName.get(dependencyName);
      if (!targetPath || targetPath === manifest.rootPath) {
        continue;
      }

      const relationshipKey = `${manifest.rootPath}::${targetPath}::package`;
      relationships.set(relationshipKey, {
        sourcePath: manifest.rootPath,
        targetPath,
        sourceKind: "package"
      });
    }
  }

  for (const signal of entrySignals.values()) {
    for (const entryFile of signal.entryFiles) {
      const targetUnitPath = signal.rootPath === "." ? getFallbackArchitectureUnitPath(entryFile) : signal.rootPath;
      if (targetUnitPath === signal.rootPath) {
        continue;
      }

      const relationshipKey = `${signal.rootPath}::${targetUnitPath}::entrypoint`;
      relationships.set(relationshipKey, {
        sourcePath: signal.rootPath,
        targetPath: targetUnitPath,
        sourceKind: "entrypoint"
      });
    }
  }

  return Array.from(relationships.values()).sort((left, right) =>
    `${left.sourcePath}:${left.targetPath}:${left.sourceKind}`.localeCompare(
      `${right.sourcePath}:${right.targetPath}:${right.sourceKind}`
    )
  );
}

export function buildArchitectureProjection(
  store: {
    getNodes(): ProjectNode[];
    getIncomingEdges(nodeId: string): Array<{ source: string }>;
    getOutgoingEdges(nodeId: string): Array<{ target: string }>;
    getState(): { projectRoot: string };
  },
  touchedPaths: Set<string>,
  impactedPaths: Set<string>
): ArchitectureProjection {
  const projectRoot = store.getState().projectRoot;
  const fileNodes = store.getNodes().filter((node): node is ProjectNode => node.type === "file");
  const packageManifests = discoverPackageManifests(projectRoot, fileNodes);
  const entrySignals = mergeEntrypointSignals(
    packageManifests,
    discoverBrowserManifestSignals(projectRoot, fileNodes),
    discoverBundlerSignals(projectRoot, fileNodes)
  );
  const strongSignals = createStrongUnitSignals(packageManifests, entrySignals);
  const strongUnitPaths = Array.from(strongSignals.keys()).sort((left, right) => right.length - left.length);

  return {
    descriptors: fileNodes.map((node) =>
      createDescriptor(
        node,
        store.getIncomingEdges(node.id).length + store.getOutgoingEdges(node.id).length,
        touchedPaths,
        impactedPaths,
        strongUnitPaths,
        strongSignals
      )
    ),
    staticRelationships: collectPackageDependencyRelationships(packageManifests, entrySignals),
    usesStrongUnits: strongUnitPaths.length > 0
  };
}

export function createArchitectureUnitNode(
  descriptor: ArchitectureFileDescriptor,
  degree: number
): {
  id: string;
  path: string;
  label: string;
  type: "module";
  language: string;
  architectureUnit: string;
  moduleBoundary: string | undefined;
  tier: LanguageTier;
  touched: boolean;
  impacted: boolean;
  degree: number;
} {
  return {
    id: descriptor.architectureUnitId,
    path: descriptor.architectureUnitPath,
    label: descriptor.architectureUnitLabel,
    type: "module",
    language: descriptor.node.language,
    architectureUnit: descriptor.architectureUnitPath,
    moduleBoundary: descriptor.architectureUnitPath === "." ? undefined : descriptor.architectureUnitPath,
    tier: descriptor.node.tier,
    touched: descriptor.touched,
    impacted: descriptor.impacted,
    degree
  };
}
