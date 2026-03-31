#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { Command } from "commander";

import { APP_NAME, DEFAULT_SESSION_LIST_LIMIT, SCHEMA_VERSION } from "./constants.js";
import { createLogger } from "./logger.js";
import {
  explainPath,
  getDaemonStatus,
  getSession,
  triggerGenerate,
  listSessions,
  pingDaemon,
  triggerScan
} from "./daemon/client.js";
import { runDaemon } from "./daemon/main.js";
import { ensureDaemonRunning, stopDaemon } from "./daemon/launcher.js";
import { getSessionMapPaths, isProcessAlive, readManifest, removeManifest } from "./daemon/manifest.js";
import { runMcpStdioBridge } from "./mcp/stdio-bridge.js";
import { loadConfig } from "./config.js";

const logger = createLogger("cli");

function writeOutput(lines: string[]): void {
  process.stdout.write(`${lines.join("\n")}\n`);
}

function resolveProjectRoot(projectRoot?: string): string {
  return path.resolve(projectRoot ?? process.cwd());
}

async function ensureHealthyManifest(projectRoot: string) {
  const manifest = await ensureDaemonRunning(projectRoot);
  if (!(await pingDaemon(manifest))) {
    throw new Error("Daemon did not become healthy");
  }
  return manifest;
}

function formatStatus(status: Awaited<ReturnType<typeof getDaemonStatus>>): string[] {
  return [
    `${APP_NAME} status: ${status.status}`,
    `projectRoot: ${status.projectRoot}`,
    `schemaVersion: ${status.schemaVersion}`,
    `runtimePath: ${status.runtimePath}`,
    `statePath: ${status.statePath}`,
    `controlUrl: ${status.controlUrl ?? "n/a"}`,
    `webUrl: ${status.webUrl ?? "n/a"}`,
    `mcpHttpUrl: ${status.mcpHttpUrl ?? "n/a"}`,
    `pid: ${status.pid ?? "n/a"}`,
    `nodes: ${status.nodeCount}`,
    `edges: ${status.edgeCount}`,
    `sessions: ${status.sessionCount}`,
    `changeSets: ${status.changeSetCount}`,
    `watcherRunning: ${status.watcherRunning}`,
    `trackingMode: ${status.trackingMode}`,
    `activeSessionId: ${status.activeSessionId ?? "none"}`,
    `lastScan: ${status.lastScanSummary?.completedAt ?? "never"}`,
    `lastIncrementalUpdateMs: ${status.lastIncrementalUpdateMs ?? "n/a"}`,
    `lastGeneratedAt: ${status.lastGeneratedAt ?? "never"}`,
    `generatedArtifacts: ${status.generatedArtifactCount ?? 0}`,
    `llmEnabled: ${status.llmEnabled}`,
    `llmProvider: ${status.llmProvider ?? "n/a"}`
  ];
}

function formatSession(session: Awaited<ReturnType<typeof getSession>>): string[] {
  return [
    `id: ${session.id}`,
    `source: ${session.source}`,
    `actor: ${session.actor}`,
    `confidence: ${session.confidence}`,
    `startedAt: ${session.startedAt}`,
    `endedAt: ${session.endedAt}`,
    `intent: ${session.intent ?? "n/a"}`,
    `agentCommand: ${session.agentCommand ?? "n/a"}`,
    `touchedPaths: ${session.touchedPaths.join(", ") || "none"}`,
    `touchedModules: ${session.touchedModules.join(", ") || "none"}`,
    `changeSets: ${session.changeSets.join(", ") || "none"}`,
    `impactedDependents: ${session.impactedDependents?.join(", ") || "none"}`
  ];
}

async function main(): Promise<void> {
  const program = new Command();

  program.name("sessionmap").description("SessionMap daemon and local graph tooling");
  program.enablePositionalOptions();

  program
    .command("start")
    .option("--project-root <path>", "Project root", process.cwd())
    .action(async (options: { projectRoot: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      const manifest = await ensureHealthyManifest(projectRoot);
      writeOutput([
        `${APP_NAME} daemon running`,
        `projectRoot: ${projectRoot}`,
        `controlUrl: ${manifest.controlUrl}`,
        `webUrl: ${manifest.webUrl ?? "n/a"}`,
        `mcpHttpUrl: ${manifest.mcpHttpUrl ?? "n/a"}`,
        `pid: ${manifest.pid}`,
        `trackingMode: auto`
      ]);
    });

  program
    .command("stop")
    .option("--project-root <path>", "Project root", process.cwd())
    .action(async (options: { projectRoot: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      const result = await stopDaemon(projectRoot);
      writeOutput([`${APP_NAME} daemon ${result}`]);
    });

  program
    .command("status")
    .option("--project-root <path>", "Project root", process.cwd())
    .action(async (options: { projectRoot: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      const manifest = readManifest(projectRoot);
      if (!manifest) {
        const paths = getSessionMapPaths(projectRoot);
        const { config, configPath } = loadConfig(projectRoot);
        writeOutput(
          formatStatus({
            status: "stopped",
            projectRoot,
            schemaVersion: SCHEMA_VERSION,
            configPath,
            statePath: paths.statePath,
            runtimePath: paths.runtimeDir,
            nodeCount: 0,
            edgeCount: 0,
            sessionCount: 0,
            changeSetCount: 0,
            watcherRunning: false,
            trackingMode: "idle",
            llmEnabled: config.llm.enabled,
            llmProvider: config.llm.provider ?? undefined
          })
        );
        return;
      }

      if (!(await pingDaemon(manifest))) {
        const { config, configPath } = loadConfig(projectRoot);
        if (!isProcessAlive(manifest.pid)) {
          removeManifest(projectRoot);
        }

        writeOutput(
          formatStatus({
            status: "stale",
            projectRoot,
            schemaVersion: manifest.schemaVersion,
            configPath,
            statePath: manifest.statePath,
            runtimePath: getSessionMapPaths(projectRoot).runtimeDir,
            controlUrl: manifest.controlUrl,
            webUrl: manifest.webUrl,
            mcpHttpUrl: manifest.mcpHttpUrl,
            pid: manifest.pid,
            startedAt: manifest.startedAt,
            nodeCount: 0,
            edgeCount: 0,
            sessionCount: 0,
            changeSetCount: 0,
            watcherRunning: false,
            trackingMode: "idle",
            llmEnabled: config.llm.enabled,
            llmProvider: config.llm.provider ?? undefined
          })
        );
        return;
      }

      writeOutput(formatStatus(await getDaemonStatus(manifest)));
    });

  program
    .command("scan")
    .option("--project-root <path>", "Project root", process.cwd())
    .action(async (options: { projectRoot: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      const manifest = await ensureHealthyManifest(projectRoot);
      const summary = await triggerScan(manifest);
      writeOutput([
        `${APP_NAME} scan complete`,
        `filesScanned: ${summary.filesScanned}`,
        `nodes: ${summary.nodes}`,
        `edges: ${summary.edges}`,
        `durationMs: ${summary.durationMs}`
      ]);
    });

  program
    .command("generate")
    .option("--project-root <path>", "Project root", process.cwd())
    .action(async (options: { projectRoot: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      const manifest = await ensureHealthyManifest(projectRoot);
      const summary = await triggerGenerate(manifest);
      writeOutput([
        `${APP_NAME} generation complete`,
        `artifacts: ${summary.artifactCount}`,
        `modules: ${summary.moduleCount}`,
        `llmUsed: ${summary.llmUsed}`,
        `provider: ${summary.llmProvider ?? "n/a"}`,
        `durationMs: ${summary.durationMs}`,
        `lastGeneratedAt: ${summary.completedAt}`
      ]);
    });

  program
    .command("explain")
    .argument("<path>", "File or directory path")
    .option("--project-root <path>", "Project root", process.cwd())
    .action(async (targetPath: string, options: { projectRoot: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      const manifest = await ensureHealthyManifest(projectRoot);
      const explanation = await explainPath(manifest, targetPath);

      if (explanation.kind === "file") {
        writeOutput([
          `kind: file`,
          `path: ${explanation.path}`,
          `language: ${explanation.language}`,
          `tier: ${explanation.tier}`,
          `summary: ${explanation.summary}`,
          `moduleBoundary: ${explanation.moduleBoundary ?? "n/a"}`,
          `exports: ${explanation.exports.join(", ") || "none"}`,
          `dependencies: ${explanation.dependencies.join(", ") || "none"}`,
          `dependents: ${explanation.dependents.join(", ") || "none"}`,
          `externalDependencies: ${explanation.externalDependencies.join(", ") || "none"}`,
          `unresolvedImports: ${explanation.unresolvedImports.join(", ") || "none"}`
        ]);
        return;
      }

      writeOutput([
        `kind: directory`,
        `path: ${explanation.path}`,
        `fileCount: ${explanation.fileCount}`,
        `dominantLanguages: ${explanation.dominantLanguages.join(", ") || "none"}`,
        `techStackHints: ${explanation.techStackHints.join(", ") || "none"}`,
        `summary: ${explanation.summary ?? "n/a"}`,
        `summarySource: ${explanation.summarySource ?? "n/a"}`,
        `children: ${explanation.children.join(", ") || "none"}`
      ]);
    });

  program
    .command("sessions")
    .option("--project-root <path>", "Project root", process.cwd())
    .option("--id <sessionId>", "Fetch a specific session")
    .option("--limit <count>", "List limit", `${DEFAULT_SESSION_LIST_LIMIT}`)
    .action(async (options: { projectRoot: string; id?: string; limit: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      const manifest = await ensureHealthyManifest(projectRoot);

      if (options.id) {
        const session = await getSession(manifest, options.id);
        writeOutput(formatSession(session));
        return;
      }

      const sessions = await listSessions(manifest, Number.parseInt(options.limit, 10));
      const lines = sessions.flatMap((session) => [
        `${session.id} | ${session.source} | ${session.actor} | confidence=${session.confidence} | ${session.startedAt} -> ${session.endedAt} | touched=${session.touchedPaths.length}`
      ]);
      writeOutput(lines.length > 0 ? lines : ["No sessions found"]);
    });

  program
    .command("mcp")
    .option("--project-root <path>", "Project root", process.cwd())
    .action(async (options: { projectRoot: string }) => {
      const projectRoot = resolveProjectRoot(options.projectRoot);
      await runMcpStdioBridge(projectRoot);
    });

  program
    .command("daemon")
    .requiredOption("--project-root <path>", "Project root")
    .action(async (options: { projectRoot: string }) => {
      await runDaemon(resolveProjectRoot(options.projectRoot));
    });

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  logger.error("CLI command failed", {
    message: error instanceof Error ? error.message : String(error)
  });
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
