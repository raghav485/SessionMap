import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { cleanupProjectDaemon, copyFixtureToTempDir, pollUntil, readDaemonManifest, runCli } from "../helpers.js";

describe("web live updates", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("emits live update messages for incremental changes, generation, and explicit session lifecycle", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);
    const messages: Array<{ reason: string; affectedPaths?: string[] }> = [];
    const socket = new WebSocket(`${manifest.webUrl?.replace("http", "ws")}/ws`);

    socket.addEventListener("message", (event) => {
      messages.push(JSON.parse(event.data as string) as { reason: string; affectedPaths?: string[] });
    });

    await pollUntil(() => socket.readyState === WebSocket.OPEN, 5000);

    await fs.writeFile(
      path.join(projectRoot, "src", "index.ts"),
      'import { add } from "./utils/math";\nexport const value = add(1, 2);\n',
      "utf8"
    );

    await pollUntil(() => messages.some((message) => message.reason === "changes-applied"), 8000);

    await runCli(["generate", "--project-root", projectRoot], projectRoot);
    await pollUntil(() => messages.some((message) => message.reason === "generation-completed"), 8000);

    await runCli(["track", "--project-root", projectRoot, "--", "node", "scripts/noop.js"], projectRoot);

    await pollUntil(
      () =>
        messages.some((message) => message.reason === "explicit-session-started") &&
        messages.some((message) => message.reason === "explicit-session-ended"),
      8000
    );

    expect(messages.some((message) => message.affectedPaths?.includes("src/index.ts"))).toBe(true);
    expect(messages.some((message) => message.reason === "generation-completed")).toBe(true);
    socket.close();
  });
});
