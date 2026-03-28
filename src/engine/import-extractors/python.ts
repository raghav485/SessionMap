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

function normalizeSymbols(raw: string): string[] {
  return raw
    .replace(/[()]/gu, "")
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/\s+as\s+.+$/u, "").trim())
    .filter((entry) => entry !== "*" && entry.length > 0);
}

function extractAllSymbols(sourceText: string): string[] | null {
  const allMatch = sourceText.match(/^\s*__all__\s*=\s*\[([^\]]*)\]/mu);
  if (!allMatch) {
    return null;
  }

  const values = Array.from(allMatch[1].matchAll(/["']([^"']+)["']/gmu)).map((match) => match[1]);
  return values.length > 0 ? values.sort() : [];
}

export function extractPython(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const declarations = new Set<string>();

  for (const match of sourceText.matchAll(/^\s*import\s+(.+)$/gmu)) {
    const specifiers = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .map((entry) => entry.replace(/\s+as\s+.+$/u, "").trim())
      .filter(Boolean);
    for (const specifier of specifiers) {
      pushImport(imports, specifier, [], "import");
    }
  }

  for (const match of sourceText.matchAll(/^\s*from\s+([.\w]+)\s+import\s+(.+)$/gmu)) {
    pushImport(imports, match[1], normalizeSymbols(match[2]), "import");
  }

  for (const match of sourceText.matchAll(/^def\s+([A-Za-z_][\w]*)\s*\(/gmu)) {
    declarations.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^class\s+([A-Za-z_][\w]*)\b/gmu)) {
    declarations.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^([A-Z][A-Z0-9_]*)\s*=/gmu)) {
    declarations.add(match[1]);
  }

  const explicitExports = extractAllSymbols(sourceText);
  const exports = explicitExports ?? Array.from(declarations).filter((name) => !name.startsWith("_")).sort();

  return {
    imports,
    exports,
    declarations: Array.from(declarations).sort(),
    source,
    parserUsed: source === "ast"
  };
}
