import type { ExtractorSource, ParseResult, ParsedImport } from "../../types.js";

function pushImport(imports: ParsedImport[], specifier: string, kind: ParsedImport["kind"]): void {
  imports.push({
    specifier,
    symbols: [],
    kind,
    isTypeOnly: false,
    external: false
  });
}

export function extractRuby(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const declarations = new Set<string>();
  const exports = new Set<string>();

  for (const match of sourceText.matchAll(/^\s*require_relative\s+["']([^"']+)["']/gmu)) {
    pushImport(imports, `./${match[1]}`, "require");
  }
  for (const match of sourceText.matchAll(/^\s*require\s+["']([^"']+)["']/gmu)) {
    pushImport(imports, match[1], "require");
  }

  for (const match of sourceText.matchAll(/^\s*class\s+([A-Za-z_][\w:]*)\b/gmu)) {
    declarations.add(match[1]);
    exports.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*module\s+([A-Za-z_][\w:]*)\b/gmu)) {
    declarations.add(match[1]);
    exports.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*def\s+self\.([A-Za-z_][\w!?=]*)\b/gmu)) {
    declarations.add(`self.${match[1]}`);
    exports.add(`self.${match[1]}`);
  }

  return {
    imports,
    exports: Array.from(exports).sort(),
    declarations: Array.from(declarations).sort(),
    source,
    parserUsed: source === "ast"
  };
}
