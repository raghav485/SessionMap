import fs from "node:fs/promises";
import path from "node:path";

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

    await fs.writeFile(
      path.join(projectRoot, "src", "utils", "math.ts"),
      "export function add(left: number, right: number): number {\n  return left + right + 17;\n}\n",
      "utf8"
    );

    await expect(page.getByRole("heading", { name: "Latest Session Digest" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Graph" }).click();
    await expect(page.locator(".graph-svg")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Fit graph" })).toBeVisible();

    const viewport = page.locator(".graph-viewport");
    const initialTransform = await viewport.getAttribute("data-transform");
    await page.locator(".graph-svg").hover();
    await page.mouse.wheel(0, -320);
    await expect.poll(async () => viewport.getAttribute("data-transform")).not.toBe(initialTransform);

    const zoomedTransform = await viewport.getAttribute("data-transform");
    const panSurface = page.locator(".graph-pan-surface");
    const panSurfaceBox = await panSurface.boundingBox();
    if (!panSurfaceBox) {
      throw new Error("Graph pan surface was not rendered");
    }

    await page.mouse.move(panSurfaceBox.x + panSurfaceBox.width / 2, panSurfaceBox.y + panSurfaceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      panSurfaceBox.x + panSurfaceBox.width / 2 + 80,
      panSurfaceBox.y + panSurfaceBox.height / 2 + 40
    );
    await page.mouse.up();
    await expect.poll(async () => viewport.getAttribute("data-transform")).not.toBe(zoomedTransform);

    await page.getByRole("button", { name: "Sessions" }).click();
    await expect(page.getByRole("heading", { name: "Latest Session Digest" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Graph" }).click();
    await expect(page.locator(".graph-svg")).toBeVisible({ timeout: 10000 });
    await expect.poll(async () => viewport.getAttribute("data-transform")).toBe(initialTransform);

    await page.getByRole("button", { name: "Project" }).click();
    await expect(page.getByRole("button", { name: "Modules", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Files", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Show Hidden" })).toBeVisible();
    await expect(page.locator(".graph-summary-chip")).toHaveCount(2);
    await expect(page.getByText(/config files hidden/i)).toBeVisible();
    await expect(page.getByText(/support files hidden/i)).toBeVisible();
    await page.getByRole("button", { name: "Show Hidden" }).click();
    await expect(page.getByRole("button", { name: "Hide Hidden" })).toBeVisible();
    await expect(page.getByText("package.json")).toBeVisible();
    await page.locator(".graph-node").filter({ hasText: "package.json" }).first().locator(".graph-node-hit").click();
    await expect(page.locator(".view-explorer")).toBeVisible({ timeout: 10000 });

    await page.goto(`${manifest.webUrl}/#/graph?scope=project`);
    await expect(page.locator(".graph-svg")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Hide Hidden" }).click();
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await expect(page.locator(".graph-summary-chip")).toContainText(["config files hidden"]);
    await page.getByRole("button", { name: "Fit graph" }).click();
    await page.locator(".graph-node-hit").first().click();
    await expect(page.locator(".view-explorer")).toBeVisible({ timeout: 10000 });
  });

  test("shows sparse project fallback with clickable hidden-item lists", async ({ page }) => {
    projectRoot = await copyFixtureToTempDir("sparse-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);
    await page.goto(`${manifest.webUrl}/#/graph?scope=project`);

    await expect(page.getByRole("button", { name: "Project" })).toBeVisible();
    await expect(page.locator(".graph-hidden-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".graph-hidden-panel-header h3")).toContainText("isolated modules hidden");
    await expect(page.locator(".graph-hidden-item")).toContainText(["src", "src/services", "src/utils"]);
    await expect(
      page.getByText(/intentionally filtered to stay architectural/i)
    ).toBeVisible();

    await page.getByRole("button", { name: /config files hidden/i }).click();
    await expect(page.locator(".graph-hidden-item")).toContainText(["package.json"]);

    await page.locator(".graph-hidden-item").filter({ hasText: "package.json" }).first().click();
    await expect(page.locator(".view-explorer")).toBeVisible({ timeout: 10000 });

    await page.goto(`${manifest.webUrl}/#/graph?scope=project`);
    await page.getByRole("button", { name: "Show Hidden" }).click();
    await expect(page.getByRole("button", { name: "Hide Hidden" })).toBeVisible();
    await expect(page.locator(".graph-hidden-panel")).toHaveCount(0);
    await expect(page.getByText("package.json")).toBeVisible();
  });

  test("supports architecture overview focus mode for nested package repos", async ({ page }) => {
    projectRoot = await copyFixtureToTempDir("monorepo-project");
    await runCli(["start", "--project-root", projectRoot], projectRoot);
    await runCli(["scan", "--project-root", projectRoot], projectRoot);

    const manifest = await readDaemonManifest(projectRoot);
    await page.goto(`${manifest.webUrl}/#/graph?scope=project`);

    await expect(page.getByText("apps/api")).toBeVisible();
    await expect(page.getByText("apps/web")).toBeVisible();
    await expect(page.getByText("packages/contracts")).toBeVisible();

    const webNode = page.locator(".graph-node").filter({ hasText: "apps/web" }).first();
    await webNode.locator(".graph-node-hit").click();

    await expect(page.locator(".graph-focus-pill")).toContainText("apps/web");
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(page.getByRole("button", { name: "src", exact: true })).toBeVisible();
    await expect(page.getByText("main.tsx")).toBeVisible();
    await expect(page.getByText("App.tsx")).toBeVisible();
    await expect(page.getByText("apps/api")).toHaveCount(0);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".graph-focus-pill")).toHaveCount(0);
    await expect(page.locator(".graph-node").filter({ hasText: "apps/web" }).first()).toBeVisible();

    const apiNode = page.locator(".graph-node").filter({ hasText: "apps/api" }).first();
    await apiNode.locator(".graph-node-hit").click();

    await expect(page.locator(".graph-focus-pill")).toContainText("apps/api");
    await expect(page.getByRole("button", { name: "src", exact: true })).toBeVisible();
    await expect(page.getByText("index.ts")).toBeVisible();
    await expect(page.getByText("auth")).toBeVisible();
    await expect(page.getByText("billing")).toBeVisible();
    await expect(page.getByText("services")).toBeVisible();

    const authNode = page.locator(".graph-node").filter({ hasText: "auth" }).first();
    await authNode.locator(".graph-node-hit").click();
    await expect(page.getByRole("button", { name: "auth", exact: true })).toBeVisible();
    await expect(page.getByText("service.ts")).toBeVisible();
    await expect(page.getByText("billing")).toHaveCount(0);

    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("index.ts")).toBeVisible();
    await expect(page.getByText("billing")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator(".graph-focus-pill")).toHaveCount(0);
    await expect(page.locator(".graph-node").filter({ hasText: "apps/api" }).first()).toBeVisible();
  });
});
