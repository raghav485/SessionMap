import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../../src/config.js";
import { FileWatcher } from "../../src/watcher/file-watcher.js";
import { copyFixtureToTempDir, pollUntil } from "../helpers.js";

describe("file watcher", () => {
  let projectRoot = "";
  let watcher: FileWatcher | null = null;

  afterEach(async () => {
    await watcher?.stop();
  });

  test("emits events for project files and ignores .sessionmap", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    const { config } = loadConfig(projectRoot);
    watcher = new FileWatcher(projectRoot, config);
    const events: string[] = [];

    watcher.on("event", (event) => {
      events.push(`${event.op}:${event.path}`);
    });

    await watcher.start();
    await fs.mkdir(path.join(projectRoot, ".sessionmap"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, ".sessionmap", "ignored.txt"), "ignore", "utf8");
    await fs.writeFile(path.join(projectRoot, "src", "index.ts"), 'export const changed = true;\n', "utf8");

    await pollUntil(() => events.some((entry) => entry.endsWith("src/index.ts")));
    expect(events.some((entry) => entry.includes(".sessionmap"))).toBe(false);
  });
});
