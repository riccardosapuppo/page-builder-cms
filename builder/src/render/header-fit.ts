// Where a menu's links fold into Menu: the twin of the CMS's HeaderFit
// (cms/app/models/header_fit.rb), from the same letter widths
// (schema/header-metrics.json, measured once in Chromium by
// tools/header-metrics.ts). A published page runs no script and cannot
// measure itself, so the server adds up the width a menu's row of links
// needs, and names on the block the narrowest of site.css's fold steps at
// which the row fits; below it, in a block narrower than that, the links
// fold into Menu. The canvas draws the menu with the same site.css, so it
// adds them up the same way, and to the bit: Ruby adds a run of floats
// with the Kahan-Babuska compensated sum (Array#sum, Enumerable#sum), so
// this does too, and a sum on the edge of a step falls on the same side of
// it on both. header-fit.rails.test.ts holds the two to each other,
// generated menus through the server's own module.
import metricsFile from "../../../schema/header-metrics.json";

// A script the face lacks: the widest advance its letters were drawn with
// where the file was measured, for the characters of its ranges, and the
// widest advance of each letter that it lists.
export interface Script {
  name: string;
  ranges: ReadonlyArray<readonly [number, number]>;
  advance: number;
  letters: Readonly<Record<string, number>>;
}

export interface Place {
  // The place's font size, in CSS px.
  size: number;
  advances: Readonly<Record<string, number>>;
  scripts: readonly Script[];
  // The width of a character that neither the face nor a script has a
  // measure for.
  otherwise: number;
}

export interface Metrics {
  fold: { steps: readonly number[] };
  slack: number;
  link: Place & { gap: number };
}

export const METRICS = metricsFile as unknown as Metrics;

// Ruby's sum of floats: the Kahan-Babuska balancing compensated sum, as
// array.c and enum.c write it. Integers the file holds add exactly either
// way, so starting compensated from zero gives what Ruby gives.
export function rubySum(values: Iterable<number>): number {
  let f = 0;
  let c = 0;
  for (const x of values) {
    const t = f + x;
    if (Math.abs(f) >= Math.abs(x)) c += (f - t) + x;
    else c += (x - t) + f;
    f = t;
  }
  return f + c;
}

// What one character counts: its own advance in the face; else, in a
// script the file measured, its own width if the script lists its
// letters, and the script's widest letter if not; else the place's
// `otherwise`.
export function advanceOf(place: Place, ch: string): number {
  if (Object.hasOwn(place.advances, ch)) return place.advances[ch]!;
  const point = ch.codePointAt(0)!;
  const script = place.scripts.find((s) => s.ranges.some(([from, to]) => point >= from && point <= to));
  if (!script) return place.otherwise;
  return Object.hasOwn(script.letters, ch) ? script.letters[ch]! : script.advance;
}

// A run of text in a link, by code point, with the file's slack.
export function runWidth(place: Place, text: string, metrics: Metrics = METRICS): number {
  const widths = function* () {
    for (const ch of text) yield advanceOf(place, ch);
  };
  return rubySum(widths()) * (1 + metrics.slack);
}

// The width of a menu's row: every label, and the gap between two links.
export function widthNeeded(labels: readonly string[], metrics: Metrics = METRICS): number {
  const link = metrics.link;
  return rubySum(labels.map((label) => runWidth(link, label, metrics))) + link.gap * (labels.length - 1);
}

// data-fold for a menu whose links have these labels: the step below which
// they fold, "all" for a row wider than the widest step, or null for a menu
// with no link, which has nothing to fold.
export function menuFold(labels: readonly string[], metrics: Metrics = METRICS): string | null {
  if (labels.length === 0) return null;
  const needed = widthNeeded(labels, metrics);
  const step = metrics.fold.steps.find((width) => needed <= width);
  return step === undefined ? "all" : String(step);
}
