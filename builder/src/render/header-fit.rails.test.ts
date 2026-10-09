// The editor's fold of the header (./header-fit.ts) beside the server's own
// HeaderFit (cms/app/models/header_fit.rb), on the same generated headers:
// names, links and buttons in the face's letters and out of it (other
// scripts, emoji, combining accents), of every length and count the sum
// meets, valid or not, since HeaderFit adds up whatever it is given. Each
// side's width is compared to the bit, and its data-fold as a string: the
// canvas draws the header the published page draws only if both fold it
// at the same width. Ruby runs ../../test/ruby/header_fit.rb with the CMS's
// gems, loading the application as the CMS does; nothing of the CMS the
// project starts.
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
import metrics from "../../../schema/header-metrics.json";
import { headerFold, widthNeeded, type HeaderWords } from "./header-fit.ts";

const SEED = 20261009;

// The face's own letters, and some it does not have.
const inFace = Object.keys(metrics.link.advances);
const outOfFace = ["日", "本", "語", "\u{1F30A}", "\u{1F3CA}", "Ω", "ﬁ", "́", "‍", "ئ"];
const word = (most: number) => fc.array(fc.oneof({ weight: 9, arbitrary: fc.constantFrom(...inFace) }, { weight: 1, arbitrary: fc.constantFrom(...outOfFace) }), { maxLength: most }).map((letters) => letters.join(""));
const link = fc.record({ label: word(30), href: fc.constant("/") });
const header: fc.Arbitrary<HeaderWords> = fc.record({ name: word(40), menu: fc.array(link, { maxLength: 9 }), action: fc.option(link, { nil: null }) });

// A double's bits, big-endian, as Ruby's pack("G") writes them.
const bits = (x: number): string => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return [...new Uint8Array(view.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// The fault this comparison is there to catch: the same sums added in turn
// with +, as JavaScript would add them, not compensated as Ruby does.
function addedInTurn(site: HeaderWords): number {
  type Place = { advances: Record<string, number>; otherwise: number };
  const run = (place: Place, text: string) => [...text].reduce((sum, ch) => sum + (Object.hasOwn(place.advances, ch) ? place.advances[ch]! : place.otherwise), 0) * (1 + metrics.slack);
  const m = metrics;
  const brand = m.brand.fixed + run(m.brand, site.name) + m.brand.after;
  const menu = site.menu.reduce((sum, l) => sum + run(m.link, l.label), 0) + m.link.gap * (site.menu.length - 1) + m.link.after;
  const button = site.action ? m.nav.gap + m.button.fixed + run(m.button, site.action.label) : 0;
  return 2 * m.page.padX + brand + menu + button;
}

const work = mkdtempSync(join(tmpdir(), "header-fit-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

test("the header folds at the width the server's HeaderFit names, its sum the same to the bit", { timeout: 180_000 }, () => {
  const headers = fc.sample(header, { seed: SEED, numRuns: 4000 });
  writeFileSync(join(work, "in.json"), JSON.stringify({ headers }));
  const ruby = spawnSync("ruby", [join(builderRoot, "test", "ruby", "header_fit.rb"), join(work, "in.json"), join(work, "out.json")], {
    cwd: join(repoRoot, "cms"),
    env: { ...process.env, BUNDLE_GEMFILE: join(repoRoot, "cms", "Gemfile") },
    encoding: "utf8",
  });
  expect(ruby.status, ruby.stderr).toBe(0);
  const server = JSON.parse(readFileSync(join(work, "out.json"), "utf8")) as Array<{ needed: number; bits: string; fold: string | null }>;
  expect(server).toHaveLength(headers.length);

  // The headers as the server read them back from JSON, so both sides see
  // the same input.
  const read = JSON.parse(JSON.stringify(headers)) as HeaderWords[];
  const differ = read.flatMap((site, index) => {
    const theirs = server[index]!;
    const ours = { bits: bits(widthNeeded(site)), fold: headerFold(site) };
    return ours.bits === theirs.bits && ours.fold === theirs.fold ? [] : [{ site, editor: { ...ours, needed: widthNeeded(site) }, server: theirs }];
  });
  expect(differ.slice(0, 3)).toEqual([]);

  // Some of every answer, so the comparison meets each.
  const folds = new Set(server.map((s) => s.fold));
  for (const fold of [null, "880", "960", "1040", "1120", "1200", "1248", "all"]) expect(folds.has(fold), String(fold)).toBe(true);
  // The sum added in turn differs from the server's in its last bits on a
  // good share of these headers: so a twin that did that would be seen.
  const inTurn = read.filter((site, index) => bits(addedInTurn(site)) !== server[index]!.bits).length;
  expect(inTurn).toBeGreaterThan(100);
  console.log(`header fit: ${read.length} headers, the same width to the bit and the same fold as the server's; added in turn, ${inTurn} would differ`);
});
