import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const scriptPath = path.join(repoRoot, "scripts", "create-beta-release.mjs");
const templateDirectory = path.join(repoRoot, "scripts", "beta");
const generatedTag = "v0.1.0-beta.1";
const expectedTarballUrl =
  "https://github.com/raghav485/SessionMap/releases/download/v0.1.0-beta.1/sessionmap-0.1.0.tgz";

let outputDirectory = "";

describe("beta launchers", () => {
  beforeAll(async () => {
    outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-beta-output-"));
    await execFileAsync(process.execPath, [scriptPath, "--tag", generatedTag, "--output-dir", outputDirectory, "--skip-release-check"], {
      cwd: repoRoot,
      env: process.env
    });
  });

  afterAll(async () => {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  });

  test("wrapper templates keep the expected placeholder and forwarding shapes", async () => {
    const shTemplate = await fs.readFile(path.join(templateDirectory, "sessionmap-beta.sh"), "utf8");
    const ps1Template = await fs.readFile(path.join(templateDirectory, "sessionmap-beta.ps1"), "utf8");
    const cmdTemplate = await fs.readFile(path.join(templateDirectory, "sessionmap-beta.cmd"), "utf8");

    expect(shTemplate).toContain("__SESSIONMAP_TARBALL_URL__");
    expect(shTemplate).toContain('sessionmap "$@"');
    expect(ps1Template).toContain("__SESSIONMAP_TARBALL_URL__");
    expect(ps1Template).toContain("sessionmap @args");
    expect(cmdTemplate).toContain("__SESSIONMAP_TARBALL_URL__");
    expect(cmdTemplate).toContain("sessionmap %*");
  });

  test("beta prep script writes pinned wrappers and the tarball into the output directory", async () => {
    const entries = await fs.readdir(outputDirectory);

    expect(entries).toContain("sessionmap-0.1.0.tgz");
    expect(entries).toContain("sessionmap-beta.sh");
    expect(entries).toContain("sessionmap-beta.ps1");
    expect(entries).toContain("sessionmap-beta.cmd");
  });

  test("generated wrappers embed the exact tarball URL and remove the placeholder", async () => {
    const shWrapper = await fs.readFile(path.join(outputDirectory, "sessionmap-beta.sh"), "utf8");
    const ps1Wrapper = await fs.readFile(path.join(outputDirectory, "sessionmap-beta.ps1"), "utf8");
    const cmdWrapper = await fs.readFile(path.join(outputDirectory, "sessionmap-beta.cmd"), "utf8");

    for (const wrapper of [shWrapper, ps1Wrapper, cmdWrapper]) {
      expect(wrapper).toContain(expectedTarballUrl);
      expect(wrapper).not.toContain("__SESSIONMAP_TARBALL_URL__");
    }

    expect(shWrapper).toContain('npm exec --yes --package="$SESSIONMAP_TARBALL_URL" -- sessionmap "$@"');
    expect(ps1Wrapper).toContain('& npm exec --yes "--package=$SessionMapTarballUrl" -- sessionmap @args');
    expect(cmdWrapper).toContain("call npm exec --yes --package=%SESSIONMAP_TARBALL_URL% -- sessionmap %*");
  });
});
