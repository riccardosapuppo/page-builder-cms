// Where the header's links fold into Menu: the twin of the CMS's HeaderFit
// (cms/app/models/header_fit.rb), from the same letter widths
// (schema/header-metrics.json, measured once in Chromium by
// tools/header-metrics.ts). A published page runs no script and cannot
// measure itself, so the server adds up the width its bar needs, brand,
// links and button, and names on the header the narrowest of site.css's
// data-fold widths at which they fit; below it the links fold into Menu.
// The canvas draws the header with the same site.css, so it adds them up
// the same way, and to the bit: Ruby adds a run of floats with the
// Kahan-Babuska compensated sum (Array#sum, Enumerable#sum), so this does
// too, and a sum on the edge of a step falls on the same side of it on
// both. header-fit.rails.test.ts holds the two to each other, generated
// sites through the server's own module.
import metricsFile from "../../../schema/header-metrics.json";

// The parts of a header the sum reads (theme.tsx's Site has them).
export interface HeaderWords {
  name: string;
  menu: ReadonlyArray<{ label: string }>;
  action: { label: string } | null;
}

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
  fold: { breakpoint: number; steps: readonly number[]; widest: number };
  slack: number;
  page: { padX: number };
  brand: Place & { fixed: number; after: number };
  link: Place & { gap: number; after: number };
  nav: { gap: number };
  button: Place & { fixed: number };
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

// What one character counts in a place: its own advance in the face; else,
// in a script the file measured, its own width if the script lists its
// letters, and the script's widest letter if not; else the place's
// `otherwise`.
export function advanceOf(place: Place, ch: string): number {
  if (Object.hasOwn(place.advances, ch)) return place.advances[ch]!;
  const point = ch.codePointAt(0)!;
  const script = place.scripts.find((s) => s.ranges.some(([from, to]) => point >= from && point <= to));
  if (!script) return place.otherwise;
  return Object.hasOwn(script.letters, ch) ? script.letters[ch]! : script.advance;
}

// A run of text in one of the header's places, by code point, with the
// file's slack.
export function runWidth(place: Place, text: string, metrics: Metrics = METRICS): number {
  const widths = function* () {
    for (const ch of text) yield advanceOf(place, ch);
  };
  return rubySum(widths()) * (1 + metrics.slack);
}

// The width of the page at which the bar holds the brand, every link and
// the button on one row, with the page's padding on both sides.
export function widthNeeded(site: HeaderWords, metrics: Metrics = METRICS): number {
  const m = metrics;
  const links = site.menu;
  const brand = m.brand.fixed + runWidth(m.brand, site.name, m) + m.brand.after;
  const menu = rubySum(links.map((link) => runWidth(m.link, link.label, m))) + m.link.gap * (links.length - 1) + m.link.after;
  const button = site.action ? m.nav.gap + m.button.fixed + runWidth(m.button, site.action.label, m) : 0;
  return 2 * m.page.padX + brand + menu + button;
}

// data-fold for the header of site: the step below which its links fold,
// "all" for a menu wider than the widest bar, or null for the design's
// own fold (a header that fits the bar from its breakpoint up, or one
// with no links).
export function headerFold(site: HeaderWords, metrics: Metrics = METRICS): string | null {
  if (site.menu.length === 0) return null;
  const needed = widthNeeded(site, metrics);
  const fold = metrics.fold;
  if (needed <= fold.breakpoint) return null;
  const step = fold.steps.find((width) => needed <= Math.min(width, fold.widest));
  return step === undefined ? "all" : String(step);
}
