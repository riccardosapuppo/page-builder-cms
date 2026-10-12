// The editor's fold of a menu (./header-fit.ts) beside the server's own
// HeaderFit (cms/app/models/header_fit.rb), on the same generated menus:
// labels in the face's letters and out of it (other scripts, emoji,
// combining accents), of every length and count the sum meets, valid or
// not, since HeaderFit adds up whatever it is given, and five short menus
// in Hebrew, Greek, Cyrillic, Arabic and Japanese, which must fold no later
// than the design's four links. Each side's width is compared to the bit,
// and its data-fold as a string: the canvas draws the menu the published
// page draws only if both fold it at the same step. Ruby runs
// ../../test/ruby/header_fit.rb with the CMS's gems, loading the
// application as the CMS does; nothing of the CMS the project starts.
//
// In the "rails" project for its Ruby.
// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, expect, test } from "vitest";
import { builderRoot, repoRoot } from "../../build/paths.ts";
import { advanceOf, menuFold, METRICS as metrics, widthNeeded } from "./header-fit.ts";

const SEED = 20261012;

// The face's own letters, and some it does not have: letters of the scripts
// the file measured (those it lists, the ends of each range, a code point in
// one that no letter lists, and two just outside Greek's), and what nothing
// measured (emoji, a ligature, an arrow, a combining mark).
const inFace = Object.keys(metrics.link.advances);
const outOfFace = [
  "の", "한", "！", "　", "、", "鿿", "｠",
  "ά", "Ά", "ώ", "΋", "΅", "Ϗ",
  "Щ", "ж", "Ґ", "Ѐ", "џ",
  "ש", "מ", "א", "ת",
  "ض", "ء", "ي", "٩", "ۓ", "۔", "\u{FDFD}", "→",
  "日", "本", "語", "\u{1F30A}", "\u{1F3CA}", "Ω", "ﬁ", "́", "‍", "ئ"];
// Lengths drawn across the whole range given ("max"), not kept small as
// fast-check keeps them by default: the rows must reach the widest step.
const word = (most: number) => fc.array(fc.oneof({ weight: 9, arbitrary: fc.constantFrom(...inFace) }, { weight: 1, arbitrary: fc.constantFrom(...outOfFace) }), { maxLength: most, size: "max" }).map((letters) => letters.join(""));
// Up to a menu's twelve links, mostly short, as a person writes them, so
// the rows land on every step and past the widest.
const menu: fc.Arbitrary<string[]> = fc.oneof(
  { weight: 3, arbitrary: fc.array(word(12), { maxLength: 12, size: "max" }) },
  { weight: 1, arbitrary: fc.array(word(40), { maxLength: 12, size: "max" }) },
);

// A double's bits, big-endian, as Ruby's pack("G") writes them.
const bits = (x: number): string => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return [...new Uint8Array(view.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// The fault this comparison is there to catch: the same sums added in turn
// with +, as JavaScript would add them, not compensated as Ruby does.
function addedInTurn(labels: readonly string[]): number {
  const link = metrics.link;
  const run = (text: string) => [...text].reduce((sum, ch) => sum + advanceOf(link, ch), 0) * (1 + metrics.slack);
  return labels.reduce((sum, label) => sum + run(label), 0) + link.gap * (labels.length - 1);
}

const work = mkdtempSync(join(tmpdir(), "header-fit-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

// Short menus as a person writes them in each script the file measured,
// which go through the server beside the generated ones: they fold no later
// than the design's four links (360). Each letter counted at 1.5 em, the
// Greek and Cyrillic ones would need 720 px.
const SHORT: Record<string, { labels: string[]; fold: string }> = {
  Hebrew: { labels: ["שחייה", "גלריה", "עלינו", "שאלות"], fold: "240" },
  Greek: { labels: ["Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"], fold: "360" },
  Cyrillic: { labels: ["Заплывы", "Галерея", "Встречи", "Вопросы"], fold: "360" },
  Arabic: { labels: ["السباحة", "المعرض", "لقاء", "أسئلة"], fold: "280" },
  CJK: { labels: ["泳ぎ方", "写真", "会合", "質問"], fold: "240" },
};

test("a menu folds at the step the server's HeaderFit names, its sum the same to the bit", { timeout: 180_000 }, () => {
  const menus = [...Object.values(SHORT).map((short) => short.labels), ...fc.sample(menu, { seed: SEED, numRuns: 4000 })];
  writeFileSync(join(work, "in.json"), JSON.stringify({ menus }));
  const ruby = spawnSync("ruby", [join(builderRoot, "test", "ruby", "header_fit.rb"), join(work, "in.json"), join(work, "out.json")], {
    cwd: join(repoRoot, "cms"),
    env: { ...process.env, BUNDLE_GEMFILE: join(repoRoot, "cms", "Gemfile") },
    encoding: "utf8",
  });
  expect(ruby.status, ruby.stderr).toBe(0);
  const server = JSON.parse(readFileSync(join(work, "out.json"), "utf8")) as Array<{ needed: number; bits: string; fold: string | null }>;
  expect(server).toHaveLength(menus.length);

  // The menus as the server read them back from JSON, so both sides see
  // the same input.
  const read = JSON.parse(JSON.stringify(menus)) as string[][];
  const differ = read.flatMap((labels, index) => {
    const theirs = server[index]!;
    const ours = { bits: bits(widthNeeded(labels)), fold: menuFold(labels) };
    return ours.bits === theirs.bits && ours.fold === theirs.fold ? [] : [{ labels, editor: { ...ours, needed: widthNeeded(labels) }, server: theirs }];
  });
  expect(differ.slice(0, 3)).toEqual([]);

  // The short menus in each script fold where the design's four links do or
  // sooner, on the server's word and the editor's.
  Object.entries(SHORT).forEach(([script, short], index) => {
    expect(server[index]!.fold, `${script}, the server's`).toBe(short.fold);
    expect(menuFold(read[index]!), `${script}, the editor's`).toBe(short.fold);
  });

  // The generated menus reach each script the file measured, so the lookup
  // of a letter in it is compared and not left to the short ones.
  const holds = (labels: readonly string[], from: number, to: number) => labels.some((text) => [...text].some((ch) => ch.codePointAt(0)! >= from && ch.codePointAt(0)! <= to));
  for (const script of metrics.link.scripts) {
    const reached = read.slice(Object.keys(SHORT).length).filter((labels) => script.ranges.some(([from, to]) => holds(labels, from, to))).length;
    expect(reached, `generated menus with a letter of ${script.name}`).toBeGreaterThan(50);
  }

  // Some of every answer, so the comparison meets each: no link, the
  // narrowest step, beyond the widest, and most steps between.
  const folds = new Set(server.map((s) => s.fold));
  for (const fold of [null, "80", "all"]) expect(folds.has(fold), String(fold)).toBe(true);
  const met = metrics.fold.steps.filter((step) => folds.has(String(step)));
  expect(met.length, `the steps met: ${met.join(", ")}`).toBeGreaterThanOrEqual(20);
  // The sum added in turn differs from the server's in its last bits on a
  // good share of these menus: so a twin that did that would be seen.
  const inTurn = read.filter((labels, index) => labels.length > 0 && bits(addedInTurn(labels)) !== server[index]!.bits).length;
  expect(inTurn).toBeGreaterThan(100);
  console.log(`header fit: ${read.length} menus, the same width to the bit and the same fold as the server's; added in turn, ${inTurn} would differ`);
});
