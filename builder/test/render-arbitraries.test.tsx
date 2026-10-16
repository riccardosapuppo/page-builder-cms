// The agreement check's page generator on its own, without a server:
// every page it makes is valid (it throws otherwise), uses what it was made to use, and draws in
// React without an error and through the safety check.
// @vitest-environment node
import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PageSections } from "../src/render/blocks.tsx";
import { BLOCK_TYPES } from "../src/shared/document.ts";
import { page } from "./render-arbitraries.ts";
import { safetyProblems } from "./render-safety.ts";

const resolver = (id: string) => (id === "lib-1" ? { src: "/rails/active_storage/blobs/proxy/x/a.png", width: 3, height: 2 } : null);

// 80 pages, drawn by React's development build: about 20 s on a busy
// machine. The random-page agreement check is where the pages are many.
test("80 generated pages are valid, hold every block type a page holds, and draw safely", () => {
  const seen = new Set<string>();
  let maps = 0;
  fc.assert(
    fc.property(page(["lib-1", "lib-2"]), (document) => {
      JSON.stringify(document, (key, value: unknown) => {
        if (key === "type" && typeof value === "string" && (BLOCK_TYPES as readonly string[]).includes(value)) seen.add(value);
        if (key === "latitude") maps += 1;
        return value;
      });
      const html = renderToStaticMarkup(<PageSections document={document} ctx={{ media: resolver }} />);
      expect(safetyProblems(html)).toEqual([]);
    }),
    { seed: 20261002, numRuns: 80 },
  );
  // Every type a page holds: a Field block and an Add to cart block only a
  // template does.
  expect([...seen].sort()).toEqual(BLOCK_TYPES.filter((type) => type !== "field" && type !== "addToCart").sort());
  expect(maps).toBeGreaterThan(10);
}, 240_000);
