// The browser demo's story, in Chromium headless, never a window on the
// screen: the demo as built for GitHub Pages (npm run build:demo, which
// npm run e2e:demo runs first), served from dist-demo/ under
// /page-builder-cms/ as Pages serves it (setup.ts), on E2E_DEMO_PORT
// (4903). Each test opens a browser of its own, as a first visit. One
// worker: the tests share the server.
import { defineConfig, devices } from "@playwright/test";
import { demoPort } from "../harness/ports.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./setup.ts",
  outputDir: "../test-results/demo",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${demoPort()}`,
    headless: true,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, headless: true } }],
});
