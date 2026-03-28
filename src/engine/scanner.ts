import fs from "node:fs/promises";
import path from "node:path";

import type { SessionMapConfig, FileScanEntry } from "../types.js";
import { createIgnoreMatcher } from "./ignore-resolver.js";

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/");
}

async function walkDirectory(
  projectRoot: string,
  currentDir: string,
  depth: number,
  config: SessionMapConfig,
  matcher: ReturnType<typeof createIgnoreMatcher>,
  files: FileScanEntry[]
): Promise<void> {
  if (depth > config.analysis.maxDepth) {
    return;
  }

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = normalizeRelativePath(path.relative(projectRoot, absolutePath));

      if (matcher.ignores(relativePath, entry.isDirectory())) {
        return;
      }

      if (entry.isDirectory()) {
        await walkDirectory(projectRoot, absolutePath, depth + 1, config, matcher, files);
        return;
      }

      if (!entry.isFile()) {
        return;
      }

      const stat = await fs.stat(absolutePath);
      if (stat.size > config.analysis.maxFileSizeBytes) {
        return;
      }

      files.push({
        absolutePath,
        relativePath,
        size: stat.size,
        lastModified: stat.mtime.toISOString()
      });
    })
  );
}

export async function scanProjectFiles(projectRoot: string, config: SessionMapConfig): Promise<FileScanEntry[]> {
  const matcher = createIgnoreMatcher(projectRoot, config.ignore);
  const files: FileScanEntry[] = [];
  await walkDirectory(projectRoot, projectRoot, 0, config, matcher, files);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}
