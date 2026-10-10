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
//   one line, in one row with the brand, the bar the design's 80 px. That is
//   held for letters of the face, whose widths no machine changes; letters
//   it lacks are drawn by the machine's own fonts (HeaderCase.outsideFace),
//   and for them the first two hold on every machine and this one is the
//   measuring machine's.
// The design's own header must have no data-fold and one row at 375, and
// a fifth link must fold below 880, so the server's sum is held to the
// steps; at the limits, in words of average width, the name, the button's
// label and each link of Menu's sheet must sit on one line at 375, as
// $defs/site of the schema says they do.
import { chromium, type Page } from "playwright";

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
  // Letters the face lacks, which each visitor's machine draws with fonts
  // of its own: the file counts them at what the machine that measured drew
  // (tools/header-metrics.ts), so whether the links then stay on one row is
  // that machine's to say, not this check's on any other. What no font can
  // break is still held: nothing leaves the page, Menu is inside it, and
  // the links are where data-fold says.
  outsideFace?: boolean;
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
  { label: "three links in another script", site: { ...DESIGN, name: "潮の会", menu: links("日本語の案内", "مرحبا بكم", "Ελληνικά") }, outsideFace: true },
  // Short headers as a person writes them in Hebrew and in Greek: the links
  // stay in the bar from the design's 800 up, where they were folded below
  // 1200 and at every width when every letter outside the face counted 1.5 em.
  {
    label: "a short header in Hebrew",
    site: { ...DESIGN, name: "מים שקטים", menu: links("שחייה", "גלריה", "עלינו", "שאלות"), action: { label: "הצטרפו", href: "/#join" } },
    fold: null,
    outsideFace: true,
  },
  {
    label: "a short header in Greek",
    site: { ...DESIGN, name: "Ήρεμα νερά", menu: links("Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"), action: { label: "Γραφτείτε", href: "/#join" } },
    fold: null,
    outsideFace: true,
  },
  // A letter the file counts at 1.5 em and a font draws wider (three of the
  // Arabic bismillah ligature, about 90 px wide where 22.5 is counted): the
  // bar may take two rows from the width the sum says it fits at, but it
  // stays inside the page.
  { label: "a link of a letter drawn wider than counted", site: { ...DESIGN, menu: [...DESIGN.menu, { label: "\u{FDFD}\u{FDFD}\u{FDFD}", href: "/#contact" }] }, outsideFace: true },
  { label: "no links and no button", site: { ...DESIGN, menu: [], action: null }, fold: null },
];

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
      brandLines: lines(header.querySelector(".sw-brand > span")),
      buttonLines: lines(header.querySelector(".sw-btn-small")),
      sheetLines,
    };
  });
}

export async function headerChecks(base: string, steps: readonly number[], check: Check, setSite: (site: SiteValues) => Promise<void>): Promise<void> {
  const origin = new URL(base).origin;
  const browser = await chromium.launch();
  try {
    for (const c of HEADER_CASES) {
      await setSite(c.site);
      const problems: string[] = [];
      const folds = new Set<string>();
      for (const width of headerWidths(steps)) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        await page.route("**/*", (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
        await page.goto(`${origin}/`, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        const d = await drawn(page);
        await page.close();
        folds.add(String(d.fold));
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
          if (d.linksShown && !c.outsideFace && (d.linkRows !== 1 || d.rowLines !== 1 || Math.round(d.header) !== 80)) {
            problems.push(`${at}: the menu wraps the bar (links on ${d.linkRows} line(s), brand and links on ${d.rowLines} row(s), the bar ${d.header} px)`);
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
      check(problems.length === 0, `the header, ${c.label}: inside the page at ${headerWidths(steps).length} widths, the links where data-fold (${[...folds].join()}) says${c.outsideFace ? " (letters outside the face: whether they stay on one row is the machine's fonts', not held)" : " and on one row there"}`, problems.slice(0, 6).join("; "));
    }
  } finally {
    await browser.close();
  }
}
