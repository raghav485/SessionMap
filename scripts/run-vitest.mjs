import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const vitestEntry = path.join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const testRoot = path.join(repoRoot, "test");

function collectTestFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(path.relative(repoRoot, absolutePath));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function parseArgs(argv) {
  const passthrough = [];
  let grepPattern = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--grep") {
      grepPattern = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (argument.startsWith("--grep=")) {
      grepPattern = argument.slice("--grep=".length);
      continue;
    }

    passthrough.push(argument);
  }

  return {
    passthrough,
    grepPattern
  };
}

function resolveGrepTargets(grepPattern) {
  if (!grepPattern) {
    return [];
  }

  const matcher = new RegExp(grepPattern, "u");
  return collectTestFiles(testRoot).filter((filePath) => matcher.test(filePath));
}

const { passthrough, grepPattern } = parseArgs(process.argv.slice(2));
const grepTargets = resolveGrepTargets(grepPattern);
const args = [...passthrough, ...(grepTargets.length > 0 ? grepTargets : grepPattern ? ["--testNamePattern", grepPattern] : [])];

const child = spawn(process.execPath, [vitestEntry, ...args], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
