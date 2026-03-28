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

export function extractJava(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const declarations = new Set<string>();
  const exports = new Set<string>();

  for (const match of sourceText.matchAll(/^\s*import\s+(static\s+)?([A-Za-z_][\w.]*)(?:\.\*)?\s*;/gmu)) {
    const isStatic = Boolean(match[1]);
    const importedPath = match[2];
    if (isStatic) {
      const segments = importedPath.split(".");
      const symbol = segments.pop();
      pushImport(imports, segments.join("."), symbol ? [symbol] : [], "import");
      continue;
    }

    pushImport(imports, importedPath, [], "import");
  }

  for (const match of sourceText.matchAll(
    /^\s*(?:public\s+)?(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+)?(class|interface|enum|record)\s+([A-Za-z_][\w]*)/gmu
  )) {
    declarations.add(match[2]);
    if (/^\s*public\b/u.test(match[0])) {
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
