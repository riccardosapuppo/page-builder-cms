// What the editor's chrome takes from the theme, held to the published
// page's own stylesheet.
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { COLUMN_GAP_DEFAULT } from "./site-tokens.ts";

test("the column gap the editor names when a column sets none is the one site.css gives it", () => {
  const css = readFileSync(new URL("../../../cms/app/assets/stylesheets/site.css", import.meta.url), "utf8");
  const declared = /--col-gap:\s*var\(--space-([a-z]+)\)/.exec(css);
  expect(declared?.[1]).toBe(COLUMN_GAP_DEFAULT);
});
