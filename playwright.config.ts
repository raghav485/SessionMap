import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/web",
  testMatch: /dashboard\.test\.ts/u,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    headless: true
  }
});
