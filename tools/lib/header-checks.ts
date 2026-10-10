// The header the editor sets, as a visitor's browser draws it: headless
// Chromium (Playwright 1.62.1, from the root package) on the published
// home page of a running CMS, for headers set through PUT /api/site.
//
// For each header, at every width that matters (the phones, the tablet,
// the design's 800 and each width site.css folds a long menu below, the
// widest bar):
// - nothing leaves the page: no sideways scroll, Menu inside the window;
// - the links are shown exactly where the header's data-fold says (from
//   800 up without one, from its width up with one, nowhere with "all"),
//   and Menu where they are not;
// - where they are shown, the menu does not wrap the bar: the links on
//   one line, in one row with the brand, the bar the design's 80 px;
// - and there the bar keeps its right padding whole, which gives way only
//   when the words are drawn wider than the server counted them: the
//   sharpest test of the sum (a menu counted 7 px narrower than drawn
//   still keeps to one row, the padding giving way).
// The row is held for the face's own letters on every machine, and the
// padding where tools/header-metrics.ts --check finds the face drawn as
// the file holds it. Letters the face lacks are drawn by the machine's own
// fonts, and the file holds what the fonts of the machine that measured
// drew: for them both are held where --check finds this machine's fonts
// to be those, and not elsewhere. A character the file does not measure,
// counted at 1.5 em, is held to the first two only.
// The design's own header must have no data-fold and one row at 375, and
// a fifth link must fold below 880, so the server's sum is held to the
// steps; at the limits, in words of average width, the name, the button's
// label and each link of Menu's sheet must sit on one line at 375, as
// $defs/site of the schema says they do.
import { chromium, type Page } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export type Check = (ok: boolean, what: string, detail?: string) => void;

export interface SiteValues {
  name: string;
  menu: Array<{ label: string; href: string }>;
  action: { label: string; href: string } | null;
  footer: { lead: string; text: string };
}

const FOOTER = { lead: "Slack Water swimming club.", text: "Tide times are a guide, not a promise." };
const links = (...labels: string[]) => labels.map((label, k) => ({ label, href: `/#part-${k + 1}` }));
const DESIGN: SiteValues = {
  name: "Slack Water",
  menu: [{ label: "Swims", href: "/#swims" }, { label: "Gallery", href: "/#gallery" }, { label: "Meet us", href: "/#meet" }, { label: "Questions", href: "/#questions" }],
  action: { label: "Join", href: "/#join" },
  footer: FOOTER,
};

export interface HeaderCase {
  label: string;
  site: SiteValues;
  // The data-fold the server must name, when the case pins it.
  fold?: string | null;
  // Whether the lengths' promise at 375 px applies: words of average width.
  average?: boolean;
}

export const HEADER_CASES: HeaderCase[] = [
  { label: "the design's header", site: DESIGN, fold: null },
  { label: "a fifth link", site: { ...DESIGN, menu: [...DESIGN.menu, { label: "Contact", href: "/#contact" }] }, fold: "880" },
  {
    label: "every length at its limit, in words of average width",
    site: {
      name: "The Sea Thrift Swimming Club",
      menu: links("Timetable for the winter", "Membership and our fees", "Open water safety notes", "Coaches and their swims", "Meet us on the slipway", "Questions people ask us", "Tide tables for the bay", "Galleries of past swims"),
      action: { label: "Join the club now!", href: "/#join" },
      footer: { lead: "The Sea Thrift Swimming Club, open water swimming in all seasons.", text: "Tide times are a guide, not a promise: check the board on the slipway, ask a coach, and never swim alone in the bay." },
    },
    fold: "all",
    average: true,
  },
  {
    label: "every length at its limit, in the widest letter",
    site: { name: "W".repeat(28), menu: links("W".repeat(24), "W".repeat(24)), action: { label: "W".repeat(18), href: "/#join" }, footer: FOOTER },
    fold: "all",
  },
  { label: "three links in another script", site: { ...DESIGN, name: "潮の会", menu: links("日本語の案内", "مرحبا بكم", "Ελληνικά") } },
  // Short headers as a person writes them in Hebrew and in Greek: the links
  // stay in the bar from the design's 800 up, where they were folded below
  // 1200 and at every width when every letter outside the face counted 1.5 em.
  {
    label: "a short header in Hebrew",
    site: { ...DESIGN, name: "מים שקטים", menu: links("שחייה", "גלריה", "עלינו", "שאלות"), action: { label: "הצטרפו", href: "/#join" } },
    fold: null,
  },
  {
    label: "a short header in Greek",
    site: { ...DESIGN, name: "Ήρεμα νερά", menu: links("Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"), action: { label: "Γραφτείτε", href: "/#join" } },
    fold: null,
  },
  // Arabic words whose heh and meem join the letters beside them, drawn
  // wider than alone: counted at their widest joined form the menu folds
  // below 880. Counted alone, as before 10 October, it was 799.39 px wide,
  // no fold, and the bar ran 7 px into its right padding at 800.
  { label: "seven Arabic links whose letters join", site: { ...DESIGN, menu: links("مهرجان", "مهارات", "جمهور", "مهم", "المهمة", "وجههم", "معهم") }, fold: "880" },
  // A letter the file counts at 1.5 em and a font draws wider (three of the
  // Arabic bismillah ligature, about 90 px wide where 22.5 is counted): the
  // bar may take two rows from the width the sum says it fits at, but it
  // stays inside the page.
  { label: "a link of a letter drawn wider than counted", site: { ...DESIGN, menu: [...DESIGN.menu, { label: "\u{FDFD}\u{FDFD}\u{FDFD}", href: "/#contact" }] } },
  { label: "no links and no button", site: { ...DESIGN, menu: [], action: null }, fold: null },
];

// The letters of a header the face lacks, by what the file does with
// them: the scripts it measured that they belong to, and whether any is a
// character it does not measure (counted at 1.5 em).
interface Metrics {
  link: { advances: Record<string, number>; scripts: Array<{ name: string; ranges: Array<[number, number]> }> };
}
export function lettersOutside(site: SiteValues, metrics: Metrics): { scripts: string[]; unmeasured: boolean } {
  const scripts = new Set<string>();
  let unmeasured = false;
  for (const text of [site.name, ...site.menu.map((link) => link.label), site.action?.label ?? ""]) {
    for (const ch of text) {
      if (metrics.link.advances[ch] !== undefined) continue;
      const point = ch.codePointAt(0)!;
      const script = metrics.link.scripts.find((s) => s.ranges.some(([from, to]) => point >= from && point <= to));
      if (script) scripts.add(script.name);
      else unmeasured = true;
    }
  }
  return { scripts: [...scripts], unmeasured };
}

// What tools/header-metrics.ts --check says of the file on this machine:
// "file", it is what this machine draws (exit 0); "face", the face's own
// letters, the spacing and the folds are, but the scripts named in
// `others` are drawn here with other fonts than it was measured with
// (exit 2); "neither", it is not (exit 1: stale, or the sum narrower than
// a word drawn whole), and nothing is taken from it.
export interface FontsHere {
  verdict: "file" | "face" | "neither";
  others: string[];
  line: string;
}
export async function fontsHere(scriptNames: readonly string[]): Promise<FontsHere> {
  const child = spawn(process.execPath, [join(root, "tools", "header-metrics.ts"), "--check"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  const line = output.split(/\r?\n/).find((l) => l.startsWith("header-metrics.json")) ?? output.trim().split(/\r?\n/).slice(-1)[0] ?? "";
  if (code === 0) return { verdict: "file", others: [], line };
  if (code === 2) {
    const named = /could not be compared here for the letters of ([^:]+):/.exec(line)?.[1]?.split(", ") ?? [];
    return { verdict: "face", others: named.length > 0 && named.every((name) => scriptNames.includes(name)) ? named : [...scriptNames], line };
  }
  return { verdict: "neither", others: [...scriptNames], line };
}

// The widths: phones, the tablet, the design's fold, each data-fold width
// and the pixel below it, and the widest bar.
export function headerWidths(steps: readonly number[]): number[] {
  const widths = new Set([320, 340, 360, 375, 390, 560, 768, 799, 800, 1280, 1440]);
  for (const step of steps) {
    widths.add(step - 1);
    widths.add(step);
  }
  return [...widths].sort((a, b) => a - b);
}

interface Drawn {
  fold: string | null;
  scroll: number;
  client: number;
  header: number;
  linksShown: boolean;
  menuShown: boolean;
  menuRight: number;
  linkRows: number;
  rowLines: number;
  // The page's padding, and what is left of it right of the nav.
  padX: number;
  padRight: number;
  brandLines: number;
  buttonLines: number;
  sheetLines: number[];
}

// What the page draws, read in the page.
async function drawn(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const lines = (element: Element | null): number => {
      if (!element) return 0;
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    };
    const header = document.querySelector(".sw-header")!;
    const shown = (selector: string) => {
      const element = header.querySelector(selector);
      return element !== null && getComputedStyle(element).display !== "none";
    };
    const tops = (selector: string) => new Set([...header.querySelectorAll(selector)].map((e) => Math.round(e.getBoundingClientRect().top)));
    const brand = header.querySelector(".sw-brand")!.getBoundingClientRect();
    const nav = header.querySelector(".sw-nav")!.getBoundingClientRect();
    // The row's right padding is the item after the nav (::after), which
    // grows to the page's padding and gives way before the row wraps.
    const row = header.querySelector(".sw-header-row")!;
    const details = header.querySelector("details");
    if (details) details.open = true;
    const sheetLines = [...header.querySelectorAll(".sw-menu-sheet a")].map((a) => lines(a));
    if (details) details.open = false;
    return {
      fold: header.getAttribute("data-fold"),
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      header: header.getBoundingClientRect().height,
      linksShown: shown(".sw-nav-links"),
      menuShown: shown(".sw-menu"),
      menuRight: header.querySelector(".sw-menu-button")?.getBoundingClientRect().right ?? 0,
      linkRows: tops(".sw-nav-links a").size,
      // The brand and the nav side by side: their boxes share a row.
      rowLines: nav.top >= brand.bottom ? 2 : 1,
      padX: Number.parseFloat(getComputedStyle(row).paddingLeft) || 0,
      padRight: row.getBoundingClientRect().right - nav.right,
      brandLines: lines(header.querySelector(".sw-brand > span")),
      buttonLines: lines(header.querySelector(".sw-btn-small")),
      sheetLines,
    };
  });
}

export async function headerChecks(base: string, steps: readonly number[], check: Check, setSite: (site: SiteValues) => Promise<void>): Promise<void> {
  const origin = new URL(base).origin;
  const metrics = JSON.parse(readFileSync(join(root, "schema", "header-metrics.json"), "utf8")) as Metrics;
  // Whether this machine draws the letters as the file counts them.
  const here = await fontsHere(metrics.link.scripts.map((s) => s.name));
  console.log(`the header's letters on this machine, as tools/header-metrics.ts --check finds them: ${here.line}`);
  const browser = await chromium.launch();
  try {
    for (const c of HEADER_CASES) {
      // What is held of this header here: the row where its letters are
      // counted as this machine draws them, the padding too where the
      // face is.
      const outside = lettersOutside(c.site, metrics);
      const drawnAsCounted = !outside.unmeasured && outside.scripts.every((name) => !here.others.includes(name));
      const holdRow = !outside.unmeasured && (outside.scripts.length === 0 || drawnAsCounted);
      const holdPadding = here.verdict !== "neither" && drawnAsCounted;
      await setSite(c.site);
      const problems: string[] = [];
      const folds = new Set<string>();
      let shown = 0;
      for (const width of headerWidths(steps)) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
        await page.goto(`${origin}/`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const d = await drawn(page);
        await page.close();
        folds.add(String(d.fold));
        if (d.linksShown) shown += 1;
        const at = `at ${width}`;
        if (d.scroll > d.client) problems.push(`${at}: the page scrolls sideways (${d.scroll} > ${d.client})`);
        if (d.menuShown && d.menuRight > d.client) problems.push(`${at}: Menu ends at ${d.menuRight}, outside the window`);
        if (c.site.menu.length === 0) {
          // No links: nothing to fold, and no Menu to open.
          if (d.menuShown || d.linkRows !== 0) problems.push(`${at}: a header with no links draws ${d.linkRows} link(s)${d.menuShown ? " and Menu" : ""}`);
        } else {
          const foldsBelow = d.fold === "all" ? Infinity : Math.max(800, d.fold === null ? 0 : Number(d.fold));
          const expectLinks = width >= foldsBelow;
          if (d.linksShown !== expectLinks) problems.push(`${at}: the links are ${d.linksShown ? "shown" : "folded"} under data-fold ${d.fold}`);
          if (d.menuShown === d.linksShown) problems.push(`${at}: Menu is ${d.menuShown ? "shown with" : "hidden with"} the links`);
          if (d.linksShown && holdRow && (d.linkRows !== 1 || d.rowLines !== 1 || Math.round(d.header) !== 80)) {
            problems.push(`${at}: the menu wraps the bar (links on ${d.linkRows} line(s), brand and links on ${d.rowLines} row(s), the bar ${d.header} px)`);
          }
          // A layout unit (1/64 px) of rounding allowed.
          if (d.linksShown && holdPadding && d.padRight < d.padX - 1 / 64) {
            problems.push(`${at}: the bar runs ${(d.padX - d.padRight).toFixed(2)} px into its right padding (${d.padRight.toFixed(2)} of ${d.padX} px left): its words are drawn wider than the server counted them`);
          }
        }
        if (c.fold === null && width === 375 && (d.rowLines !== 1 || Math.round(d.header) !== 64)) problems.push(`${at}: the design's header is not one 64 px row (${d.rowLines} row(s), ${d.header} px)`);
        if (c.average && width === 375) {
          if (d.brandLines !== 1) problems.push(`${at}: the name runs onto ${d.brandLines} lines`);
          if (d.buttonLines !== 1) problems.push(`${at}: the button's label runs onto ${d.buttonLines} lines`);
          const long = d.sheetLines.filter((n) => n !== 1).length;
          if (d.sheetLines.length !== c.site.menu.length || long > 0) problems.push(`${at}: ${long} of Menu's ${d.sheetLines.length} links run onto two lines or more`);
        }
      }
      if (c.fold !== undefined && (folds.size !== 1 || !folds.has(String(c.fold)))) problems.push(`data-fold is ${[...folds].join(" and ")}, not ${c.fold}`);
      const stale = "header-metrics.json is not what this machine draws";
      const scripts = outside.scripts.join(", ");
      const held = (() => {
        if (c.site.menu.length === 0) return " (it has none, and no Menu)";
        if (shown === 0) return " (they show at none)";
        if (holdRow) {
          const padding = holdPadding ? ", the right padding whole" : ` (the padding not held: ${stale})`;
          return `, on one row at the ${shown} widths they show${padding}${outside.scripts.length > 0 ? ` (letters of ${scripts}, drawn here with the fonts the file was measured with)` : ""}`;
        }
        if (outside.unmeasured) return " (a character the file does not measure, counted at 1.5 em: its row is not held)";
        return ` (letters of ${scripts}: ${here.verdict === "neither" ? stale : "this machine draws them with other fonts than the file was measured with"}, so their row is not held here)`;
      })();
      check(problems.length === 0, `the header, ${c.label}: inside the page at ${headerWidths(steps).length} widths, the links where data-fold (${[...folds].join()}) says${held}`, problems.slice(0, 6).join("; "));
    }
  } finally {
    await browser.close();
  }
}
