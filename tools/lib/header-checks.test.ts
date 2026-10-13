// node --test tools/lib/header-checks.test.ts
//
// What the production check holds of a header, decided before any browser
// draws it: each case's document, the header's starter with the case's
// words in its logo, menu and button, or with no menu and no button; the
// letters of a menu's links the face lacks, found by the committed widths
// file (none in the design's menu, the scripts of the others, a character
// the file does not measure, nothing from the logo or the button); what
// each verdict of tools/header-metrics.ts --check holds of a menu of the
// face's letters, of one in another script and of one with a character the
// file does not measure; which verdict fails on its own; and what the
// RESULT line says was held back over the ten headers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HEADER_CASES, headerDocument, held, lettersOutside, notHeldHere, verdictFails, type HeaderWords } from "./header-checks.ts";
import type { FontsHere } from "./header-metrics-verdict.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const metrics = JSON.parse(readFileSync(join(root, "schema", "header-metrics.json"), "utf8"));
const starter = JSON.parse(readFileSync(join(root, "cms", "config", "parts", "header.json"), "utf8"));
const SCRIPTS = ["Greek", "Cyrillic", "Hebrew", "Arabic", "CJK"];
const words = (label: string): HeaderWords => {
  const found = HEADER_CASES.find((c) => c.label === label);
  assert.ok(found, label);
  return found.words;
};
const here = (verdict: FontsHere["verdict"], others: string[] = []): FontsHere => ({ verdict, others, line: "" });
type Block = { id: string; type: string; props: Record<string, unknown>; children: Block[] };
const widgets = (document: { sections: Block[] }) => document.sections.flatMap((s) => s.children.flatMap((c) => c.children));

test("a case's header is the starter with its words in the logo, the menu and the button, and the starter's own words are the design's", () => {
  assert.deepEqual(headerDocument(words("the design's header")), starter);
  const sixth = widgets(headerDocument(words("a sixth link")));
  assert.deepEqual(sixth.map((b) => b.type), ["logo", "menu", "button"]);
  assert.equal((sixth[1]!.props.items as unknown[]).length, 6);
  assert.equal(sixth[1]!.props.label, "Main");
  // No menu and no button: the logo alone, in the same three columns.
  const bare = headerDocument(words("no menu and no button"));
  assert.deepEqual(bare.sections[0]!.children.map((c) => c.children.map((b) => b.type)), [["logo"], [], []]);
  assert.deepEqual(headerDocument({ name: "", links: [], button: null }).sections[0]!.children[0]!.children[0]!.props, {});
  // Every case's header within the schema's limits: a name of 40, links
  // of 40, at most 12 of them, a button's label of 80.
  for (const c of HEADER_CASES) {
    assert.ok([...c.words.name].length <= 40, c.label);
    assert.ok(c.words.links.length <= 12 && c.words.links.every((l) => [...l.label].length <= 40), c.label);
    assert.ok(!c.words.button || [...c.words.button.label].length <= 80, c.label);
  }
});

test("the letters of a menu's links that the face lacks, by the widths file", () => {
  assert.deepEqual(lettersOutside(words("the design's header"), metrics), { scripts: [], unmeasured: false });
  assert.deepEqual(lettersOutside(words("every length at its limit, in the widest letter"), metrics), { scripts: [], unmeasured: false });
  assert.deepEqual(lettersOutside(words("three links in another script"), metrics), { scripts: ["CJK", "Arabic", "Greek"], unmeasured: false });
  assert.deepEqual(lettersOutside(words("a short menu in Hebrew"), metrics), { scripts: ["Hebrew"], unmeasured: false });
  assert.deepEqual(lettersOutside(words("seven Arabic links whose letters join"), metrics), { scripts: ["Arabic"], unmeasured: false });
  assert.deepEqual(lettersOutside(words("a link of a letter drawn wider than counted"), metrics), { scripts: [], unmeasured: true });
  const design = words("the design's header");
  // An accented letter the face holds is its own; a code point of Greek's
  // range that lists no letter is still Greek; a symbol in no range is a
  // character the file does not measure.
  assert.deepEqual(lettersOutside({ ...design, links: [{ label: "Café Ærø", href: "/" }] }, metrics), { scripts: [], unmeasured: false });
  assert.deepEqual(lettersOutside({ ...design, links: [{ label: "΋", href: "/" }] }, metrics), { scripts: ["Greek"], unmeasured: false });
  assert.deepEqual(lettersOutside({ ...design, links: [{ label: "☺", href: "/" }] }, metrics), { scripts: [], unmeasured: true });
  // The logo and the button stand in columns of their own: their letters
  // are not counted.
  assert.deepEqual(lettersOutside({ ...design, name: "Ωμέγα ☺", button: { label: "日本", href: "/" } }, metrics), { scripts: [], unmeasured: false });
});

test("what each verdict holds of a menu of the face's letters, of one in Greek, and of one with a character the file does not measure", () => {
  const face = { scripts: [], unmeasured: false };
  const greek = { scripts: ["Greek"], unmeasured: false };
  const symbol = { scripts: [], unmeasured: true };
  // The file is what this machine draws: every line, and just past every
  // step, but never for a character counted at 1.5 em.
  assert.deepEqual(held(here("file"), face), { row: true, step: true });
  assert.deepEqual(held(here("file"), greek), { row: true, step: true });
  assert.deepEqual(held(here("file"), symbol), { row: false, step: false });
  // Greek drawn here with other fonts: the face's menu whole, the Greek
  // one neither; other scripts drawn otherwise leave the Greek one whole.
  assert.deepEqual(held(here("face", ["Greek"]), face), { row: true, step: true });
  assert.deepEqual(held(here("face", ["Greek"]), greek), { row: false, step: false });
  assert.deepEqual(held(here("face", ["Arabic", "CJK"]), greek), { row: true, step: true });
  // Not what this machine draws, or no verdict: the line of the face's
  // letters only, whatever scripts are named.
  for (const verdict of ["neither", "unknown"] as const) {
    for (const others of [[], SCRIPTS]) {
      assert.deepEqual(held(here(verdict, others), face), { row: true, step: false }, `${verdict} ${others}`);
      assert.deepEqual(held(here(verdict, others), greek), { row: false, step: false }, `${verdict} ${others}`);
      assert.deepEqual(held(here(verdict, others), symbol), { row: false, step: false }, `${verdict} ${others}`);
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
  const menus = HEADER_CASES.map((c) => ({ links: c.words.links.length, outside: lettersOutside(c.words, metrics) }));
  assert.equal(menus.length, 10);
  assert.equal(notHeldHere(here("file"), menus), null);
  // Four menus hold letters of other scripts, eight hold links of letters
  // the file measures (the ninth's U+FDFD is held to neither, the tenth
  // header has no menu).
  assert.equal(notHeldHere(here("neither"), menus), "not held here, since header-metrics.json is not what this machine draws: the line of the links of 4 menu(s), the line just past the step of 8");
  assert.equal(notHeldHere(here("unknown", SCRIPTS), menus), "not held here, since tools/header-metrics.ts --check gave no verdict here: the line of the links of 4 menu(s), the line just past the step of 8");
  assert.equal(notHeldHere(here("face", ["Arabic", "CJK"]), menus), "not held here, since this machine draws the letters of Arabic, CJK with other fonts than header-metrics.json was measured with: the line of the links of 2 menu(s), the line just past the step of 2");
  assert.equal(notHeldHere(here("face", ["Cyrillic"]), menus), null);
});
