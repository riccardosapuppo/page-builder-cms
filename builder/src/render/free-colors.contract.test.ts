// The editor's half of the free colours' stylesheet: for every shared case
// of contract/free-colors/cases.json, the rules the canvas puts in its page
// (./free-colors-css.ts) are the bytes the CMS serves at /colors.css,
// written there by cms/test/models/free_colors_test.rb (UPDATE_GOLDEN=1).
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { freeColorsCss, type FreeColorsInput } from "./free-colors-css.ts";

const dir = join(repoRoot, "contract", "free-colors");
const { cases } = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")) as { cases: Record<string, FreeColorsInput> };

test("the free colours' stylesheet of every shared case is the CMS's, byte for byte", () => {
  expect(Object.keys(cases)).toEqual(["none", "slots", "blocks", "dark-site", "traps"]);
  for (const [name, input] of Object.entries(cases)) {
    expect(freeColorsCss(input), name).toBe(readFileSync(join(dir, `${name}.css`), "utf8"));
  }
  expect(freeColorsCss(cases.none!)).toBe("");
});
