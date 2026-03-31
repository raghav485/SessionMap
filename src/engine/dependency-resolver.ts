import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_IGNORE_PATTERNS,
  PHP_RESOLUTION_EXTENSIONS,
  PYTHON_RESOLUTION_EXTENSIONS,
  TS_JS_RESOLUTION_EXTENSIONS
} from "../constants.js";
import { detectLanguage } from "./language-detector.js";

interface TsConfigAlias {
  pattern: string;
  targets: string[];
  hasWildcard: boolean;
  baseUrl: string;
}

interface TsConfigContext {
  configPath: string;
  rootPath: string;
  baseUrl: string;
  aliases: TsConfigAlias[];
}

interface LocalPackageDefinition {
  name: string;
  rootPath: string;
  absoluteRoot: string;
  manifest: {
    main?: string;
    module?: string;
    types?: string;
    source?: string;
    exports?: unknown;
  };
}

type WorkspaceField = string[] | { packages?: string[] };

interface ComposerPsr4Mapping {
  prefix: string;
  paths: string[];
}

interface ResolveImportOptions {
  language?: string;
  importedSymbols?: string[];
}

const DEPENDENCY_RESOLVER_TRIGGER_FILES = new Set(["package.json", "tsconfig.json", "jsconfig.json", "go.mod", "composer.json"]);
const IGNORED_WALK_DIRECTORIES = new Set(DEFAULT_IGNORE_PATTERNS);
const TS_CONFIG_FILE_NAMES = ["tsconfig.json", "jsconfig.json"];
const SOURCE_SHADOW_DIRECTORIES = ["src", "source", "lib", "app"];

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/");
}

function readTextFile(filePath: string): string | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

function readJsonFile<T>(filePath: string): T | null {
  const source = readTextFile(filePath);
  if (!source) {
    return null;
  }

  return JSON.parse(source) as T;
}

function resolveCandidate(
  basePath: string,
  extensions: string[],
  directoryIndexBasenames: string[] = ["index"]
): string | null {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }

  for (const extension of extensions) {
    const withExtension = `${basePath}${extension}`;
    if (fs.existsSync(withExtension) && fs.statSync(withExtension).isFile()) {
      return withExtension;
    }
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const basename of directoryIndexBasenames) {
      for (const extension of extensions) {
        const directoryEntry = path.join(basePath, `${basename}${extension}`);
        if (fs.existsSync(directoryEntry) && fs.statSync(directoryEntry).isFile()) {
          return directoryEntry;
        }
      }
    }
  }

  return null;
}

function resolveAliasTarget(specifier: string, alias: TsConfigAlias): string | null {
  if (alias.hasWildcard) {
    const [prefix, suffix] = alias.pattern.split("*");
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      return null;
    }

    const wildcardValue = specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const target of alias.targets) {
      const candidate = target.replace("*", wildcardValue);
      const resolved = resolveCandidate(path.resolve(alias.baseUrl, candidate), TS_JS_RESOLUTION_EXTENSIONS);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  if (specifier !== alias.pattern) {
    return null;
  }

  for (const target of alias.targets) {
    const resolved = resolveCandidate(path.resolve(alias.baseUrl, target), TS_JS_RESOLUTION_EXTENSIONS);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function normalizeConfigAliases(paths: Record<string, string[]> | undefined, baseUrl: string): TsConfigAlias[] {
  return Object.entries(paths ?? {}).map(([pattern, targets]) => ({
    pattern,
    targets,
    hasWildcard: pattern.includes("*"),
    baseUrl
  }));
}

function mergeConfigAliases(parentAliases: TsConfigAlias[], ownAliases: TsConfigAlias[]): TsConfigAlias[] {
  const merged = new Map(parentAliases.map((alias) => [alias.pattern, alias]));
  for (const alias of ownAliases) {
    merged.set(alias.pattern, alias);
  }

  return Array.from(merged.values());
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&");
}

function workspacePatternToRegex(pattern: string): RegExp {
  const normalizedPattern = normalizeRelativePath(pattern).replace(/\/$/u, "");
  const regexSource = normalizedPattern
    .split("/")
    .map((segment) => {
      if (segment === "**") {
        return ".*";
      }

      return escapeRegexLiteral(segment).replace(/\*/gu, "[^/]+");
    })
    .join("/");

  return new RegExp(`^${regexSource}$`, "u");
}

function resolveConfigExtendsPath(configPath: string, extendsPath: string): string | null {
  if (!extendsPath.startsWith(".") && !path.isAbsolute(extendsPath)) {
    return null;
  }

  const configDirectory = path.dirname(configPath);
  const candidatePaths = [
    path.resolve(configDirectory, extendsPath),
    path.resolve(configDirectory, `${extendsPath}.json`),
    path.resolve(configDirectory, extendsPath, "tsconfig.json"),
    path.resolve(configDirectory, extendsPath, "jsconfig.json")
  ];

  return candidatePaths.find((candidatePath) => fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) ?? null;
}

function parsePackageSpecifier(specifier: string): { packageName: string; subpath: string } {
  if (specifier.startsWith("@")) {
    const [scope, name, ...remainder] = specifier.split("/");
    return {
      packageName: [scope, name].filter(Boolean).join("/"),
      subpath: remainder.join("/")
    };
  }

  const [packageName, ...remainder] = specifier.split("/");
  return {
    packageName,
    subpath: remainder.join("/")
  };
}

function toExportsSubpathKey(subpath: string): string {
  return subpath ? `./${subpath}` : ".";
}

function collectExportTargets(exportsField: unknown, subpath: string): string[] {
  const exportKey = toExportsSubpathKey(subpath);

  if (typeof exportsField === "string") {
    return subpath ? [] : [exportsField];
  }

  if (!exportsField || typeof exportsField !== "object") {
    return [];
  }

  const exportRecord = exportsField as Record<string, unknown>;
  const exactMatch = exportRecord[exportKey];
  if (exactMatch !== undefined) {
    return collectExportTargets(exactMatch, "");
  }

  const wildcardMatch = Object.entries(exportRecord).find(([key]) => key.includes("*") && exportKey.startsWith(key.split("*")[0] ?? ""));
  if (wildcardMatch) {
    const [key, value] = wildcardMatch;
    const [prefix, suffix] = key.split("*");
    if ((prefix === undefined || exportKey.startsWith(prefix)) && (suffix === undefined || exportKey.endsWith(suffix))) {
      const wildcardValue = exportKey.slice(prefix.length, exportKey.length - suffix.length);
      return collectExportTargets(value, "").map((target) => target.replace("*", wildcardValue));
    }
  }

  const orderedKeys = ["types", "source", "import", "default", "require"];
  const collectedTargets: string[] = [];
  for (const key of orderedKeys) {
    const value = exportRecord[key];
    if (value !== undefined) {
      collectedTargets.push(...collectExportTargets(value, ""));
    }
  }

  return collectedTargets;
}

function dedupePreserveOrder(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return ordered;
}

function toInternalResolution(projectRoot: string, absolutePath: string): ImportResolution {
  return {
    resolvedPath: normalizeRelativePath(path.relative(projectRoot, absolutePath)),
    external: false,
    unresolved: false
  };
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function stripRustImport(segment: string): string {
  return segment.replace(/\bas\b.*$/u, "").trim();
}

function normalizeRustImport(specifier: string): { baseSpecifier: string; symbols: string[] } {
  const cleaned = stripRustImport(specifier);
  const braceMatch = cleaned.match(/^(.*)::\{(.+)\}$/u);
  if (!braceMatch) {
    return { baseSpecifier: cleaned, symbols: [] };
  }

  const baseSpecifier = braceMatch[1].trim();
  const symbols = braceMatch[2]
    .split(",")
    .map((entry) => stripRustImport(entry))
    .filter((entry) => entry !== "self" && entry !== "*");

  return { baseSpecifier, symbols };
}

export interface ImportResolution {
  resolvedPath?: string;
  external: boolean;
  unresolved: boolean;
}

export class DependencyResolver {
  private tsJsContexts: TsConfigContext[];
  private localPackages: Map<string, LocalPackageDefinition>;
  private goModulePath: string | null;
  private composerPsr4Mappings: ComposerPsr4Mapping[];
  private javaIndex: Map<string, string> | null;
  private csharpNamespaceIndex: Map<string, string[]> | null;
  private fileExtensionCache: Map<string, string[]>;

  constructor(private readonly projectRoot: string) {
    this.tsJsContexts = [];
    this.localPackages = new Map();
    this.goModulePath = null;
    this.composerPsr4Mappings = [];
    this.javaIndex = null;
    this.csharpNamespaceIndex = null;
    this.fileExtensionCache = new Map();
    this.reload();
  }

  reload(): void {
    this.loadTsJsContexts();
    this.loadLocalPackages();
    this.loadGoModule();
    this.loadComposerMappings();
    this.javaIndex = null;
    this.csharpNamespaceIndex = null;
    this.fileExtensionCache.clear();
  }

  shouldReloadForPath(relativePath: string): boolean {
    return DEPENDENCY_RESOLVER_TRIGGER_FILES.has(path.basename(relativePath));
  }

  resolve(specifier: string, sourceRelativePath: string, options?: ResolveImportOptions): ImportResolution {
    const language = options?.language ?? detectLanguage(sourceRelativePath).language;

    switch (language) {
      case "typescript":
      case "javascript":
        return this.resolveTypeScriptOrJavaScript(specifier, sourceRelativePath);
      case "python":
        return this.resolvePython(specifier, sourceRelativePath);
      case "go":
        return this.resolveGo(specifier);
      case "rust":
        return this.resolveRust(specifier, sourceRelativePath);
      case "java":
        return this.resolveJava(specifier);
      case "csharp":
        return this.resolveCSharp(specifier);
      case "ruby":
        return this.resolveRuby(specifier, sourceRelativePath);
      case "php":
        return this.resolvePhp(specifier, sourceRelativePath);
      default:
        return specifier.startsWith(".") ? { external: false, unresolved: true } : { external: true, unresolved: false };
    }
  }

  private loadTsJsContexts(): void {
    const discoveredContexts = TS_CONFIG_FILE_NAMES.flatMap((fileName) => this.getProjectFilesByBasename(fileName));
    const contextPaths = dedupePreserveOrder(discoveredContexts).sort((left, right) => left.localeCompare(right));
    const collectedContexts = new Map<string, TsConfigContext>();
    const cache = new Map<string, TsConfigContext | null>();

    for (const relativeConfigPath of contextPaths) {
      const context = this.loadMergedTsJsContext(path.join(this.projectRoot, relativeConfigPath), cache, new Set<string>());
      if (context) {
        collectedContexts.set(context.configPath, context);
      }
    }

    this.tsJsContexts = Array.from(collectedContexts.values())
      .sort((left, right) => right.rootPath.length - left.rootPath.length || left.configPath.localeCompare(right.configPath));
  }

  private loadMergedTsJsContext(
    configPath: string,
    cache: Map<string, TsConfigContext | null>,
    stack: Set<string>
  ): TsConfigContext | null {
    const resolvedConfigPath = path.resolve(configPath);
    if (cache.has(resolvedConfigPath)) {
      return cache.get(resolvedConfigPath) ?? null;
    }

    if (stack.has(resolvedConfigPath)) {
      return null;
    }

    stack.add(resolvedConfigPath);
    const source = readTextFile(resolvedConfigPath);
    if (!source) {
      cache.set(resolvedConfigPath, null);
      stack.delete(resolvedConfigPath);
      return null;
    }

    const raw = JSON.parse(source) as {
      extends?: string;
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };

    const extendedConfigPath = raw.extends ? resolveConfigExtendsPath(resolvedConfigPath, raw.extends) : null;
    const parentContext = extendedConfigPath
      ? this.loadMergedTsJsContext(extendedConfigPath, cache, stack)
      : null;

    const configDirectory = path.dirname(resolvedConfigPath);
    const compilerOptions = raw.compilerOptions ?? {};
    const contextKey = normalizeRelativePath(path.relative(this.projectRoot, resolvedConfigPath));
    const ownBaseUrl = compilerOptions.baseUrl
      ? path.resolve(configDirectory, compilerOptions.baseUrl)
      : (parentContext?.baseUrl ?? configDirectory);
    const context: TsConfigContext = {
      configPath: contextKey,
      rootPath: normalizeRelativePath(path.relative(this.projectRoot, configDirectory)) || ".",
      baseUrl: ownBaseUrl,
      aliases: mergeConfigAliases(parentContext?.aliases ?? [], normalizeConfigAliases(compilerOptions.paths, ownBaseUrl))
    };

    cache.set(resolvedConfigPath, context);
    stack.delete(resolvedConfigPath);
    return context;
  }

  private loadLocalPackages(): void {
    const packagePaths = this.getProjectFilesByBasename("package.json");
    const workspacePatterns = this.getWorkspacePatterns(packagePaths);
    this.localPackages = new Map();

    for (const relativePackagePath of packagePaths) {
      const manifest = readJsonFile<{
        name?: string;
        main?: string;
        module?: string;
        types?: string;
        source?: string;
        exports?: unknown;
      }>(path.join(this.projectRoot, relativePackagePath));

      if (!manifest?.name) {
        continue;
      }

      const rootPath = normalizeRelativePath(path.dirname(relativePackagePath)) || ".";
      if (workspacePatterns.length > 0 && !workspacePatterns.some((pattern) => pattern.test(rootPath))) {
        continue;
      }

      this.localPackages.set(manifest.name, {
        name: manifest.name,
        rootPath,
        absoluteRoot: path.join(this.projectRoot, rootPath === "." ? "" : rootPath),
        manifest: {
          main: manifest.main,
          module: manifest.module,
          types: manifest.types,
          source: manifest.source,
          exports: manifest.exports
        }
      });
    }
  }

  private getWorkspacePatterns(packagePaths: string[]): RegExp[] {
    const patterns: RegExp[] = [];

    for (const relativePackagePath of packagePaths) {
      const manifest = readJsonFile<{ workspaces?: WorkspaceField }>(path.join(this.projectRoot, relativePackagePath));
      const workspaceField = manifest?.workspaces;
      const declaredPatterns = Array.isArray(workspaceField)
        ? workspaceField
        : Array.isArray(workspaceField?.packages)
          ? workspaceField.packages
          : [];
      const manifestRoot = normalizeRelativePath(path.dirname(relativePackagePath)) || ".";

      for (const pattern of declaredPatterns) {
        if (!pattern || typeof pattern !== "string") {
          continue;
        }

        const normalizedPattern = normalizeRelativePath(
          manifestRoot === "." ? pattern : path.posix.join(manifestRoot, pattern)
        );
        patterns.push(workspacePatternToRegex(normalizedPattern));
      }
    }

    return patterns;
  }

  private loadGoModule(): void {
    const goModPath = path.join(this.projectRoot, "go.mod");
    const source = readTextFile(goModPath);
    if (!source) {
      this.goModulePath = null;
      return;
    }

    const match = source.match(/^\s*module\s+([^\s]+)\s*$/mu);
    this.goModulePath = match?.[1]?.trim() ?? null;
  }

  private loadComposerMappings(): void {
    const composerPath = path.join(this.projectRoot, "composer.json");
    const source = readTextFile(composerPath);
    if (!source) {
      this.composerPsr4Mappings = [];
      return;
    }

    const raw = JSON.parse(source) as {
      autoload?: { "psr-4"?: Record<string, string | string[]> };
      "autoload-dev"?: { "psr-4"?: Record<string, string | string[]> };
    };

    const mappings = {
      ...(raw.autoload?.["psr-4"] ?? {}),
      ...(raw["autoload-dev"]?.["psr-4"] ?? {})
    };

    this.composerPsr4Mappings = Object.entries(mappings).map(([prefix, targetPaths]) => ({
      prefix,
      paths: (Array.isArray(targetPaths) ? targetPaths : [targetPaths]).map((targetPath) =>
        normalizeRelativePath(targetPath).replace(/\/$/u, "")
      )
    }));
  }

  private resolveTypeScriptOrJavaScript(specifier: string, sourceRelativePath: string): ImportResolution {
    if (specifier.startsWith(".")) {
      const basePath = path.resolve(this.projectRoot, path.dirname(sourceRelativePath), specifier);
      const resolved = resolveCandidate(basePath, TS_JS_RESOLUTION_EXTENSIONS);
      if (!resolved) {
        return { external: false, unresolved: true };
      }

      return toInternalResolution(this.projectRoot, resolved);
    }

    const relevantContexts = this.getTsJsContextsForSource(sourceRelativePath);
    for (const context of relevantContexts) {
      for (const alias of context.aliases) {
        const resolved = resolveAliasTarget(specifier, alias);
        if (resolved) {
          return toInternalResolution(this.projectRoot, resolved);
        }
      }
    }

    const localPackageResolution = this.resolveLocalPackage(specifier);
    if (localPackageResolution) {
      return localPackageResolution;
    }

    const hasAliasPrefix = relevantContexts.some((context) =>
      context.aliases.some((alias) => specifier.startsWith(alias.pattern.replace("*", "")))
    );
    if (hasAliasPrefix) {
      return { external: false, unresolved: true };
    }

    if (this.localPackages.has(parsePackageSpecifier(specifier).packageName)) {
      return { external: false, unresolved: true };
    }

    return { external: true, unresolved: false };
  }

  private getTsJsContextsForSource(sourceRelativePath: string): TsConfigContext[] {
    const normalizedSourcePath = normalizeRelativePath(sourceRelativePath);
    const matchingContexts = this.tsJsContexts.filter((context) => {
      if (context.rootPath === "." || context.rootPath === "") {
        return true;
      }

      return normalizedSourcePath === context.rootPath || normalizedSourcePath.startsWith(`${context.rootPath}/`);
    });

    return matchingContexts.length > 0
      ? matchingContexts
      : [
          {
            configPath: ".",
            rootPath: ".",
            baseUrl: this.projectRoot,
            aliases: []
          }
        ];
  }

  private resolveLocalPackage(specifier: string): ImportResolution | null {
    const { packageName, subpath } = parsePackageSpecifier(specifier);
    const localPackage = this.localPackages.get(packageName);
    if (!localPackage) {
      return null;
    }

    const candidates = subpath ? this.getLocalPackageSubpathCandidates(localPackage, subpath) : this.getLocalPackageRootCandidates(localPackage);
    for (const candidate of candidates) {
      const resolved = resolveCandidate(candidate, TS_JS_RESOLUTION_EXTENSIONS);
      if (!resolved) {
        continue;
      }

      return toInternalResolution(this.projectRoot, resolved);
    }

    return {
      external: false,
      unresolved: true
    };
  }

  private getLocalPackageRootCandidates(localPackage: LocalPackageDefinition): string[] {
    const manifestCandidates = [
      ...collectExportTargets(localPackage.manifest.exports, ""),
      localPackage.manifest.source,
      localPackage.manifest.types,
      localPackage.manifest.module,
      localPackage.manifest.main
    ].filter((value): value is string => Boolean(value));

    return dedupePreserveOrder(
      [
        ...manifestCandidates.flatMap((candidate) => this.createLocalPackageCandidatePaths(localPackage, candidate)),
        ...SOURCE_SHADOW_DIRECTORIES.map((directoryName) => path.join(localPackage.absoluteRoot, directoryName, "index")),
        path.join(localPackage.absoluteRoot, "index")
      ]
    );
  }

  private getLocalPackageSubpathCandidates(localPackage: LocalPackageDefinition, subpath: string): string[] {
    const exportCandidates = collectExportTargets(localPackage.manifest.exports, subpath);

    return dedupePreserveOrder(
      [
        ...exportCandidates.flatMap((candidate) => this.createLocalPackageCandidatePaths(localPackage, candidate)),
        path.join(localPackage.absoluteRoot, subpath),
        ...SOURCE_SHADOW_DIRECTORIES.map((directoryName) => path.join(localPackage.absoluteRoot, directoryName, subpath))
      ]
    );
  }

  private createLocalPackageCandidatePaths(localPackage: LocalPackageDefinition, candidate: string): string[] {
    const normalizedCandidate = normalizeRelativePath(candidate).replace(/^\.\//u, "");
    const candidatePaths = [path.join(localPackage.absoluteRoot, normalizedCandidate)];
    const shadowRelativePath = normalizedCandidate.replace(/^(dist|build|lib)\//u, "");

    if (shadowRelativePath !== normalizedCandidate) {
      candidatePaths.push(...SOURCE_SHADOW_DIRECTORIES.map((directoryName) => path.join(localPackage.absoluteRoot, directoryName, shadowRelativePath)));
    }

    return candidatePaths;
  }

  private resolvePython(specifier: string, sourceRelativePath: string): ImportResolution {
    if (specifier.startsWith(".")) {
      const leadingDots = specifier.match(/^\.+/u)?.[0].length ?? 0;
      const remainder = specifier.slice(leadingDots).replace(/\./gu, "/");
      let baseDirectory = path.dirname(sourceRelativePath);
      for (let index = 1; index < leadingDots; index += 1) {
        baseDirectory = path.dirname(baseDirectory);
      }

      const targetPath = remainder ? path.join(baseDirectory, remainder) : baseDirectory;
      const resolved = resolveCandidate(
        path.resolve(this.projectRoot, targetPath),
        PYTHON_RESOLUTION_EXTENSIONS,
        ["__init__"]
      );
      if (!resolved) {
        return { external: false, unresolved: true };
      }

      return toInternalResolution(this.projectRoot, resolved);
    }

    const resolved = resolveCandidate(
      path.resolve(this.projectRoot, specifier.replace(/\./gu, "/")),
      PYTHON_RESOLUTION_EXTENSIONS,
      ["__init__"]
    );
    if (resolved) {
      return toInternalResolution(this.projectRoot, resolved);
    }

    return { external: true, unresolved: false };
  }

  private resolveGo(specifier: string): ImportResolution {
    if (!this.goModulePath || (specifier !== this.goModulePath && !specifier.startsWith(`${this.goModulePath}/`))) {
      return { external: true, unresolved: false };
    }

    const subPath = specifier === this.goModulePath ? "" : specifier.slice(this.goModulePath.length + 1);
    const directoryPath = path.resolve(this.projectRoot, subPath);
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
      return { external: false, unresolved: true };
    }

    const goFiles = fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".go"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    if (goFiles.length === 0) {
      return { external: false, unresolved: true };
    }

    const directoryName = path.basename(directoryPath);
    const preferred = goFiles.find((fileName) => fileName === `${directoryName}.go`);
    const resolvedFile = preferred ?? (goFiles.length === 1 ? goFiles[0] : null);
    if (!resolvedFile) {
      return { external: false, unresolved: true };
    }

    return toInternalResolution(this.projectRoot, path.join(directoryPath, resolvedFile));
  }

  private resolveRust(specifier: string, sourceRelativePath: string): ImportResolution {
    const { baseSpecifier } = normalizeRustImport(specifier);
    const sourceSegments = this.getRustModuleSegments(sourceRelativePath);
    let candidateSegments: string[] | null = null;

    if (baseSpecifier.startsWith("crate::")) {
      candidateSegments = baseSpecifier.slice("crate::".length).split("::").filter(Boolean);
    } else if (baseSpecifier.startsWith("self::")) {
      candidateSegments = [...sourceSegments, ...baseSpecifier.slice("self::".length).split("::").filter(Boolean)];
    } else if (baseSpecifier.startsWith("super::")) {
      const remainder = baseSpecifier;
      let workingSegments = [...sourceSegments];
      let remaining = remainder;
      while (remaining.startsWith("super::")) {
        workingSegments = workingSegments.slice(0, -1);
        remaining = remaining.slice("super::".length);
      }
      candidateSegments = [...workingSegments, ...remaining.split("::").filter(Boolean)];
    } else if (baseSpecifier === "crate") {
      candidateSegments = [];
    } else {
      return { external: true, unresolved: false };
    }

    const resolved = this.resolveRustModule(candidateSegments);
    if (!resolved) {
      return { external: false, unresolved: true };
    }

    return toInternalResolution(this.projectRoot, resolved);
  }

  private resolveJava(specifier: string): ImportResolution {
    const javaIndex = this.getJavaIndex();
    const resolved = javaIndex.get(specifier);
    if (resolved) {
      return {
        resolvedPath: resolved,
        external: false,
        unresolved: false
      };
    }

    return { external: true, unresolved: false };
  }

  private resolveCSharp(specifier: string): ImportResolution {
    const namespaceIndex = this.getCSharpNamespaceIndex();
    const matches = namespaceIndex.get(specifier) ?? [];
    if (matches.length === 1) {
      return {
        resolvedPath: matches[0],
        external: false,
        unresolved: false
      };
    }

    return { external: false, unresolved: true };
  }

  private resolveRuby(specifier: string, sourceRelativePath: string): ImportResolution {
    if (specifier.startsWith(".")) {
      const resolved = resolveCandidate(
        path.resolve(this.projectRoot, path.dirname(sourceRelativePath), specifier),
        [".rb"],
        []
      );
      if (!resolved) {
        return { external: false, unresolved: true };
      }

      return toInternalResolution(this.projectRoot, resolved);
    }

    const projectCandidate = resolveCandidate(path.resolve(this.projectRoot, specifier), [".rb"], []);
    if (projectCandidate) {
      return toInternalResolution(this.projectRoot, projectCandidate);
    }

    const libCandidate = resolveCandidate(path.resolve(this.projectRoot, "lib", specifier), [".rb"], []);
    if (libCandidate) {
      return toInternalResolution(this.projectRoot, libCandidate);
    }

    return { external: true, unresolved: false };
  }

  private resolvePhp(specifier: string, sourceRelativePath: string): ImportResolution {
    if (specifier.includes("\\") && !specifier.includes("/")) {
      for (const mapping of this.composerPsr4Mappings) {
        if (!specifier.startsWith(mapping.prefix)) {
          continue;
        }

        const suffix = specifier.slice(mapping.prefix.length).replace(/\\/gu, "/");
        for (const targetPath of mapping.paths) {
          const resolved = resolveCandidate(
            path.resolve(this.projectRoot, targetPath, suffix),
            PHP_RESOLUTION_EXTENSIONS,
            []
          );
          if (resolved) {
            return toInternalResolution(this.projectRoot, resolved);
          }
        }
      }

      return { external: false, unresolved: true };
    }

    const candidateBases = specifier.startsWith(".")
      ? [path.resolve(this.projectRoot, path.dirname(sourceRelativePath), specifier)]
      : [
          path.resolve(this.projectRoot, path.dirname(sourceRelativePath), specifier),
          path.resolve(this.projectRoot, specifier)
        ];

    for (const candidateBase of candidateBases) {
      const resolved = resolveCandidate(candidateBase, PHP_RESOLUTION_EXTENSIONS, []);
      if (resolved) {
        return toInternalResolution(this.projectRoot, resolved);
      }
    }

    return specifier.startsWith(".")
      ? { external: false, unresolved: true }
      : { external: true, unresolved: false };
  }

  private getRustModuleSegments(sourceRelativePath: string): string[] {
    const normalizedPath = normalizeRelativePath(sourceRelativePath);
    const withoutExtension = normalizedPath.replace(/\.rs$/u, "");
    const segments = withoutExtension.split("/");
    const srcIndex = segments.indexOf("src");
    const relevantSegments = srcIndex >= 0 ? segments.slice(srcIndex + 1) : segments;

    if (relevantSegments.length === 0 || relevantSegments.at(-1) === "lib" || relevantSegments.at(-1) === "main") {
      return [];
    }

    if (relevantSegments.at(-1) === "mod") {
      return relevantSegments.slice(0, -1);
    }

    return relevantSegments;
  }

  private resolveRustModule(segments: string[]): string | null {
    if (segments.length === 0) {
      const crateRoot =
        resolveCandidate(path.resolve(this.projectRoot, "src/lib"), [".rs"], []) ??
        resolveCandidate(path.resolve(this.projectRoot, "src/main"), [".rs"], []);
      return crateRoot;
    }

    for (let length = segments.length; length > 0; length -= 1) {
      const candidateBase = path.resolve(this.projectRoot, "src", ...segments.slice(0, length));
      const resolved = resolveCandidate(candidateBase, [".rs"], ["mod"]);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  private getJavaIndex(): Map<string, string> {
    if (this.javaIndex) {
      return this.javaIndex;
    }

    const index = new Map<string, string>();
    for (const relativePath of this.getProjectFilesByExtension(".java")) {
      const source = readTextFile(path.join(this.projectRoot, relativePath));
      if (!source) {
        continue;
      }

      const packageName = source.match(/^\s*package\s+([A-Za-z_][\w.]*)\s*;/mu)?.[1] ?? "";
      for (const match of source.matchAll(
        /^\s*public\s+(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+)?(?:class|interface|enum|record)\s+([A-Za-z_][\w]*)/gmu
      )) {
        const typeName = match[1];
        const qualifiedName = packageName ? `${packageName}.${typeName}` : typeName;
        index.set(qualifiedName, relativePath);
      }
    }

    this.javaIndex = index;
    return index;
  }

  private getCSharpNamespaceIndex(): Map<string, string[]> {
    if (this.csharpNamespaceIndex) {
      return this.csharpNamespaceIndex;
    }

    const index = new Map<string, string[]>();
    for (const relativePath of this.getProjectFilesByExtension(".cs")) {
      const source = readTextFile(path.join(this.projectRoot, relativePath));
      if (!source) {
        continue;
      }

      for (const match of source.matchAll(/^\s*namespace\s+([A-Za-z_][\w.]*)\s*(?:;|\{)/gmu)) {
        const namespaceName = match[1];
        const existing = index.get(namespaceName) ?? [];
        existing.push(relativePath);
        index.set(namespaceName, uniqueSorted(existing));
      }
    }

    this.csharpNamespaceIndex = index;
    return index;
  }

  private getProjectFilesByExtension(extension: string): string[] {
    if (this.fileExtensionCache.has(extension)) {
      return this.fileExtensionCache.get(extension) ?? [];
    }

    const files: string[] = [];
    const walk = (directoryPath: string): void => {
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && IGNORED_WALK_DIRECTORIES.has(entry.name)) {
          continue;
        }

        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          walk(absolutePath);
          continue;
        }

        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== extension) {
          continue;
        }

        files.push(normalizeRelativePath(path.relative(this.projectRoot, absolutePath)));
      }
    };

    walk(this.projectRoot);
    files.sort((left, right) => left.localeCompare(right));
    this.fileExtensionCache.set(extension, files);
    return files;
  }

  private getProjectFilesByBasename(basename: string): string[] {
    const cacheKey = `basename:${basename}`;
    if (this.fileExtensionCache.has(cacheKey)) {
      return this.fileExtensionCache.get(cacheKey) ?? [];
    }

    const files: string[] = [];
    const walk = (directoryPath: string): void => {
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && IGNORED_WALK_DIRECTORIES.has(entry.name)) {
          continue;
        }

        const absolutePath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
          walk(absolutePath);
          continue;
        }

        if (!entry.isFile() || entry.name !== basename) {
          continue;
        }

        files.push(normalizeRelativePath(path.relative(this.projectRoot, absolutePath)));
      }
    };

    walk(this.projectRoot);
    files.sort((left, right) => left.localeCompare(right));
    this.fileExtensionCache.set(cacheKey, files);
    return files;
  }
}

export function createDependencyResolver(projectRoot: string): DependencyResolver {
  return new DependencyResolver(projectRoot);
}
