import type { ParseResult, ParsedImport, ExtractorSource } from "../../types.js";

function normalizeSymbols(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/\bas\b.*$/u, "").trim())
    .filter(Boolean);
}

function pushImport(
  imports: ParsedImport[],
  specifier: string,
  symbols: string[],
  kind: ParsedImport["kind"],
  isTypeOnly = false
): void {
  imports.push({
    specifier,
    symbols,
    kind,
    isTypeOnly,
    external: false
  });
}

export function extractTypeScript(sourceText: string, source: ExtractorSource): ParseResult {
  const imports: ParsedImport[] = [];
  const exports = new Set<string>();
  const declarations = new Set<string>();

  for (const match of sourceText.matchAll(/^\s*import\s+type\s+(.+?)\s+from\s+["']([^"']+)["']/gmu)) {
    pushImport(imports, match[2], normalizeSymbols(match[1].replace(/[{}]/gu, "")), "import", true);
  }

  for (const match of sourceText.matchAll(/^\s*import\s+(.+?)\s+from\s+["']([^"']+)["']/gmu)) {
    pushImport(imports, match[2], normalizeSymbols(match[1].replace(/[{}*]/gu, "")), "import");
  }

  for (const match of sourceText.matchAll(/^\s*import\s+["']([^"']+)["']/gmu)) {
    pushImport(imports, match[1], [], "side-effect");
  }

  for (const match of sourceText.matchAll(/^\s*export\s+\*\s+from\s+["']([^"']+)["']/gmu)) {
    pushImport(imports, match[1], ["*"], "export");
  }

  for (const match of sourceText.matchAll(/^\s*export\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/gmu)) {
    pushImport(imports, match[2], normalizeSymbols(match[1]), "export");
  }

  for (const match of sourceText.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/gmu)) {
    pushImport(imports, match[1], [], "require");
  }

  for (const match of sourceText.matchAll(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gmu)) {
    exports.add(match[1]);
    declarations.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*export\s+class\s+([A-Za-z_$][\w$]*)/gmu)) {
    exports.add(match[1]);
    declarations.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*export\s+(?:const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gmu)) {
    exports.add(match[1]);
    declarations.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*export\s+\{([^}]+)\}/gmu)) {
    for (const symbol of normalizeSymbols(match[1])) {
      exports.add(symbol);
    }
  }
  if (/^\s*export\s+default\b/gmu.test(sourceText)) {
    exports.add("default");
  }

  for (const match of sourceText.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gmu)) {
    declarations.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*class\s+([A-Za-z_$][\w$]*)/gmu)) {
    declarations.add(match[1]);
  }
  for (const match of sourceText.matchAll(/^\s*(?:const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gmu)) {
    declarations.add(match[1]);
  }

  return {
    imports,
    exports: Array.from(exports).sort(),
    declarations: Array.from(declarations).sort(),
    source,
    parserUsed: source === "ast"
  };
}
