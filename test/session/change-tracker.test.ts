import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { ChangeTracker } from "../../src/session/change-tracker.js";
import { copyFixtureToTempDir } from "../helpers.js";

describe("change-tracker", () => {
  test("collapses repeated changes on the same path into one change event", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const tracker = new ChangeTracker({
      projectRoot,
      debounceMs: 300,
      resolveLanguage: () => "typescript"
    });

    tracker.push({ ts: "2026-03-27T00:00:00.000Z", path: "src/index.ts", op: "change" });
    tracker.push({ ts: "2026-03-27T00:00:00.100Z", path: "src/index.ts", op: "change" });
    const changeSet = await tracker.flush();

    expect(changeSet?.events).toHaveLength(1);
    expect(changeSet?.events[0].op).toBe("change");
  });

  test("coalesces unlink and add into a rename event", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const oldPath = path.join(projectRoot, "src", "lib", "helper.js");
    const newPath = path.join(projectRoot, "src", "lib", "helper-renamed.js");
    await fs.rename(oldPath, newPath);

    const tracker = new ChangeTracker({
      projectRoot,
      debounceMs: 300,
      resolveLanguage: () => "javascript"
    });

    tracker.push({ ts: "2026-03-27T00:00:00.000Z", path: "src/lib/helper.js", op: "unlink" });
    tracker.push({ ts: "2026-03-27T00:00:00.100Z", path: "src/lib/helper-renamed.js", op: "add" });
    const changeSet = await tracker.flush();

    expect(changeSet?.events).toHaveLength(1);
    expect(changeSet?.events[0].op).toBe("rename");
    expect(changeSet?.events[0].previousPath).toBe("src/lib/helper.js");
  });
});
