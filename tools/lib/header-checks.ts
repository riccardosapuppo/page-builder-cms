// The site's header as a visitor's browser draws it: headless Chromium
// (Playwright 1.62.1, from the root package) on the published home page of
// a running CMS, for headers published through the API, each the header's
// starter (cms/config/parts/header.json) with a case's words: its logo's
// name, its menu's links, its button's label, or no menu or no button.
//
// For each header, at every width that matters (the phones, the tablet,
// the desktop widths, and the windows around the one at which the menu
// block is as wide as the step its data-fold names):
// - nothing leaves the page: no sideways scroll, Menu inside the window;
// - the header holds one row, its logo, menu and button side by side, as
//   its section never stacks (stack: never);
// - the links are shown exactly where the menu's data-fold says: where the
//   block is as wide as the step it names or wider, never with "all", and
//   Menu where they are not;
// - where they are shown, they stand on one line inside the block. Just
//   past the step, the block is no wider than the row the server counted,
//   less what its step rounds up: there a row drawn wider than counted
//   wraps, the sharpest test of the sum.
// The line is held for the face's own letters on every machine, and just
// past the step where tools/header-metrics.ts --check finds the face drawn
// as the file holds it. Letters the face lacks are drawn by the machine's
// own fonts, and the file holds what the fonts of the machine that
// measured drew: for them both are held where --check finds this
// machine's fonts to be those, and not elsewhere. A character the file
// does not measure, counted at 1.5 em, is held to the first two checks
// only. What the verdict holds back is said in the check's RESULT line,
// not only in each header's; and a file that is not what a machine with
// the fonts it was measured with draws (stale, edited, or its sum narrower
// than a word) fails here. The design's four links must fold below 360 and
// the header hold one 64 px row at 375, and a fifth link must move the
// step to 440, so the server's sum is held to the steps; at the limits, in
// words of average width, Menu's sheet must stay inside the window at 375.
import { chromium, type Browser, type Page } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readVerdict, type FontsHere } from "./header-metrics-verdict.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export type Check = (ok: boolean, what: string, detail?: string) => void;

// A header's words: the logo's name ("" for the mark alone), the menu's
// links (none: no menu), the button (null: none).
export interface HeaderWords {
  name: string;
  links: Array<{ label: string; href: string }>;
  button: { label: string; href: string } | null;
}

type Block = { id: string; type: string; props: Record<string, unknown>; children: Block[]; style: unknown };
type HeaderDocument = { schemaVersion: number; title: string; sections: Block[] };

const starter = (): HeaderDocument => JSON.parse(readFileSync(join(root, "cms", "config", "parts", "header.json"), "utf8")) as HeaderDocument;

// The starter with the words of a header in its logo, menu and button.
export function headerDocument(words: HeaderWords, from: HeaderDocument = starter()): HeaderDocument {
  const document = structuredClone(from);
  for (const section of document.sections) {
    for (const column of section.children) {
      column.children = column.children.flatMap((block): Block[] => {
        if (block.type === "logo") return [{ ...block, props: words.name === "" ? {} : { name: words.name } }];
        if (block.type === "menu") return words.links.length === 0 ? [] : [{ ...block, props: { ...block.props, items: words.links } }];
        if (block.type === "button") return words.button ? [{ ...block, props: { label: words.button.label, href: words.button.href } }] : [];
        return [block];
      });
    }
  }
  return document;
}

const links = (...labels: string[]) => labels.map((label, k) => ({ label, href: `/#part-${k + 1}` }));
const DESIGN: HeaderWords = {
  name: "Slack Water",
  links: [{ label: "Swims", href: "/#swims" }, { label: "Gallery", href: "/#gallery" }, { label: "Meet us", href: "/#meet" }, { label: "Questions", href: "/#questions" }],
  button: { label: "Join", href: "/#join" },
};

export interface HeaderCase {
  label: string;
  words: HeaderWords;
  // The data-fold the server must name, when the case pins it.
  fold?: string | null;
  // Whether the promise at 375 px of words of average width applies.
  average?: boolean;
}

export const HEADER_CASES: HeaderCase[] = [
  { label: "the design's header", words: DESIGN, fold: "360" },
  { label: "a fifth link", words: { ...DESIGN, links: [...DESIGN.links, { label: "Contact", href: "/#contact" }] }, fold: "440" },
  {
    label: "every length at its limit, in words of average width",
    words: {
      name: "The Sea Thrift Open Water Swimming Club",
      links: links(
        "Timetable for the winter and the summer", "Membership, our fees and what they cover", "Open water safety notes for every swim",
        "Coaches and the swims each of them leads", "Meet us on the slipway before the swim", "Questions people ask us about the club",
        "Tide tables for the bay and the harbour", "Galleries of the swims of the past years", "The kit to bring, and the kit we lend",
        "Our history, from the first swim of all", "Swimming with children in the summer", "How to reach the slipway, where to park",
      ),
      button: { label: "Join the Sea Thrift Open Water Swimming Club for a trial swim", href: "/#join" },
    },
    fold: "all",
    average: true,
  },
  {
    label: "every length at its limit, in the widest letter",
    words: { name: "W".repeat(40), links: links(...Array.from({ length: 12 }, () => "W".repeat(40))), button: { label: "W".repeat(80), href: "/#join" } },
    fold: "all",
  },
  { label: "three links in another script", words: { ...DESIGN, name: "潮の会", links: links("日本語の案内", "مرحبا بكم", "Ελληνικά") }, fold: "320" },
  // Short menus as a person writes them in Hebrew and in Greek: they fold
  // where the design's four links do or sooner, where they folded at every
  // width when every letter outside the face counted 1.5 em.
  {
    label: "a short menu in Hebrew",
    words: { name: "מים שקטים", links: links("שחייה", "גלריה", "עלינו", "שאלות"), button: { label: "הצטרפו", href: "/#join" } },
    fold: "240",
  },
  {
    label: "a short menu in Greek",
    words: { name: "Ήρεμα νερά", links: links("Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"), button: { label: "Γραφτείτε", href: "/#join" } },
    fold: "360",
  },
  // Arabic words whose heh and meem join the letters beside them, drawn
  // wider than alone: counted at their widest joined form.
  { label: "seven Arabic links whose letters join", words: { ...DESIGN, links: links("مهرجان", "مهارات", "جمهور", "مهم", "المهمة", "وجههم", "معهم") }, fold: "400" },
  // A letter the file counts at 1.5 em and a font draws wider (three of the
  // Arabic bismillah ligature, about 90 px wide where 22.5 is counted): the
  // links may wrap where the sum says they fit, but they stay inside the
  // page.
  { label: "a link of a letter drawn wider than counted", words: { ...DESIGN, links: [...DESIGN.links, { label: "\u{FDFD}\u{FDFD}\u{FDFD}", href: "/#contact" }] }, fold: "440" },
  { label: "no menu and no button", words: { ...DESIGN, links: [], button: null }, fold: null },
];

// The letters of a menu's links the face lacks, by what the file does with
// them: the scripts it measured that they belong to, and whether any is a
// character it does not measure (counted at 1.5 em). Only the links count:
// the server adds up their words alone, and the logo and the button stand
// in columns of their own.
interface Metrics {
  link: { advances: Record<string, number>; scripts: Array<{ name: string; ranges: Array<[number, number]> }> };
}
export function lettersOutside(words: HeaderWords, metrics: Metrics): { scripts: string[]; unmeasured: boolean } {
  const scripts = new Set<string>();
  let unmeasured = false;
  for (const text of words.links.map((link) => link.label)) {
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

// What tools/header-metrics.ts --check says of the file on this machine, by
// the verdict its last line gives (lib/header-metrics-verdict.ts).
export async function fontsHere(scriptNames: readonly string[]): Promise<FontsHere> {
  const child = spawn(process.execPath, [join(root, "tools", "header-metrics.ts"), "--check"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  return readVerdict(code, output, scriptNames);
}

// What is held of a menu here: its links on one line where its letters are
// counted as this machine draws them (the face's own on every machine), and
// so just past its step where, besides, the face is drawn as the file holds
// it. A file that is not what this machine draws, or no verdict, holds back
// every letter the face lacks and every step; a character the file does not
// measure is held to neither.
export function held(here: FontsHere, outside: { scripts: readonly string[]; unmeasured: boolean }): { row: boolean; step: boolean } {
  const trusted = here.verdict === "file" || here.verdict === "face";
  const drawnAsCounted = !outside.unmeasured && outside.scripts.every((name) => trusted && !here.others.includes(name));
  return { row: !outside.unmeasured && (outside.scripts.length === 0 || drawnAsCounted), step: trusted && drawnAsCounted };
}

// Whether the verdict is a failure of its own here: the file is not what
// this machine draws, though no script is drawn here with other fonts than
// it was measured with. Then the file is stale or edited, or its sum is
// narrower than a word drawn whole, on a machine whose fonts are those it
// was measured with. Where some are other fonts (another system, whose
// drawing of the face nothing shows to be the measuring machine's to the
// 1/64 px), or the tool gave no verdict, what is not held is said, and the
// check's fixtures (npm run check) fail a stale file where it was measured.
export function verdictFails(here: FontsHere): boolean {
  return here.verdict === "neither" && here.others.length === 0;
}

// Why the verdict holds back what it does, in a few words.
function heldBackBy(here: FontsHere): string {
  if (here.verdict === "face") return `this machine draws the letters of ${here.others.join(", ")} with other fonts than header-metrics.json was measured with`;
  if (here.verdict === "unknown") return "tools/header-metrics.ts --check gave no verdict here";
  return "header-metrics.json is not what this machine draws";
}

// What the verdict held back over the menus checked, against what a file
// drawn here as it holds would have held: null when nothing.
export function notHeldHere(here: FontsHere, menus: ReadonlyArray<{ links: number; outside: { scripts: readonly string[]; unmeasured: boolean } }>): string | null {
  const asFile: FontsHere = { verdict: "file", others: [], line: "" };
  let rows = 0;
  let steps = 0;
  for (const { links: count, outside } of menus) {
    if (count === 0) continue;
    const now = held(here, outside);
    const would = held(asFile, outside);
    if (would.row && !now.row) rows += 1;
    if (would.step && !now.step) steps += 1;
  }
  if (rows + steps === 0) return null;
  return `not held here, since ${heldBackBy(here)}: the line of the links of ${rows} menu(s), the line just past the step of ${steps}`;
}

// The windows every header is drawn in: phones, the tablet, the desktop.
export const HEADER_WIDTHS = [320, 340, 360, 375, 390, 560, 768, 799, 800, 1024, 1280, 1440] as const;

interface Drawn {
  fold: string | null;
  // The menu block's own width, the container its data-fold speaks of.
  menuWidth: number;
  scroll: number;
  client: number;
  header: number;
  // The logo, the menu and the button side by side.
  oneRow: boolean;
  linksShown: boolean;
  foldShown: boolean;
  menuRight: number;
  linkLines: number;
  linksRight: number;
  blockRight: number;
  // Menu's sheet, opened: inside the window.
  sheetInside: boolean;
}

// What the page draws, read in the page.
async function drawn(page: Page): Promise<Drawn> {
  return page.evaluate(() => {
    const header = document.querySelector(".sw-header")!;
    const menu = header.querySelector(".w-menu");
    const shown = (selector: string) => {
      const element = header.querySelector(selector);
      return element !== null && getComputedStyle(element).display !== "none";
    };
    const boxes = [...header.querySelectorAll(".w-logo, .w-menu, .w-button")].map((e) => e.getBoundingClientRect());
    const anchors = [...header.querySelectorAll(".w-menu-links a")].map((a) => a.getBoundingClientRect()).filter((box) => box.width > 0);
    const details = header.querySelector("details");
    if (details) details.open = true;
    const sheet = header.querySelector(".sw-menu-sheet")?.getBoundingClientRect();
    const sheetInside = !details || !sheet || (sheet.left >= -0.5 && sheet.right <= document.documentElement.clientWidth + 0.5);
    if (details) details.open = false;
    return {
      fold: menu?.getAttribute("data-fold") ?? null,
      menuWidth: menu?.getBoundingClientRect().width ?? 0,
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      header: header.getBoundingClientRect().height,
      oneRow: boxes.length === 0 || Math.max(...boxes.map((b) => b.top)) < Math.min(...boxes.map((b) => b.bottom)),
      linksShown: shown(".w-menu-links"),
      foldShown: shown(".w-menu-fold"),
      menuRight: header.querySelector(".sw-menu-button")?.getBoundingClientRect().right ?? 0,
      linkLines: new Set(anchors.map((box) => Math.round(box.top))).size,
      linksRight: Math.max(0, ...anchors.map((box) => box.right)),
      blockRight: menu?.getBoundingClientRect().right ?? 0,
      sheetInside,
    };
  });
}

async function drawnAt(browser: Browser, origin: string, width: number): Promise<Drawn> {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  try {
    await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
    await page.goto(`${origin}/`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await drawn(page);
  } finally {
    await page.close();
  }
}

// The windows around the one at which the menu block is as wide as its
// step: from the widest window, the block growing with the window as one
// where the page's layout does not change, each guess drawn and the next
// taken from what it drew, until it lands; none where no window puts the
// block there.
async function aroundTheStep(browser: Browser, origin: string, step: number): Promise<number[]> {
  let width = 1440;
  let d = await drawnAt(browser, origin, width);
  if (d.menuWidth < step) return [];
  for (let tries = 0; tries < 4; tries += 1) {
    const next = Math.floor(width - (d.menuWidth - step));
    if (next < 320) return [];
    if (next === width) break;
    width = next;
    d = await drawnAt(browser, origin, width);
  }
  return [width - 1, width, width + 1, width + 2];
}

// Checks the headers, and returns what the verdict held back here (null
// when nothing), for the check's RESULT line.
export async function headerChecks(base: string, check: Check, publishHeader: (words: HeaderWords) => Promise<void>): Promise<string | null> {
  const origin = new URL(base).origin;
  const metrics = JSON.parse(readFileSync(join(root, "schema", "header-metrics.json"), "utf8")) as Metrics;
  // Whether this machine draws the letters as the file counts them.
  const here = await fontsHere(metrics.link.scripts.map((s) => s.name));
  console.log(`the header's letters on this machine, as tools/header-metrics.ts --check finds them: ${here.line}`);
  if (verdictFails(here)) check(false, "header-metrics.json is what this machine draws, whose fonts are those it was measured with (tools/header-metrics.ts --check)", here.line);
  const browser = await chromium.launch();
  try {
    for (const c of HEADER_CASES) {
      // What is held of this menu here.
      const outside = lettersOutside(c.words, metrics);
      const { row: holdRow, step: holdStep } = held(here, outside);
      await publishHeader(c.words);
      const problems: string[] = [];
      const folds = new Set<string>();
      const fold = c.words.links.length === 0 ? null : (await drawnAt(browser, origin, 1440)).fold;
      const widths = [...new Set([...HEADER_WIDTHS, ...(fold === null || fold === "all" ? [] : await aroundTheStep(browser, origin, Number(fold)))])].sort((a, b) => a - b);
      let shown = 0;
      let pastTheStep = 0;
      for (const width of widths) {
        const d = await drawnAt(browser, origin, width);
        folds.add(String(d.fold));
        const at = `at ${width}`;
        if (d.scroll > d.client) problems.push(`${at}: the page scrolls sideways (${d.scroll} > ${d.client})`);
        if (d.foldShown && d.menuRight > d.client) problems.push(`${at}: Menu ends at ${d.menuRight}, outside the window`);
        if (!d.oneRow) problems.push(`${at}: the logo, the menu and the button are not on one row`);
        if (c.words.links.length === 0) {
          // No menu: nothing to fold, and no Menu to open.
          if (d.fold !== null || d.linksShown || d.foldShown) problems.push(`${at}: a header with no menu draws one`);
        } else {
          const expectLinks = d.fold !== "all" && d.fold !== null && d.menuWidth >= Number(d.fold);
          if (d.linksShown !== expectLinks) problems.push(`${at}: the links are ${d.linksShown ? "shown" : "folded"} in a block ${d.menuWidth.toFixed(2)} px wide under data-fold ${d.fold}`);
          if (d.foldShown === d.linksShown) problems.push(`${at}: Menu is ${d.foldShown ? "shown with" : "hidden with"} the links`);
          if (d.linksShown) {
            shown += 1;
            // Just past the step: the block no wider than the step and two
            // pixels, where a row drawn wider than counted wraps.
            const justPast = d.menuWidth - Number(d.fold) < 2;
            if (justPast) pastTheStep += 1;
            const hold = justPast ? holdStep : holdRow;
            if (hold && (d.linkLines !== 1 || d.linksRight > d.blockRight + 1 / 64)) {
              problems.push(`${at}: the links take ${d.linkLines} line(s) in a block ${d.menuWidth.toFixed(2)} px wide${justPast ? ", just past their step: their words are drawn wider than the server counted them" : ""}`);
            }
          }
        }
        if (c.label === "the design's header" && width === 375 && (!d.oneRow || Math.round(d.header) !== 64)) problems.push(`${at}: the design's header is not one 64 px row (${d.header} px)`);
        if (c.average && width === 375 && !d.sheetInside) problems.push(`${at}: Menu's sheet, opened, leaves the window`);
      }
      if (c.fold !== undefined && (folds.size !== 1 || !folds.has(String(c.fold)))) problems.push(`data-fold is ${[...folds].join(" and ")}, not ${c.fold}`);
      if (fold !== null && fold !== "all" && pastTheStep === 0) problems.push(`no window put the menu just past its step of ${fold} px`);
      const notDrawn = here.verdict === "unknown" ? "tools/header-metrics.ts --check gave no verdict here" : "header-metrics.json is not what this machine draws";
      const scripts = outside.scripts.join(", ");
      const said = (() => {
        if (c.words.links.length === 0) return " (it has no menu, and no Menu)";
        if (shown === 0) return " (they show at none)";
        if (holdRow) {
          const step = holdStep ? ", and just past their step" : ` (just past their step not held: ${notDrawn})`;
          return `, on one line at the ${shown} widths they show${step}${outside.scripts.length > 0 ? ` (letters of ${scripts}, drawn here with the fonts the file was measured with)` : ""}`;
        }
        if (outside.unmeasured) return " (a character the file does not measure, counted at 1.5 em: its line is not held)";
        return ` (letters of ${scripts}: ${here.verdict === "face" ? "this machine draws them with other fonts than the file was measured with" : notDrawn}, so their line is not held here)`;
      })();
      check(problems.length === 0, `the header, ${c.label}: inside the page on one row at ${widths.length} widths, the links where data-fold (${[...folds].join()}) says${said}`, problems.slice(0, 6).join("; "));
    }
  } finally {
    await browser.close();
  }
  return notHeldHere(here, HEADER_CASES.map((c) => ({ links: c.words.links.length, outside: lettersOutside(c.words, metrics) })));
}
