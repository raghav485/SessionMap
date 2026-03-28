import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { cleanupProjectDaemon, copyFixtureToTempDir, pollUntil, runCli } from "../helpers.js";

interface ParsedStatus {
  changeSetCount: number;
  lastIncrementalUpdateMs: number | null;
}

function parseStatus(stdout: string): ParsedStatus {
  const values = new Map<string, string>();
  for (const line of stdout.trim().split("\n")) {
    const separatorIndex = line.indexOf(": ");
    if (separatorIndex === -1) {
      continue;
    }

    values.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 2));
  }

  return {
    changeSetCount: Number.parseInt(values.get("changeSets") ?? "0", 10),
    lastIncrementalUpdateMs:
      values.get("lastIncrementalUpdateMs") && values.get("lastIncrementalUpdateMs") !== "n/a"
        ? Number.parseInt(values.get("lastIncrementalUpdateMs") ?? "0", 10)
        : null
  };
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

describe("incremental benchmark", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("reports sub-200ms median incremental update time on the sample fixture", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);
    await runCli(["scan", "--project-root", projectRoot], projectRoot);

    const targetPath = path.join(projectRoot, "src", "utils", "math.ts");
    let previousStatus = parseStatus((await runCli(["status", "--project-root", projectRoot], projectRoot)).stdout);
    const samples: number[] = [];

    for (let index = 0; index < 5; index += 1) {
      await fs.writeFile(
        targetPath,
        `export function add(left: number, right: number): number {\n  return left + right + ${index};\n}\n`,
        "utf8"
      );

      await pollUntil(async () => {
        const status = parseStatus((await runCli(["status", "--project-root", projectRoot], projectRoot)).stdout);
        return status.changeSetCount > previousStatus.changeSetCount;
      }, 8000);

      previousStatus = parseStatus((await runCli(["status", "--project-root", projectRoot], projectRoot)).stdout);
      expect(previousStatus.lastIncrementalUpdateMs).not.toBeNull();
      samples.push(previousStatus.lastIncrementalUpdateMs ?? 0);
    }

    const median = computeMedian(samples);
    process.stderr.write(`incremental benchmark median=${median}ms samples=${samples.join(",")}\n`);
    expect(median).toBeLessThan(200);
  });
});
