// The editor's browser tests: Chromium headless, never a window on the
// screen, against a CMS and an editor server the run starts for itself
// (harness/playwright-setup.ts) on E2E_CMS_PORT (3901) and
// E2E_BUILDER_PORT (4901). One worker: the tests share those two servers.
import { defineConfig, devices } from "@playwright/test";
import { builderPort } from "./harness/ports.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./harness/playwright-setup.ts",
  outputDir: "./test-results",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${builderPort()}`,
    headless: true,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], headless: true } }],
});
