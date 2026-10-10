// node --test tools/lib/header-checks.test.ts
//
// What the production check holds of a header, decided before any browser
// draws it: the letters of the header the face lacks, found by the
// committed widths file (none in the design's header, the scripts of the
// others, a character the file does not measure, nothing from the
// footer); what each verdict of tools/header-metrics.ts --check holds of a
// header of the face's letters, of one in another script and of one with a
// character the file does not measure; which verdict fails on its own; and
// what the RESULT line says was held back over the ten headers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEADER_CASES, held, lettersOutside, notHeldHere, verdictFails, type SiteValues } from "./header-checks.ts";
import type { FontsHere } from "./header-metrics-verdict.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const metrics = JSON.parse(readFileSync(join(root, "schema", "header-metrics.json"), "utf8"));
const SCRIPTS = ["Greek", "Cyrillic", "Hebrew", "Arabic", "CJK"];
const site = (label: string): SiteValues => {
  const found = HEADER_CASES.find((c) => c.label === label);
  assert.ok(found, label);
  return found.site;
};
const here = (verdict: FontsHere["verdict"], others: string[] = []): FontsHere => ({ verdict, others, line: "" });

test("the letters of a header that the face lacks, by the widths file", () => {
  assert.deepEqual(lettersOutside(site("the design's header"), metrics), { scripts: [], unmeasured: false });
  assert.deepEqual(lettersOutside(site("every length at its limit, in the widest letter"), metrics), { scripts: [], unmeasured: false });
  assert.deepEqual(lettersOutside(site("three links in another script"), metrics), { scripts: ["CJK", "Arabic", "Greek"], unmeasured: false });
  assert.deepEqual(lettersOutside(site("a short header in Hebrew"), metrics), { scripts: ["Hebrew"], unmeasured: false });
  assert.deepEqual(lettersOutside(site("seven Arabic links whose letters join"), metrics), { scripts: ["Arabic"], unmeasured: false });
  assert.deepEqual(lettersOutside(site("a link of a letter drawn wider than counted"), metrics), { scripts: [], unmeasured: true });
  const design = site("the design's header");
  // An accented letter the face holds is its own; a code point of Greek's
  // range that lists no letter is still Greek; a symbol in no range is a
  // character the file does not measure, in the button as in the name.
  assert.deepEqual(lettersOutside({ ...design, name: "Café Ærø" }, metrics), { scripts: [], unmeasured: false });
  assert.deepEqual(lettersOutside({ ...design, name: "\u038B" }, metrics), { scripts: ["Greek"], unmeasured: false });
  assert.deepEqual(lettersOutside({ ...design, action: { label: "☺", href: "/" } }, metrics), { scripts: [], unmeasured: true });
  // The footer is not in the header's bar: its letters are not counted.
  assert.deepEqual(lettersOutside({ ...design, footer: { lead: "Ωμέγα", text: "日本 ☺" } }, metrics), { scripts: [], unmeasured: false });
});

test("what each verdict holds of a header of the face's letters, of one in Greek, and of one with a character the file does not measure", () => {
  const face = { scripts: [], unmeasured: false };
  const greek = { scripts: ["Greek"], unmeasured: false };
  const symbol = { scripts: [], unmeasured: true };
  // The file is what this machine draws: every row and padding, but never
  // for a character counted at 1.5 em.
  assert.deepEqual(held(here("file"), face), { row: true, padding: true });
  assert.deepEqual(held(here("file"), greek), { row: true, padding: true });
  assert.deepEqual(held(here("file"), symbol), { row: false, padding: false });
  // Greek drawn here with other fonts: the face's header whole, the Greek
  // one neither; other scripts drawn otherwise leave the Greek one whole.
  assert.deepEqual(held(here("face", ["Greek"]), face), { row: true, padding: true });
  assert.deepEqual(held(here("face", ["Greek"]), greek), { row: false, padding: false });
  assert.deepEqual(held(here("face", ["Arabic", "CJK"]), greek), { row: true, padding: true });
  // Not what this machine draws, or no verdict: the row of the face's
  // letters only, whatever scripts are named.
  for (const verdict of ["neither", "unknown"] as const) {
    for (const others of [[], SCRIPTS]) {
      assert.deepEqual(held(here(verdict, others), face), { row: true, padding: false }, `${verdict} ${others}`);
      assert.deepEqual(held(here(verdict, others), greek), { row: false, padding: false }, `${verdict} ${others}`);
      assert.deepEqual(held(here(verdict, others), symbol), { row: false, padding: false }, `${verdict} ${others}`);
    }
  }
});

test("a file not drawn here as it holds fails on its own only where no script is drawn with other fonts", () => {
  assert.equal(verdictFails(here("neither", [])), true);
  assert.equal(verdictFails(here("neither", ["Arabic", "CJK"])), false);
  assert.equal(verdictFails(here("unknown", SCRIPTS)), false);
  assert.equal(verdictFails(here("face", ["Arabic"])), false);
  assert.equal(verdictFails(here("file")), false);
});

test("the RESULT line says what the verdict held back over the ten headers, and nothing where it held all", () => {
  const headers = HEADER_CASES.map((c) => ({ links: c.site.menu.length, outside: lettersOutside(c.site, metrics) }));
  assert.equal(headers.length, 10);
  assert.equal(notHeldHere(here("file"), headers), null);
  // Four headers hold letters of other scripts, eight hold links of
  // letters the file measures (the ninth's U+FDFD is held to neither, the
  // tenth has no links).
  assert.equal(notHeldHere(here("neither"), headers), "not held here, since header-metrics.json is not what this machine draws: the row of 4 header(s), the right padding of 8");
  assert.equal(notHeldHere(here("unknown", SCRIPTS), headers), "not held here, since tools/header-metrics.ts --check gave no verdict here: the row of 4 header(s), the right padding of 8");
  assert.equal(notHeldHere(here("face", ["Arabic", "CJK"]), headers), "not held here, since this machine draws the letters of Arabic, CJK with other fonts than header-metrics.json was measured with: the row of 2 header(s), the right padding of 2");
  assert.equal(notHeldHere(here("face", ["Cyrillic"]), headers), null);
});
