// The editor's half of the free type's stylesheet: for every shared case of
// contract/free-type/cases.json, the rules the canvas puts in its page
// (./free-type-css.ts) are the bytes the CMS serves at /type/<digest>.css,
// written there by cms/test/models/free_type_test.rb (UPDATE_GOLDEN=1).
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { freeTypeCss, type FreeTypeInput } from "./free-type-css.ts";

const dir = join(repoRoot, "contract", "free-type");
const { cases } = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8")) as { cases: Record<string, FreeTypeInput> };

test("the free type's stylesheet of every shared case is the CMS's, byte for byte", () => {
  expect(Object.keys(cases)).toEqual(["none", "blocks", "phone-only", "traps"]);
  for (const [name, input] of Object.entries(cases)) {
    expect(freeTypeCss(input), name).toBe(readFileSync(join(dir, `${name}.css`), "utf8"));
  }
  expect(freeTypeCss(cases.none!)).toBe("");
});
