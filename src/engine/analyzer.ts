import fs from "node:fs/promises";
import path from "node:path";

import type { AnalyzedFile, ExtractorSource, ParseResult, PersistedState, ScanSummary, SessionMapConfig } from "../types.js";
import { createLogger } from "../logger.js";
import { buildGraphState } from "../graph/graph-builder.js";
import { DependencyResolver, createDependencyResolver } from "./dependency-resolver.js";
import { extractCSharp } from "./import-extractors/csharp.js";
import { extractGo } from "./import-extractors/go.js";
import { extractJava } from "./import-extractors/java.js";
import { extractJavaScript } from "./import-extractors/javascript.js";
import { extractPhp } from "./import-extractors/php.js";
import { extractPython } from "./import-extractors/python.js";
import { extractRuby } from "./import-extractors/ruby.js";
import { extractRust } from "./import-extractors/rust.js";
import { extractTypeScript } from "./import-extractors/typescript.js";
import { detectLanguage } from "./language-detector.js";
import { computeModuleBoundary } from "./module-boundary.js";
import { scanProjectFiles } from "./scanner.js";
import { detectTechStack } from "./tech-stack-detector.js";
import { TreeSitterParser } from "./tree-sitter-parser.js";

const logger = createLogger("analyzer");

type Extractor = (sourceText: string, source: ExtractorSource) => ParseResult;

const EXTRACTORS: Record<string, Extractor> = {
  typescript: extractTypeScript,
  javascript: extractJavaScript,
  python: extractPython,
  go: extractGo,
  rust: extractRust,
  java: extractJava,
  csharp: extractCSharp,
  ruby: extractRuby,
  php: extractPhp
};

export interface AnalysisContext {
  projectRoot: string;
  config: SessionMapConfig;
  parser: TreeSitterParser;
  dependencyResolver: DependencyResolver;
}

function countLines(sourceText: string): number {
  if (sourceText.length === 0) {
    return 0;
  }

  return sourceText.split(/\r?\n/u).length;
}

function createAnalysisContextInternal(projectRoot: string, config: SessionMapConfig): AnalysisContext {
  return {
    projectRoot,
    config,
    parser: new TreeSitterParser(),
    dependencyResolver: createDependencyResolver(projectRoot)
  };
}

function createHeuristicFile(
  relativePath: string,
  absolutePath: string,
  size: number,
  lastModified: string
): AnalyzedFile {
  const detected = detectLanguage(relativePath);
  return {
    absolutePath,
    relativePath,
    size,
    lastModified,
    language: detected.language,
    tier: detected.tier,
    linesOfCode: 0,
    imports: [],
    exports: [],
    declarations: [],
    source: "heuristic",
    moduleBoundary: computeModuleBoundary(relativePath),
    externalDependencies: [],
    unresolvedImports: []
  };
}

export function createAnalysisContext(projectRoot: string, config: SessionMapConfig): AnalysisContext {
  return createAnalysisContextInternal(projectRoot, config);
}

export async function analyzeFile(context: AnalysisContext, relativePath: string): Promise<AnalyzedFile | null> {
  const absolutePath = path.resolve(context.projectRoot, relativePath);

  let stat;
  try {
    stat = await fs.stat(absolutePath);
  } catch {
    return null;
  }

  if (!stat.isFile() || stat.size > context.config.analysis.maxFileSizeBytes) {
    return null;
  }

  const detected = detectLanguage(relativePath);
  const moduleBoundary = computeModuleBoundary(relativePath);
  const extractor = EXTRACTORS[detected.language];
  if (!extractor) {
    return {
      absolutePath,
      relativePath,
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
      language: detected.language,
      tier: detected.tier,
      linesOfCode: 0,
      imports: [],
      exports: [],
      declarations: [],
      source: "heuristic",
      moduleBoundary,
      externalDependencies: [],
      unresolvedImports: []
    };
  }

  const sourceText = await fs.readFile(absolutePath, "utf8");
  let extracted: ParseResult;
  if (detected.language === "typescript" || detected.language === "javascript") {
    const parseInspection = await context.parser.inspect(detected.language, sourceText);
    extracted = extractor(sourceText, parseInspection.source);
  } else {
    extracted = extractor(sourceText, "heuristic");
  }

  const externalDependencies = new Set<string>();
  const unresolvedImports = new Set<string>();
  const resolvedImports = extracted.imports.map((parsedImport) => {
    const resolution = context.dependencyResolver.resolve(parsedImport.specifier, relativePath, {
      language: detected.language,
      importedSymbols: parsedImport.symbols
    });
    if (resolution.external) {
      externalDependencies.add(parsedImport.specifier);
    }
    if (resolution.unresolved) {
      unresolvedImports.add(parsedImport.specifier);
    }

    return {
      ...parsedImport,
      resolvedPath: resolution.resolvedPath,
      external: resolution.external
    };
  });

  return {
    absolutePath,
    relativePath,
    size: stat.size,
    lastModified: stat.mtime.toISOString(),
    language: detected.language,
    tier: detected.tier,
    linesOfCode: countLines(sourceText),
    imports: resolvedImports,
    exports: extracted.exports,
    declarations: extracted.declarations,
    source: extracted.source,
    moduleBoundary,
    externalDependencies: Array.from(externalDependencies).sort(),
    unresolvedImports: Array.from(unresolvedImports).sort()
  };
}

export async function analyzeProject(
  projectRootOrContext: string | AnalysisContext,
  config?: SessionMapConfig
): Promise<{ state: PersistedState; summary: ScanSummary; analyzedFiles: AnalyzedFile[] }> {
  const context =
    typeof projectRootOrContext === "string"
      ? createAnalysisContextInternal(projectRootOrContext, config as SessionMapConfig)
      : projectRootOrContext;

  const startedAt = new Date();
  const files = await scanProjectFiles(context.projectRoot, context.config);
  const techStack = detectTechStack(context.projectRoot, files);
  const analyzedFiles: AnalyzedFile[] = [];

  for (const file of files) {
    const analyzed = await analyzeFile(context, file.relativePath);
    if (analyzed) {
      analyzedFiles.push(analyzed);
      continue;
    }

    analyzedFiles.push(createHeuristicFile(file.relativePath, file.absolutePath, file.size, file.lastModified));
  }

  const completedAt = new Date();
  logger.info("Analysis completed", {
    projectRoot: context.projectRoot,
    filesScanned: analyzedFiles.length
  });

  const state = buildGraphState({
    projectRoot: context.projectRoot,
    analyzedFiles,
    techStack,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString()
  });

  return {
    state,
    summary: state.metadata.lastScanSummary as ScanSummary,
    analyzedFiles
  };
}
