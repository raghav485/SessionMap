import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Language, Parser } from "web-tree-sitter";

type LoadedLanguage = Awaited<ReturnType<typeof Language.load>>;

interface ParseInspection {
  parserUsed: boolean;
  source: "ast" | "heuristic";
}

const grammarFiles: Record<string, string> = {
  typescript: "tree-sitter-typescript.wasm",
  javascript: "tree-sitter-javascript.wasm"
};

let parserInitialized: Promise<void> | null = null;
const languageCache = new Map<string, LoadedLanguage | null>();
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const grammarDirectories = [
  path.resolve(currentDirectory, "../../grammars"),
  path.resolve(process.cwd(), "grammars")
];

async function initializeParser(): Promise<void> {
  if (!parserInitialized) {
    parserInitialized = Parser.init();
  }

  await parserInitialized;
}

function resolveGrammarPath(language: string): string | null {
  const grammarFile = grammarFiles[language];
  if (!grammarFile) {
    return null;
  }

  for (const candidateDirectory of grammarDirectories) {
    const grammarPath = path.join(candidateDirectory, grammarFile);
    if (fs.existsSync(grammarPath)) {
      return grammarPath;
    }
  }

  return null;
}

export function hasBundledGrammar(language: string): boolean {
  return resolveGrammarPath(language) !== null;
}

export class TreeSitterParser {
  private async loadLanguage(language: string): Promise<LoadedLanguage | null> {
    if (languageCache.has(language)) {
      return languageCache.get(language) ?? null;
    }

    const grammarPath = resolveGrammarPath(language);
    if (!grammarPath) {
      languageCache.set(language, null);
      return null;
    }

    await initializeParser();
    const loaded = await Language.load(grammarPath);
    languageCache.set(language, loaded);
    return loaded;
  }

  async inspect(language: string, sourceText: string): Promise<ParseInspection> {
    const loadedLanguage = await this.loadLanguage(language);
    if (!loadedLanguage) {
      return { parserUsed: false, source: "heuristic" };
    }

    const parser = new Parser();
    parser.setLanguage(loadedLanguage);
    parser.parse(sourceText);
    return { parserUsed: true, source: "ast" };
  }
}
