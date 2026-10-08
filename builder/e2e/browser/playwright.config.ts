// The editor on the browser's storage (IndexedDB), in Chromium headless,
// never a window on the screen: the storage battery run against it with
// two pages of one browser as the two tabs, the editor working on it, and
// the sentences it gives up with. One editor server, the run's own, with
// VITE_STORAGE=browser and no CMS (setup.ts), on E2E_BROWSER_PORT (4902).
// One worker: the tests share that server.
import { defineConfig, devices } from "@playwright/test";
import { browserEditorPort } from "../harness/ports.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./setup.ts",
  outputDir: "../test-results/browser",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${browserEditorPort()}`,
    headless: true,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], headless: true } }],
});
