import fs from "node:fs";
import path from "node:path";

import ignore, { type Ignore } from "ignore";

import { MANDATORY_IGNORE_PATTERNS } from "../constants.js";

function readIgnoreFile(projectRoot: string, fileName: string): string[] {
  const filePath = path.join(projectRoot, fileName);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function normalizePattern(pattern: string): string {
  return pattern.replace(/\\/gu, "/");
}

export interface IgnoreMatcher {
  ignores(relativePath: string, isDirectory: boolean): boolean;
}

export function createIgnoreMatcher(projectRoot: string, extraPatterns: string[]): IgnoreMatcher {
  const matcher: Ignore = ignore();
  const patterns = [
    ...MANDATORY_IGNORE_PATTERNS.map((pattern) => `${pattern}/`),
    ...extraPatterns.map(normalizePattern),
    ...readIgnoreFile(projectRoot, ".gitignore"),
    ...readIgnoreFile(projectRoot, ".sessionmapignore")
  ];

  matcher.add(patterns);

  return {
    ignores(relativePath: string, isDirectory: boolean): boolean {
      const normalized = relativePath.replace(/\\/gu, "/");
      if (!normalized || normalized === ".") {
        return false;
      }

      return matcher.ignores(isDirectory ? `${normalized}/` : normalized);
    }
  };
}
