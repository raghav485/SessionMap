import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { copyFixtureToTempDir } from "../helpers.js";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tarCommand = "tar";

const requiredEntries = [
  "package/dist/cli.js",
  "package/dist/web/index.html",
  "package/grammars/tree-sitter-typescript.wasm",
  "package/grammars/tree-sitter-javascript.wasm",
  "package/package.json",
  "package/README.md",
  "package/LICENSE"
];

let packDirectory = "";
let tarballPath = "";
let extractedDirectory = "";
let extractedPackageRoot = "";
let cacheDirectory = "";
let installPrefix = "";
let installedCliPath = "";
let installCacheDirectory = "";

async function createTarball(): Promise<string> {
  packDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-pack-test-"));
  cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-pack-cache-"));
  const { stdout } = await execFileAsync(npmCommand, ["pack", "--pack-destination", packDirectory], {
    cwd: repoRoot,
    env: {
      ...process.env,
      npm_config_cache: cacheDirectory
    }
  });

  const tarballName = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .findLast((line) => line.endsWith(".tgz"));

  if (!tarballName) {
    throw new Error(`Could not determine tarball name from npm pack output:\n${stdout}`);
  }

  tarballPath = path.join(packDirectory, tarballName);
  return tarballPath;
}

async function listTarEntries(tgzPath: string): Promise<string[]> {
  const { stdout } = await execFileAsync(tarCommand, ["-tf", tgzPath], {
    cwd: repoRoot,
    env: process.env
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replaceAll("\\", "/"));
}

async function extractTarball(tgzPath: string): Promise<string> {
  extractedDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-packed-"));
  await execFileAsync(tarCommand, ["-xf", tgzPath, "-C", extractedDirectory], {
    cwd: repoRoot,
    env: process.env
  });
  extractedPackageRoot = path.join(extractedDirectory, "package");
  await fs.symlink(path.join(repoRoot, "node_modules"), path.join(extractedPackageRoot, "node_modules"), "dir");
  return extractedPackageRoot;
}

async function installGlobalPackageFromRepo(): Promise<string> {
  installPrefix = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-global-install-"));
  installCacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-global-cache-"));

  await execFileAsync(npmCommand, ["install", "-g", ".", "--prefix", installPrefix], {
    cwd: repoRoot,
    env: {
      ...process.env,
      npm_config_cache: installCacheDirectory
    }
  });

  installedCliPath = path.join(installPrefix, "bin", process.platform === "win32" ? "sessionmap.cmd" : "sessionmap");
  return installedCliPath;
}

async function runPackagedCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(process.execPath, [path.join(extractedPackageRoot, "dist", "cli.js"), ...args], {
    cwd,
    env: process.env
  });

  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}

async function runInstalledCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const result =
    process.platform === "win32"
      ? await execFileAsync("cmd.exe", ["/d", "/s", "/c", installedCliPath, ...args], {
          cwd,
          env: process.env
        })
      : await execFileAsync(installedCliPath, args, {
          cwd,
          env: process.env
        });

  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}

describe("npm package", () => {
  beforeAll(async () => {
    const tgzPath = await createTarball();
    await extractTarball(tgzPath);
    await installGlobalPackageFromRepo();
  });

  afterAll(async () => {
    await fs.rm(packDirectory, { recursive: true, force: true });
    await fs.rm(extractedDirectory, { recursive: true, force: true });
    await fs.rm(cacheDirectory, { recursive: true, force: true });
    await fs.rm(installPrefix, { recursive: true, force: true });
    await fs.rm(installCacheDirectory, { recursive: true, force: true });
  });

  test("includes only required runtime assets in the tarball", async () => {
    const entries = await listTarEntries(tarballPath);

    for (const entry of requiredEntries) {
      expect(entries).toContain(entry);
    }

    expect(entries.some((entry) => entry.startsWith("package/src/"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith("package/test/"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith("package/tasks/"))).toBe(false);
  });

  test("runs help from the extracted package tarball layout", async () => {
    const result = await runPackagedCli(["--help"], repoRoot);
    expect(result.stdout).toContain("SessionMap daemon and local graph tooling");
  });

  test("runs status from the extracted package tarball layout", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const result = await runPackagedCli(["status", "--project-root", projectRoot], projectRoot);

    expect(result.stdout).toContain("SessionMap status: stopped");
    expect(result.stdout).toContain(`projectRoot: ${projectRoot}`);
  });

  test("installs globally from the repo into a temp prefix and runs help", async () => {
    const result = await runInstalledCli(["--help"], repoRoot);
    expect(result.stdout).toContain("SessionMap daemon and local graph tooling");
  });

  test("installs globally from the repo into a temp prefix and runs status from another project root", async () => {
    const projectRoot = await copyFixtureToTempDir("sample-project");
    const result = await runInstalledCli(["status", "--project-root", projectRoot], projectRoot);

    expect(result.stdout).toContain("SessionMap status: stopped");
    expect(result.stdout).toContain(`projectRoot: ${projectRoot}`);
  });

  test("resolves bundled grammars and packaged web assets from the extracted package layout", async () => {
    const webServerUrl = pathToFileURL(path.join(extractedPackageRoot, "dist", "web", "server.js")).href;
    const graphStoreUrl = pathToFileURL(path.join(extractedPackageRoot, "dist", "graph", "json-store.js")).href;
    const runtimeBusUrl = pathToFileURL(path.join(extractedPackageRoot, "dist", "daemon", "runtime-events.js")).href;
    const parserUrl = pathToFileURL(path.join(extractedPackageRoot, "dist", "engine", "tree-sitter-parser.js")).href;
    const statePath = path.join(extractedDirectory, "state.json");
    const script = `
      const [{ createWebServer }, { JsonGraphStore }, { RuntimeEventBus }, { hasBundledGrammar }] = await Promise.all([
        import(${JSON.stringify(webServerUrl)}),
        import(${JSON.stringify(graphStoreUrl)}),
        import(${JSON.stringify(runtimeBusUrl)}),
        import(${JSON.stringify(parserUrl)})
      ]);
      const store = new JsonGraphStore(${JSON.stringify(statePath)});
      const app = await createWebServer({
        store,
        projectName: "Pack Test",
        projectRoot: ${JSON.stringify(extractedDirectory)},
        getWatcherRunning: () => false,
        getActiveExplicitSessionId: () => null,
        eventBus: new RuntimeEventBus()
      });
      await app.close();
      process.stdout.write(JSON.stringify({
        hasTypescriptGrammar: hasBundledGrammar("typescript"),
        hasJavascriptGrammar: hasBundledGrammar("javascript")
      }));
    `;

    const result = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: extractedPackageRoot,
      env: process.env
    });
    const parsed = JSON.parse(result.stdout.toString()) as {
      hasTypescriptGrammar: boolean;
      hasJavascriptGrammar: boolean;
    };

    expect(parsed.hasTypescriptGrammar).toBe(true);
    expect(parsed.hasJavascriptGrammar).toBe(true);
  });
});
