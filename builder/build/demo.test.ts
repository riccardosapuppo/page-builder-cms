// Where the demo is served from (./demo.ts): GitHub Pages' path by default,
// the root of a host of its own with DEMO_BASE=/, any path that starts and
// ends with a slash; anything else stops the build, saying why.
import { expect, test } from "vitest";
import { DEMO_PAGES_BASE, demoBase } from "./demo.ts";

test("the demo's base: Pages' path by default, the root or another path when DEMO_BASE says so, and nothing else", () => {
  expect(DEMO_PAGES_BASE).toBe("/page-builder-cms/");
  expect(demoBase({})).toBe(DEMO_PAGES_BASE);
  expect(demoBase({ DEMO_BASE: "" })).toBe(DEMO_PAGES_BASE);
  expect(demoBase({ DEMO_BASE: " / " })).toBe("/");
  expect(demoBase({ DEMO_BASE: "/demo/" })).toBe("/demo/");
  expect(demoBase({ DEMO_BASE: "/club/editor/" })).toBe("/club/editor/");
  for (const wrong of ["page-builder-cms", "/page-builder-cms", "page-builder-cms/", "//", "/Demo/", "/a b/", "https://builder.example.org/"]) {
    expect(() => demoBase({ DEMO_BASE: wrong }), wrong).toThrow(/^DEMO_BASE must be a path that starts and ends with "\/"/);
  }
});
