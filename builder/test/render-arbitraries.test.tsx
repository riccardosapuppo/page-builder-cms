// The rule-9 generator on its own, without a server: every page it makes is
// valid (it throws otherwise), uses what it was made to use, and draws in
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

test("200 generated pages are valid, hold every block type, and draw safely", () => {
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
    { seed: 20261002, numRuns: 200 },
  );
  expect([...seen].sort()).toEqual([...BLOCK_TYPES].sort());
  expect(maps).toBeGreaterThan(10);
}, 120_000);
