import type { ExtractorSource, ParseResult, ParsedImport } from "../../types.js";

function pushImport(imports: ParsedImport[], specifier: string): void {
  imports.push({
    specifier,
    symbols: [],
    kind: "import",
    isTypeOnly: false,
    external: false
  });
}

export function extractCSharp(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const declarations = new Set<string>();
  const exports = new Set<string>();

  for (const match of sourceText.matchAll(/^\s*(?:global\s+)?using\s+([A-Za-z_][\w.]*)\s*;/gmu)) {
    pushImport(imports, match[1]);
  }

  for (const match of sourceText.matchAll(
    /^\s*(public\s+)?(?:abstract\s+|sealed\s+|partial\s+|readonly\s+)?(?:class|interface|enum|record|struct)\s+([A-Za-z_][\w]*)/gmu
  )) {
    declarations.add(match[2]);
    if (match[1]) {
      exports.add(match[2]);
    }
  }

  return {
    imports,
    exports: Array.from(exports).sort(),
    declarations: Array.from(declarations).sort(),
    source,
    parserUsed: source === "ast"
  };
}
