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

function isExported(name: string): boolean {
  return /^[A-Z]/u.test(name);
}

export function extractGo(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const declarations = new Set<string>();
  const exports = new Set<string>();

  for (const match of sourceText.matchAll(/^\s*import\s+\(([\s\S]*?)^\s*\)/gmu)) {
    for (const pathMatch of match[1].matchAll(/^\s*(?:[A-Za-z_][\w]*|_|\.|\s+)?\s*"([^"]+)"/gmu)) {
      pushImport(imports, pathMatch[1]);
    }
  }

  for (const match of sourceText.matchAll(/^\s*import\s+(?:[A-Za-z_][\w]*|_|\.|\s+)?\s*"([^"]+)"/gmu)) {
    pushImport(imports, match[1]);
  }

  const declarationMatchers = [
    /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)\s*\(/gmu,
    /^\s*type\s+([A-Za-z_][\w]*)\b/gmu,
    /^\s*const\s+([A-Za-z_][\w]*)\b/gmu,
    /^\s*var\s+([A-Za-z_][\w]*)\b/gmu
  ];

  for (const matcher of declarationMatchers) {
    for (const match of sourceText.matchAll(matcher)) {
      const name = match[1];
      declarations.add(name);
      if (isExported(name)) {
        exports.add(name);
      }
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
