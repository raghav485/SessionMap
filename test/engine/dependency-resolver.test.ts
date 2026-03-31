import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { createDependencyResolver } from "../../src/engine/dependency-resolver.js";

const tempDirs: string[] = [];

async function copyFixtureToTempDir(fixtureName: string): Promise<string> {
  const sourceDir = path.resolve(process.cwd(), "test/fixtures", fixtureName);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "sessionmap-resolver-"));
  await fs.cp(sourceDir, tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
}

describe("dependency resolver", () => {
  afterEach(async () => {
    while (tempDirs.length > 0) {
      await fs.rm(tempDirs.pop() as string, { recursive: true, force: true });
    }
  });

  test("resolves local workspace packages and nearest tsconfig aliases", async () => {
    const projectRoot = await copyFixtureToTempDir("monorepo-project");
    const resolver = createDependencyResolver(projectRoot);

    expect(resolver.resolve("@fixture/contracts", "apps/api/src/index.ts", { language: "typescript" })).toEqual(
      expect.objectContaining({
        resolvedPath: "packages/contracts/src/index.ts",
        external: false,
        unresolved: false
      })
    );

    expect(resolver.resolve("@app/App", "apps/web/src/main.tsx", { language: "typescript" })).toEqual(
      expect.objectContaining({
        resolvedPath: "apps/web/src/App.tsx",
        external: false,
        unresolved: false
      })
    );

    expect(resolver.resolve("@app/auth/service", "apps/api/src/index.ts", { language: "typescript" })).toEqual(
      expect.objectContaining({
        resolvedPath: "apps/api/src/auth/service.ts",
        external: false,
        unresolved: false
      })
    );

    expect(resolver.resolve("@shared/logger", "apps/web/src/App.tsx", { language: "typescript" })).toEqual(
      expect.objectContaining({
        resolvedPath: "shared/logger.ts",
        external: false,
        unresolved: false
      })
    );

    expect(
      resolver.resolve("@fixture/contracts/runtime/logger", "apps/api/src/index.ts", { language: "typescript" })
    ).toEqual(
      expect.objectContaining({
        resolvedPath: "packages/contracts/src/runtime/logger.ts",
        external: false,
        unresolved: false
      })
    );
  });
});
