import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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

const excludedPrefixes = ["package/src/", "package/test/", "package/tasks/"];

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

async function createPackTarball() {
  const packDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-pack-"));
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-npm-cache-"));
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

  return {
    tarballPath: path.join(packDirectory, tarballName),
    packDirectory,
    cacheDirectory
  };
}

async function listTarEntries(tarballPath) {
  const { stdout } = await execFileAsync(tarCommand, ["-tf", tarballPath], {
    cwd: repoRoot,
    env: process.env
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath);
}

async function validateTarball(tarballPath) {
  const entries = await listTarEntries(tarballPath);
  const missing = requiredEntries.filter((entry) => !entries.includes(entry));
  if (missing.length > 0) {
    throw new Error(`Package tarball is missing required entries:\n${missing.join("\n")}`);
  }

  const unexpected = entries.filter((entry) => excludedPrefixes.some((prefix) => entry.startsWith(prefix)));
  if (unexpected.length > 0) {
    throw new Error(`Package tarball contains excluded entries:\n${unexpected.join("\n")}`);
  }

  return entries;
}

async function main() {
  const providedTarball = process.argv[2] ? path.resolve(process.argv[2]) : null;
  let generatedTarball = null;
  let packDirectory = null;
  let cacheDirectory = null;

  try {
    if (providedTarball) {
      await validateTarball(providedTarball);
      process.stdout.write(`Validated tarball: ${providedTarball}\n`);
      return;
    }

    const created = await createPackTarball();
    generatedTarball = created.tarballPath;
    packDirectory = created.packDirectory;
    cacheDirectory = created.cacheDirectory;
    await validateTarball(generatedTarball);
    process.stdout.write(`Validated tarball: ${generatedTarball}\n`);
  } finally {
    if (generatedTarball) {
      await fs.rm(generatedTarball, { force: true });
    }

    if (packDirectory) {
      await fs.rm(packDirectory, { recursive: true, force: true });
    }

    if (cacheDirectory) {
      await fs.rm(cacheDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
