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
}

interface ComposerPsr4Mapping {
  prefix: string;
  paths: string[];
}

interface ResolveImportOptions {
  language?: string;
  importedSymbols?: string[];
}

const DEPENDENCY_RESOLVER_TRIGGER_FILES = new Set(["tsconfig.json", "go.mod", "composer.json"]);
const IGNORED_WALK_DIRECTORIES = new Set(DEFAULT_IGNORE_PATTERNS);

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/");
}

function readTextFile(filePath: string): string | null {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
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

function resolveAliasTarget(specifier: string, alias: TsConfigAlias, baseUrl: string): string | null {
  if (alias.hasWildcard) {
    const [prefix, suffix] = alias.pattern.split("*");
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) {
      return null;
    }

    const wildcardValue = specifier.slice(prefix.length, specifier.length - suffix.length);
    for (const target of alias.targets) {
      const candidate = target.replace("*", wildcardValue);
      const resolved = resolveCandidate(path.resolve(baseUrl, candidate), TS_JS_RESOLUTION_EXTENSIONS);
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
    const resolved = resolveCandidate(path.resolve(baseUrl, target), TS_JS_RESOLUTION_EXTENSIONS);
    if (resolved) {
      return resolved;
    }
  }

  return null;
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
  private baseUrl: string;
  private aliases: TsConfigAlias[];
  private goModulePath: string | null;
  private composerPsr4Mappings: ComposerPsr4Mapping[];
  private javaIndex: Map<string, string> | null;
  private csharpNamespaceIndex: Map<string, string[]> | null;
  private fileExtensionCache: Map<string, string[]>;

  constructor(private readonly projectRoot: string) {
    this.baseUrl = projectRoot;
    this.aliases = [];
    this.goModulePath = null;
    this.composerPsr4Mappings = [];
    this.javaIndex = null;
    this.csharpNamespaceIndex = null;
    this.fileExtensionCache = new Map();
    this.reload();
  }

  reload(): void {
    this.loadTsConfig();
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

  private loadTsConfig(): void {
    const tsconfigPath = path.join(this.projectRoot, "tsconfig.json");
    if (!fs.existsSync(tsconfigPath)) {
      this.baseUrl = this.projectRoot;
      this.aliases = [];
      return;
    }

    const raw = JSON.parse(fs.readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: {
        baseUrl?: string;
        paths?: Record<string, string[]>;
      };
    };

    this.baseUrl = path.resolve(this.projectRoot, raw.compilerOptions?.baseUrl ?? ".");
    this.aliases = Object.entries(raw.compilerOptions?.paths ?? {}).map(([pattern, targets]) => ({
      pattern,
      targets,
      hasWildcard: pattern.includes("*")
    }));
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

    for (const alias of this.aliases) {
      const resolved = resolveAliasTarget(specifier, alias, this.baseUrl);
      if (resolved) {
        return toInternalResolution(this.projectRoot, resolved);
      }
    }

    const hasAliasPrefix = this.aliases.some((alias) => specifier.startsWith(alias.pattern.replace("*", "")));
    if (hasAliasPrefix) {
      return { external: false, unresolved: true };
    }

    return { external: true, unresolved: false };
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
}

export function createDependencyResolver(projectRoot: string): DependencyResolver {
  return new DependencyResolver(projectRoot);
}
