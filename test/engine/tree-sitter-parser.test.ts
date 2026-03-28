import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { analyzeFile, createAnalysisContext } from "../../src/engine/analyzer.js";
import { hasBundledGrammar } from "../../src/engine/tree-sitter-parser.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("tree-sitter parser readiness", () => {
  test("bundles TypeScript and JavaScript grammars and uses AST extraction when they are present", async () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "grammars", "tree-sitter-typescript.wasm"))).toBe(true);
    expect(fs.existsSync(path.resolve(process.cwd(), "grammars", "tree-sitter-javascript.wasm"))).toBe(true);
    expect(hasBundledGrammar("typescript")).toBe(true);
    expect(hasBundledGrammar("javascript")).toBe(true);

    const projectRoot = await copyFixtureToTempDir("sample-project");
    const { config } = loadConfig(projectRoot);
    const context = createAnalysisContext(projectRoot, config);
    const analyzed = await analyzeFile(context, "src/index.ts");

    expect(analyzed?.source).toBe("ast");
  });
});
