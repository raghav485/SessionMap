import { expect, test } from "@playwright/test";

import { cleanupProjectDaemon, copyFixtureToTempDir, readDaemonManifest, runCli } from "../helpers.js";

test.describe("dashboard smoke", () => {
  let projectRoot = "";

  test.afterEach(async () => {
    if (projectRoot) {
      await cleanupProjectDaemon(projectRoot);
    }
  });

  test("loads the dashboard and reacts to tracked work", async ({ page }) => {
    projectRoot = await copyFixtureToTempDir("sample-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);
    await page.goto(manifest.webUrl ?? "");

    await expect(page.getByRole("heading", { name: "Review Workbench" })).toBeVisible();
    await expect(page.getByText(/No Sessions Yet|Latest Session Digest/)).toBeVisible();

    await runCli(["track", "--project-root", projectRoot, "--", "node", "scripts/change-math.js"], projectRoot);

    await expect(page.getByRole("heading", { name: "Latest Session Digest" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Graph" }).click();
    await expect(page.locator(".graph-svg")).toBeVisible({ timeout: 10000 });
    await page.locator(".graph-node-hit").first().click();
    await expect(page.locator(".view-explorer")).toBeVisible({ timeout: 10000 });
  });
});
