// The entry point each build's page loads, and the storage each build
// keeps its pages in: the demo's mode is the browser's storage, and a
// setting that asks the demo for the CMS, or names no storage, stops the
// build.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildStorage, DEMO_MODE } from "./demo.ts";
import { builderRoot } from "./paths.ts";
import { chooseEntry, ENTRIES } from "./storage-entry.ts";

const index = readFileSync(join(builderRoot, "index.html"), "utf8");

describe("the entry point", () => {
  test("the editor's page names the CMS's entry, which the browser's build swaps for the demo's", () => {
    expect(index).toContain(`<script type="module" src="${ENTRIES.rails}"></script>`);
    expect(chooseEntry(index, "rails")).toBe(index);
    const demo = chooseEntry(index, "browser");
    expect(demo).toContain(`<script type="module" src="${ENTRIES.browser}"></script>`);
    expect(demo).not.toContain(ENTRIES.rails);
    expect(demo.replace(ENTRIES.browser, ENTRIES.rails)).toBe(index);
  });

  test("a page that does not name the editor's entry is left as it is", () => {
    const probe = '<script type="module" src="/test/browser/storage-page.ts"></script>';
    expect(chooseEntry(probe, "browser")).toBe(probe);
  });
});

describe("the storage a build keeps its pages in", () => {
  const env = (value?: string): NodeJS.ProcessEnv => (value === undefined ? {} : { VITE_STORAGE: value });

  test("the CMS's by default, the browser's when asked or in the demo's mode, written back trimmed", () => {
    const plain = env();
    expect(buildStorage("production", plain)).toBe("rails");
    expect(plain.VITE_STORAGE).toBe("rails");
    const asked = env(" browser ");
    expect(buildStorage("development", asked)).toBe("browser");
    expect(asked.VITE_STORAGE).toBe("browser");
    for (const value of [undefined, "browser", ""]) {
      const demo = env(value);
      expect(buildStorage(DEMO_MODE, demo)).toBe("browser");
      expect(demo.VITE_STORAGE).toBe("browser");
    }
  });

  test("the demo asked for the CMS, or a storage that does not exist, stops the build", () => {
    expect(() => buildStorage(DEMO_MODE, env("rails"))).toThrow('the demo keeps its pages in the browser: VITE_STORAGE must be browser or unset with --mode demo, not "rails"');
    expect(() => buildStorage("production", env("cloud"))).toThrow('VITE_STORAGE must be rails or browser, not "cloud"');
  });
});
