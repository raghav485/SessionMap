import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { cleanupProjectDaemon, copyFixtureToTempDir, pollUntil, runCli } from "../helpers.js";

describe("cli integration", () => {
  let projectRoot = "";

  afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("starts, scans, explains, auto-tracks sessions, and stops", async () => {
    projectRoot = await copyFixtureToTempDir("sample-project");

    const startResult = await runCli(["start", "--project-root", projectRoot], projectRoot);
    expect(startResult.stdout).toContain("SessionMap daemon running");
    expect(startResult.stdout).toContain("webUrl:");
    expect(startResult.stdout).toContain("mcpHttpUrl:");
    expect(startResult.stdout).toContain("trackingMode: auto");

    const helpResult = await runCli(["--help"], projectRoot);
    expect(helpResult.stdout).not.toContain(" track ");

    const scanResult = await runCli(["scan", "--project-root", projectRoot], projectRoot);
    expect(scanResult.stdout).toContain("SessionMap scan complete");

    const fileExplain = await runCli(["explain", "src/index.ts", "--project-root", projectRoot], projectRoot);
    expect(fileExplain.stdout).toContain("kind: file");
    expect(fileExplain.stdout).toContain("path: src/index.ts");
    expect(fileExplain.stdout).toContain("externalDependencies: react");

    const directoryExplain = await runCli(["explain", "src", "--project-root", projectRoot], projectRoot);
    expect(directoryExplain.stdout).toContain("kind: directory");
    expect(directoryExplain.stdout).toContain("path: src");

    const statusResult = await runCli(["status", "--project-root", projectRoot], projectRoot);
    expect(statusResult.stdout).toContain("SessionMap status: running");
    expect(statusResult.stdout).toContain("watcherRunning: true");
    expect(statusResult.stdout).toContain("webUrl:");
    expect(statusResult.stdout).toContain("mcpHttpUrl:");
    expect(statusResult.stdout).toContain("trackingMode: auto");
    expect(statusResult.stdout).toContain("activeSessionId: none");

    const sessionsBeforeChanges = await runCli(["sessions", "--project-root", projectRoot], projectRoot);
    expect(sessionsBeforeChanges.stdout).toContain("No sessions found");

    await fs.writeFile(
      path.join(projectRoot, "src", "utils", "math.ts"),
      "export function add(left: number, right: number): number {\n  return left + right + 7;\n}\n",
      "utf8"
    );

    await pollUntil(async () => {
      const sessionsResult = await runCli(["sessions", "--project-root", projectRoot], projectRoot);
      return sessionsResult.stdout.includes("auto-daemon");
    });

    const sessionsResult = await runCli(["sessions", "--project-root", projectRoot], projectRoot);
    expect(sessionsResult.stdout).toContain("auto-daemon");

    const sessionId = sessionsResult.stdout.split(" | ")[0].trim();
    const sessionDetail = await runCli(
      ["sessions", "--project-root", projectRoot, "--id", sessionId],
      projectRoot
    );
    expect(sessionDetail.stdout).toContain("source: auto-daemon");
    expect(sessionDetail.stdout).toContain("actor: agent");
    expect(sessionDetail.stdout).toContain("agentCommand: n/a");

    const sessionsBeforeGenerate = await runCli(["sessions", "--project-root", projectRoot], projectRoot);
    const sessionCountBeforeGenerate = sessionsBeforeGenerate.stdout.split("\n").filter((line) => line.trim().length > 0).length;

    const generateResult = await runCli(["generate", "--project-root", projectRoot], projectRoot);
    expect(generateResult.stdout).toContain("SessionMap generation complete");
    expect(generateResult.stdout).toContain("artifacts:");
    expect(generateResult.stdout).toContain("llmUsed: false");

    await pollUntil(async () => {
      const status = await runCli(["status", "--project-root", projectRoot], projectRoot);
      return status.stdout.includes("lastGeneratedAt:") && !status.stdout.includes("lastGeneratedAt: never");
    });

    const sessionsAfterGenerate = await runCli(["sessions", "--project-root", projectRoot], projectRoot);
    const sessionCountAfterGenerate = sessionsAfterGenerate.stdout.split("\n").filter((line) => line.trim().length > 0).length;
    expect(sessionCountAfterGenerate).toBe(sessionCountBeforeGenerate);

    await fs.writeFile(
      path.join(projectRoot, "src", "index.ts"),
      'import { add } from "./utils/math";\nexport const value = add(1, 2);\n',
      "utf8"
    );

    await pollUntil(async () => {
      const result = await runCli(["sessions", "--project-root", projectRoot], projectRoot);
      return result.stdout.includes("auto-daemon");
    }, 8000);

    const autoSessions = await runCli(["sessions", "--project-root", projectRoot], projectRoot);
    expect(autoSessions.stdout).toContain("auto-daemon");

    const finalStatus = await runCli(["status", "--project-root", projectRoot], projectRoot);
    expect(finalStatus.stdout).toContain("sessions:");
    expect(finalStatus.stdout).toContain("trackingMode: auto");
    expect(finalStatus.stdout).toContain("lastIncrementalUpdateMs:");
    expect(finalStatus.stdout).toContain("generatedArtifacts:");
    expect(finalStatus.stdout).toContain("llmEnabled:");

    const stopResult = await runCli(["stop", "--project-root", projectRoot], projectRoot);
    expect(stopResult.stdout).toContain("SessionMap daemon stopped");
  });
});
