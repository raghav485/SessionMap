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
const defaultOutputDirectory = path.join(repoRoot, "out", "beta-release");
const templateDirectory = path.join(repoRoot, "scripts", "beta");
const tarballUrlPlaceholder = "__SESSIONMAP_TARBALL_URL__";

const wrapperDefinitions = [
  { fileName: "sessionmap-beta.sh", mode: 0o755 },
  { fileName: "sessionmap-beta.ps1", mode: 0o644 },
  { fileName: "sessionmap-beta.cmd", mode: 0o755 }
];

function writeStatus(message) {
  process.stderr.write(`${message}\n`);
}

function usage() {
  return [
    "Usage: node scripts/create-beta-release.mjs --tag <release-tag> [--output-dir <path>] [--skip-release-check]",
    "",
    "Examples:",
    "  npm run beta:bundle -- --tag v0.1.0-beta.1",
    "  node scripts/create-beta-release.mjs --tag v0.1.0-beta.1 --output-dir ./out/beta-release --skip-release-check"
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    tag: "",
    outputDir: defaultOutputDirectory,
    skipReleaseCheck: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--tag": {
        const next = argv[index + 1];
        if (!next) {
          throw new Error("Missing value for --tag");
        }
        options.tag = next;
        index += 1;
        break;
      }
      case "--output-dir": {
        const next = argv[index + 1];
        if (!next) {
          throw new Error("Missing value for --output-dir");
        }
        options.outputDir = path.resolve(next);
        index += 1;
        break;
      }
      case "--skip-release-check":
        options.skipReleaseCheck = true;
        break;
      case "--help":
      case "-h":
        process.stdout.write(`${usage()}\n`);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.tag) {
    throw new Error("Missing required --tag <release-tag>");
  }

  return options;
}

async function loadPackageJson() {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const raw = await fs.readFile(packageJsonPath, "utf8");
  return JSON.parse(raw);
}

function getRepositorySlug(packageJson) {
  const repositoryField = packageJson.repository;
  const repositoryUrl =
    typeof repositoryField === "string" ? repositoryField : repositoryField?.url;

  if (typeof repositoryUrl !== "string" || repositoryUrl.length === 0) {
    throw new Error("package.json is missing repository metadata needed for beta release URLs");
  }

  const match = repositoryUrl.match(/github\.com[:/](?<slug>[^/]+\/[^/.]+?)(?:\.git)?$/i);
  const slug = match?.groups?.slug;
  if (!slug) {
    throw new Error(`Could not determine GitHub repository slug from repository URL: ${repositoryUrl}`);
  }

  return slug;
}

async function runReleaseCheck(skipReleaseCheck) {
  if (skipReleaseCheck) {
    writeStatus("Skipping `npm run release:check` as requested.");
    return;
  }

  writeStatus("Running `npm run release:check`...");
  await execFileAsync(npmCommand, ["run", "release:check"], {
    cwd: repoRoot,
    env: process.env
  });
}

async function createPackTarball() {
  const packDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-beta-pack-"));
  const cacheDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-beta-cache-"));

  try {
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
      packDirectory,
      cacheDirectory,
      tarballName,
      tarballPath: path.join(packDirectory, tarballName)
    };
  } catch (error) {
    await fs.rm(packDirectory, { recursive: true, force: true });
    await fs.rm(cacheDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function prepareOutputDirectory(outputDir) {
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
}

async function writeWrappers(outputDir, tarballUrl) {
  const writtenPaths = [];

  for (const wrapper of wrapperDefinitions) {
    const templatePath = path.join(templateDirectory, wrapper.fileName);
    const template = await fs.readFile(templatePath, "utf8");
    if (!template.includes(tarballUrlPlaceholder)) {
      throw new Error(`Wrapper template is missing ${tarballUrlPlaceholder}: ${templatePath}`);
    }

    const outputPath = path.join(outputDir, wrapper.fileName);
    const content = template.replaceAll(tarballUrlPlaceholder, tarballUrl);
    await fs.writeFile(outputPath, content, "utf8");
    await fs.chmod(outputPath, wrapper.mode);
    writtenPaths.push(outputPath);
  }

  return writtenPaths;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packageJson = await loadPackageJson();
  const repositorySlug = getRepositorySlug(packageJson);

  await runReleaseCheck(options.skipReleaseCheck);

  writeStatus("Creating beta tarball...");
  const created = await createPackTarball();
  const tarballUrl = `https://github.com/${repositorySlug}/releases/download/${encodeURIComponent(
    options.tag
  )}/${encodeURIComponent(created.tarballName)}`;

  try {
    await prepareOutputDirectory(options.outputDir);
    const outputTarballPath = path.join(options.outputDir, created.tarballName);
    await fs.copyFile(created.tarballPath, outputTarballPath);
    const wrapperPaths = await writeWrappers(options.outputDir, tarballUrl);

    writeStatus(`Prepared beta release assets in ${options.outputDir}`);
    writeStatus(`Pinned tarball URL: ${tarballUrl}`);
    writeStatus(`Tarball: ${outputTarballPath}`);
    for (const wrapperPath of wrapperPaths) {
      writeStatus(`Wrapper: ${wrapperPath}`);
    }
  } finally {
    await fs.rm(created.packDirectory, { recursive: true, force: true });
    await fs.rm(created.cacheDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
