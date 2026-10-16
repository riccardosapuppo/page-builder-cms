// The editor's browser tests: Chromium headless, never a window on the
// screen, against a CMS and an editor server the run starts for itself
// (harness/playwright-setup.ts) on E2E_CMS_PORT (3901) and
// E2E_BUILDER_PORT (4901), the CMS's checkout going to the tests' fake
// Stripe, on a port the system gives it. One worker: the tests share those
// servers.
// Every context starts as a browser that has seen the editor's first-run
// note (harness/welcome.ts), but welcome.spec.ts's.
import { defineConfig, devices } from "@playwright/test";
import { builderPort } from "./harness/ports.ts";
import { welcomeSeen } from "./harness/welcome.ts";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  // The editor on the browser's storage has a run and a server of its own
  // (browser/playwright.config.ts, npm run e2e:browser), with no CMS, and
  // so has the browser demo's build (demo/playwright.config.ts, npm run
  // e2e:demo).
  testIgnore: ["browser/**", "demo/**"],
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
    storageState: welcomeSeen(`http://127.0.0.1:${builderPort()}`),
    headless: true,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], headless: true } }],
});
