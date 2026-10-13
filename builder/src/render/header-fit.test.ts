// Where a menu's links fold (./header-fit.ts), on the cases the server's
// own test holds HeaderFit to (cms/test/models/header_fit_test.rb), from
// the design's four links, the ones the header's starter has
// (cms/config/parts/header.json). That the two add up the same on any menu
// is header-fit.rails.test.ts's to show, through Ruby.
// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot } from "../../build/paths.ts";
import { advanceOf, menuFold, METRICS as metrics, rubySum, runWidth, widthNeeded } from "./header-fit.ts";

const DESIGN = ["Swims", "Gallery", "Meet us", "Questions"];
const times = (n: number, label: string) => Array.from({ length: n }, () => label);

test("the design's four links need 327 px, so they fold in a block narrower than 360; the starter's menu, those and the Winter series page, needs 454 and folds below 480", () => {
  expect(Math.abs(widthNeeded(DESIGN) - 327)).toBeLessThanOrEqual(1);
  expect(menuFold(DESIGN)).toBe("360");
  const header = JSON.parse(readFileSync(join(repoRoot, "cms", "config", "parts", "header.json"), "utf8")) as { sections: Array<{ children: Array<{ children: Array<{ type: string; props: { items?: Array<{ label: string }> } }> }> }> };
  const menus = header.sections.flatMap((s) => s.children.flatMap((c) => c.children.filter((b) => b.type === "menu")));
  const starter = [DESIGN[0]!, "Winter series", ...DESIGN.slice(1)];
  expect(menus.map((menu) => menu.props.items?.map((item) => item.label))).toEqual([starter]);
  expect(Math.abs(widthNeeded(starter) - 454)).toBeLessThanOrEqual(1);
  expect(menuFold(starter)).toBe("480");
});

test("the row is every label and a gap between two: one link more is its word and a gap more", () => {
  const more = widthNeeded([...DESIGN, "Contact"]) - widthNeeded(DESIGN);
  expect(more).toBeCloseTo(runWidth(metrics.link, "Contact") + metrics.link.gap, 3);
  expect(metrics.link.gap).toBe(28);
});

// Each "Timetable" is about 76 px, and a gap 28: each count of them lands
// on the step of 40 px that holds it (8 need 804 px, 11 need 1116), until
// no step does.
test("the step is the narrowest that holds the row, each in turn, and a row no step holds folds at every width", () => {
  expect(runWidth(metrics.link, "Timetable")).toBeCloseTo(75.8, 1);
  expect([1, 2, 4, 8, 11, 12].map((n) => menuFold(times(n, "Timetable")))).toEqual(["80", "200", "400", "840", "1120", "all"]);
  expect(menuFold(times(12, "W".repeat(40)))).toBe("all");
});

test("a menu with no link has nothing to fold", () => {
  expect(menuFold([])).toBeNull();
});

test("a character neither the face nor a script has a measure for counts 1.5 times the font size, wider than any letter of the face", () => {
  const link = metrics.link;
  expect(link.otherwise).toBe(link.size * 1.5);
  expect(link.otherwise).toBeGreaterThan(Math.max(...Object.values(link.advances)));
  for (const character of ["🌊", "\u{FDFD}", "→", "΅", "Ϗ"]) expect(advanceOf(link, character), character).toBe(link.otherwise);
});

test("the letters of the scripts the file measured count what they were drawn at, less than a character nothing measured", () => {
  const link = metrics.link;
  expect(link.scripts.map((script) => script.name)).toEqual(["Greek", "Cyrillic", "Hebrew", "Arabic", "CJK"]);
  for (const script of link.scripts) {
    expect(script.advance, script.name).toBeGreaterThan(0);
    expect(script.advance, script.name).toBeLessThan(link.otherwise);
    const widths = Object.values(script.letters);
    if (widths.length > 0) expect(script.advance, script.name).toBe(Math.max(...widths));
  }
  const scripts = Object.fromEntries(link.scripts.map((script) => [script.name, script]));
  // Greek, Cyrillic, Hebrew and Arabic list each of their letters: a letter counts its own width.
  for (const [name, letter] of [["Greek", "Ω"], ["Cyrillic", "Щ"], ["Hebrew", "ש"], ["Arabic", "ض"]] as const) {
    expect(advanceOf(link, letter), name).toBe(scripts[name]!.letters[letter]);
  }
  // A code point of a script's range that is no letter listed (an unassigned
  // one) counts the script's widest, and CJK, which lists none, counts it
  // for every ideograph, kana, Hangul syllable and fullwidth form.
  expect(advanceOf(link, "΋")).toBe(scripts.Greek!.advance);
  for (const character of ["日", "本", "の", "한", "！", "　"]) expect(advanceOf(link, character), character).toBe(scripts.CJK!.advance);
  expect(scripts.CJK!.advance).toBeLessThan(link.otherwise);
});

// A visitor reads a Hebrew, Greek, Cyrillic, Arabic or Japanese menu as
// short as it is: four links whose letters are no wider than the design's
// fold no later than the design's do (360). Counted at 1.5 em each, the
// Greek and Cyrillic ones would need 720 px and fold below 720.
test("short menus in Hebrew, Greek, Cyrillic, Arabic and Japanese fold no later than the design's four links", () => {
  const menus: Record<string, string[]> = {
    Hebrew: ["שחייה", "גלריה", "עלינו", "שאלות"],
    Greek: ["Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"],
    Cyrillic: ["Заплывы", "Галерея", "Встречи", "Вопросы"],
    Arabic: ["السباحة", "المعرض", "لقاء", "أسئلة"],
    CJK: ["泳ぎ方", "写真", "会合", "質問"],
  };
  const folds = Object.fromEntries(Object.entries(menus).map(([name, labels]) => [name, menuFold(labels)]));
  expect(folds).toEqual({ Hebrew: "240", Greek: "360", Cyrillic: "360", Arabic: "280", CJK: "240" });
});

test("a combining accent adds nothing to its letter, as the face draws it", () => {
  expect(runWidth(metrics.link, "Café")).toBeCloseTo(runWidth(metrics.link, "Cafe"), 9);
});

test("the steps the file folds at are the ones the page's stylesheet gives data-fold, each with its rule", () => {
  const css = readFileSync(join(repoRoot, "cms", "app", "assets", "stylesheets", "site.css"), "utf8");
  const rows = [...css.matchAll(/@container menu \(width < (\d+)px\) \{ \.w-menu\[data-fold="\1"\] \.w-menu-links \{ display: none; \}/g)].map((m) => Number(m[1]));
  const folds = [...css.matchAll(/\.w-menu\[data-fold="(\d+)"\] \.w-menu-fold \{ display: block; \}/g)].map((m) => Number(m[1]));
  const steps = Array.from({ length: 27 }, (_, i) => 80 + 40 * i);
  expect(metrics.fold.steps).toEqual(steps);
  expect(rows).toEqual(steps);
  expect(folds).toEqual(steps);
});

test("a run of floats adds up as Ruby's sum does, compensated, not as a loop of + does", () => {
  // 0.1 + 0.2 + 0.3 is 0.6000000000000001 added in turn; Ruby's
  // [0.1, 0.2, 0.3].sum is 0.6.
  expect([0.1, 0.2, 0.3].reduce((a, b) => a + b, 0)).not.toBe(0.6);
  expect(rubySum([0.1, 0.2, 0.3])).toBe(0.6);
  expect(rubySum([3, 1e100, -1e100])).toBe(3);
  expect(rubySum([])).toBe(0);
});
