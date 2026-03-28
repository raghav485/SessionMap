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
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/\bas\b.*$/u, "").trim())
    .filter((entry) => entry !== "self" && entry !== "*" && entry.length > 0);
}

function addRustUseImport(imports: ParsedImport[], rawSpecifier: string, kind: ParsedImport["kind"]): void {
  const cleaned = rawSpecifier.replace(/\bas\b.*$/u, "").trim();
  const braceMatch = cleaned.match(/^(.*)::\{(.+)\}$/u);
  if (!braceMatch) {
    pushImport(imports, cleaned, [], kind);
    return;
  }

  pushImport(imports, braceMatch[1].trim(), normalizeSymbols(braceMatch[2]), kind);
}

export function extractRust(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const declarations = new Set<string>();
  const exports = new Set<string>();

  for (const match of sourceText.matchAll(/^\s*use\s+([^;]+);/gmu)) {
    addRustUseImport(imports, match[1], "import");
  }
  for (const match of sourceText.matchAll(/^\s*pub\s+use\s+([^;]+);/gmu)) {
    addRustUseImport(imports, match[1], "export");
    for (const symbol of normalizeSymbols(match[1].match(/\{(.+)\}/u)?.[1] ?? "")) {
      exports.add(symbol);
    }
  }

  const declarationMatchers: Array<[RegExp, boolean]> = [
    [/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/gmu, true],
    [/^\s*(?:pub\s+)?struct\s+([A-Za-z_][\w]*)\b/gmu, true],
    [/^\s*(?:pub\s+)?enum\s+([A-Za-z_][\w]*)\b/gmu, true],
    [/^\s*(?:pub\s+)?trait\s+([A-Za-z_][\w]*)\b/gmu, true],
    [/^\s*(?:pub\s+)?const\s+([A-Za-z_][\w]*)\b/gmu, true],
    [/^\s*(?:pub\s+)?type\s+([A-Za-z_][\w]*)\b/gmu, true],
    [/^\s*(?:pub\s+)?mod\s+([A-Za-z_][\w]*)\b/gmu, true]
  ];

  for (const [matcher] of declarationMatchers) {
    for (const match of sourceText.matchAll(matcher)) {
      declarations.add(match[1]);
    }
  }

  for (const match of sourceText.matchAll(/^\s*pub\s+(?:async\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/gmu)) {
    exports.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*pub\s+(?:struct|enum|trait|const|type|mod)\s+([A-Za-z_][\w]*)\b/gmu)) {
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
