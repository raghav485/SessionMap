import type { ExtractorSource, ParseResult, ParsedImport } from "../../types.js";

function pushImport(
  imports: ParsedImport[],
  specifier: string,
  symbols: string[],
  kind: ParsedImport["kind"]
): void {
  imports.push({
    specifier,
    symbols,
    kind,
    isTypeOnly: false,
    external: false
  });
}

function normalizeNamespaceImports(raw: string): Array<{ specifier: string; symbols: string[] }> {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const withoutAlias = entry.replace(/\s+as\s+.+$/iu, "").trim();
      return {
        specifier: withoutAlias,
        symbols: withoutAlias.includes("\\") ? [withoutAlias.split("\\").at(-1) ?? withoutAlias] : []
      };
    });
}

export function extractPhp(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const declarations = new Set<string>();
  const exports = new Set<string>();

  for (const match of sourceText.matchAll(
    /\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?["']([^"']+)["']\s*\)?/gmu
  )) {
    pushImport(imports, match[1], [], "require");
  }

  for (const match of sourceText.matchAll(/^\s*use\s+([^;]+);/gmu)) {
    for (const namespaceImport of normalizeNamespaceImports(match[1])) {
      pushImport(imports, namespaceImport.specifier, namespaceImport.symbols, "import");
    }
  }

  for (const match of sourceText.matchAll(
    /^\s*(?:abstract\s+|final\s+)?(class|interface|trait)\s+([A-Za-z_][\w]*)/gmu
  )) {
    declarations.add(match[2]);
    exports.add(match[2]);
  }
  for (const match of sourceText.matchAll(/^\s*function\s+([A-Za-z_][\w]*)\s*\(/gmu)) {
    declarations.add(match[1]);
    exports.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*const\s+([A-Za-z_][\w]*)\b/gmu)) {
    declarations.add(match[1]);
    exports.add(match[1]);
  }

  return {
    imports,
    exports: Array.from(exports).sort(),
    declarations: Array.from(declarations).sort(),
    source,
    parserUsed: source === "ast"
  };
}
