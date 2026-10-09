// node tools/header-metrics.ts [--check]
//
// How wide the header's letters are, measured once in the site's own
// typeface, so that the server can tell, from the words alone, where a
// menu stops fitting the bar. A published page runs no script and cannot
// measure itself; the editor sets the site's name, the menu and the
// button's label (PUT /api/site); and the bar of the desktop layout has
// room for the design's four links at 800 px with 46 px to spare. So the
// CMS adds up these widths for the words it draws (app/models/
// header_fit.rb) and names, on the header, the width below which the links
// fold into Menu as they do on a tablet (data-fold). The editor's canvas
// reads the same file to draw the same header.
//
// It renders the header of the CMS's stylesheets (cms/app/assets: site.css,
// tokens.css and the fonts) in Chromium headless (Playwright 1.62.1, from
// the root package), in the desktop layout, and writes
// schema/header-metrics.json:
// - the advance of every character of Basic Latin, Latin-1, Latin
//   Extended-A and the common punctuation that the face's file holds (it
//   is a subset), in each of the three places: the name, a link, the
//   button. A combining accent counts what it adds to its letter. Any
//   other character is counted as 1.5 times the place's font size, wider
//   than any letter measured, so words in another script fold the menu
//   early rather than late;
// - the spacing around them, read from the computed style: the mark and
//   its gap, the gaps between links and after them, the button's padding,
//   the page's padding, and the width where the bar stops growing;
// - the widths where the links fold: the design's own (found by drawing),
//   and those site.css gives data-fold, each checked by drawing the header
//   just below and at it.
// It then checks its own sum on words drawn whole (the design's labels,
// capitals, accents, digits, punctuation): the sum must never be narrower
// than the drawn run, or a menu that does not fit could be told it does.
//
// --check measures again and compares with the file, writing nothing:
// exit 1 on a difference. Run it after a change to the header's styles or
// to the fonts, and write the file again with the plain command.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "cms", "app", "assets");
const target = join(root, "schema", "header-metrics.json");
const ORIGIN = "http://header-metrics.test";
const WIDE = 1440;

// The characters measured, as code points. Anything else is "otherwise".
const RANGES: Array<[number, number]> = [
  [0x20, 0x7e], [0xa0, 0x17f],
  [0x2010, 0x2014], [0x2018, 0x201f], [0x2022, 0x2022], [0x2026, 0x2026], [0x2030, 0x2030], [0x2039, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122],
];
const COMBINING: Array<[number, number]> = [[0x300, 0x36f]];
const codePoints = (ranges: Array<[number, number]>) => ranges.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, k) => from + k));
// Rounded to 1/1000 px: Chromium lays text out in 1/64 px.
const round = (n: number) => Math.round(n * 1000) / 1000;

const css = (name: string) => readFileSync(join(assets, "stylesheets", name), "utf8");
const siteCss = css("site.css");
// The widths site.css folds the links below, as data-fold names them.
const steps = [...new Set([...siteCss.matchAll(/\.sw-header\[data-fold="(\d+)"\]/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
if (steps.length === 0) throw new Error("site.css gives data-fold no width");
if (!/\.sw-header\[data-fold="all"\]/.test(siteCss)) throw new Error('site.css has no rule for data-fold="all"');

// The header as the layout draws it (layouts/public.html.erb), with an id
// on each place a text goes.
const page = (fold: string | null) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/tokens.css"></head><body>
<div class="site"><div class="sw"><header class="sw-header"${fold ? ` data-fold="${fold}"` : ""}><div class="sw-inner sw-header-row"><a class="sw-brand" href="/"><svg class="sw-brand-mark" viewBox="0 0 40 40"></svg><span id="name">Slack Water</span></a><nav class="sw-nav" aria-label="Main"><div class="sw-nav-links" id="links"><a href="/" id="link">Swims</a><a href="/">Gallery</a><a href="/">Meet us</a><a href="/">Questions</a></div><a class="sw-btn sw-btn-small" href="/"><span id="button">Join</span></a><details class="sw-menu"><summary class="sw-menu-button">Menu</summary><div class="sw-menu-sheet"><a href="/">Swims</a></div></details></nav></div></header><main></main></div></div></body></html>`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  let html = page(null);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (path.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: css(path.slice(1)) });
    if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: readFileSync(join(assets, "fonts", path.slice(1))) });
    return route.fulfill({ status: 404, body: "" });
  });
  const tab = await context.newPage();
  const open = async (width: number, fold: string | null = null) => {
    html = page(fold);
    await tab.setViewportSize({ width, height: 600 });
    await tab.goto(`${ORIGIN}/`);
    await tab.evaluate(() => document.fonts.ready);
  };

  // Where the links fold: the design's width, found by drawing, and each
  // data-fold width, checked just below and at it.
  const linksShown = () => tab.evaluate(() => getComputedStyle(document.getElementById("links")!).display !== "none");
  let low = 320;
  let high = WIDE;
  await open(high);
  if (!(await linksShown())) throw new Error(`the links are folded at ${WIDE} px without data-fold`);
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    await open(mid);
    if (await linksShown()) high = mid;
    else low = mid;
  }
  const breakpoint = high;
  for (const step of steps) {
    await open(step - 1, String(step));
    const below = await linksShown();
    await open(step, String(step));
    const at = await linksShown();
    if (below || !at) throw new Error(`data-fold="${step}" shows the links ${below ? `at ${step - 1} px` : ""}${!at ? ` and hides them at ${step} px` : ""}`);
  }
  await open(WIDE, "all");
  if (await linksShown()) throw new Error(`data-fold="all" shows the links at ${WIDE} px`);

  await open(WIDE);
  const measured = await tab.evaluate(({ points, combining }) => {
    const px = (value: string) => Number.parseFloat(value) || 0;
    const name = document.getElementById("name")!;
    const link = document.getElementById("link")!;
    // The button's label is measured in a span of its own: the button is
    // a flex container, which draws no run of white space alone, so a
    // space measured there would be 0. The span inherits every property
    // that sets the text's width.
    const button = document.getElementById("button")!;
    const buttonBox = button.parentElement!;
    const brand = name.parentElement!;
    const links = document.getElementById("links")!;
    const nav = links.parentElement!;
    const row = brand.parentElement!;
    const textWidth = (element: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().width;
    };
    // One character at a time, with white-space: pre, or a space alone
    // would collapse to nothing (inside a name it keeps its advance).
    const set = (element: HTMLElement, text: string, family = "") => {
      element.textContent = text;
      element.style.fontFamily = family;
      element.style.whiteSpace = text === "" ? "" : "pre";
      return textWidth(element);
    };
    // A character is the face's own when three fallbacks as unlike as a
    // fixed-width, a serif and a sans-serif face give it the same width.
    // The face's file holds a subset of these ranges: the rest is left to
    // "otherwise", whatever this machine's fallback fonts draw it with.
    const place = (element: HTMLElement) => {
      const advances: Record<string, number> = {};
      const missing: string[] = [];
      const face = getComputedStyle(element).fontFamily.split(",")[0]!.trim();
      for (const point of points) {
        const ch = String.fromCodePoint(point);
        const widths = ["monospace", "serif", "sans-serif"].map((fallback) => set(element, ch, `${face}, ${fallback}`));
        if (Math.max(...widths) - Math.min(...widths) > 0.001) missing.push(ch);
        else advances[ch] = set(element, ch);
      }
      // A combining accent, by what it adds to an "o". One the face lacks
      // sends the whole letter to a fallback font, which draws it at
      // another width on every machine: such accents are left out, like
      // any character the face lacks.
      for (const point of combining) {
        const mark = String.fromCodePoint(point);
        const adds = ["monospace", "serif", "sans-serif"].map((fallback) => set(element, `o${mark}`, `${face}, ${fallback}`) - set(element, "o", `${face}, ${fallback}`));
        if (Math.max(...adds) - Math.min(...adds) > 0.001) missing.push(mark);
        else advances[mark] = Math.max(0, adds[0]!);
      }
      set(element, "");
      const style = getComputedStyle(element);
      return { advances, missing, size: px(style.fontSize), face };
    };
    const brandStyle = getComputedStyle(brand);
    const mark = brand.querySelector("svg")!.getBoundingClientRect().width;
    const result = {
      brand: { ...place(name), fixed: mark + px(brandStyle.columnGap), after: px(brandStyle.marginRight) },
      link: { ...place(link), gap: px(getComputedStyle(links).columnGap), after: px(getComputedStyle(links).marginRight) },
      button: { ...place(button), fixed: px(getComputedStyle(buttonBox).paddingLeft) + px(getComputedStyle(buttonBox).paddingRight) },
      nav: { gap: px(getComputedStyle(nav).columnGap) },
      page: { padX: px(getComputedStyle(row).paddingLeft), widest: px(getComputedStyle(row).maxWidth) },
    };
    return result;
  }, { points: codePoints(RANGES), combining: codePoints(COMBINING) });

  // The three places share one face, so they must lack the same letters.
  const lacking = (which: "brand" | "link" | "button") => measured[which].missing.join("");
  if (lacking("brand") !== lacking("link") || lacking("brand") !== lacking("button")) throw new Error("the header's three places do not have the same letters");

  // The sum against words drawn whole, in each place.
  const SAMPLES = [
    "Slack Water", "Swims", "Gallery", "Meet us", "Questions", "Join", "Northfield Swimming Club", "Become a member",
    "WWWWWWWW", "MMMMMMMM", "AVATAR", "To Wa", "Ïllüstrâtïön", "Œuvre Ærø", "0123456789", "Q&A — FAQ’s…", "“Open” • ‘water’", "tel: +44 (0)1234", "ffi ffl fi fl",
    "‘a’ “b” ‘c’ “d” • ‘e’ “f”", "“‘“‘“‘“‘”’”’”’”’", "• • • • • • • •",
    `Cafe${String.fromCodePoint(0x301)} de${String.fromCodePoint(0x301)}ja${String.fromCodePoint(0x300)}`,
  ];
  const drawn = await tab.evaluate((samples) => {
    const measure = (id: string, text: string) => {
      const element = document.getElementById(id)!;
      element.textContent = text;
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().width;
    };
    return samples.map((text) => ({ text, brand: measure("name", text), link: measure("link", text), button: measure("button", text) }));
  }, SAMPLES);

  const tables = {
    brand: Object.fromEntries(Object.entries(measured.brand.advances).map(([k, v]) => [k, round(v)])),
    link: Object.fromEntries(Object.entries(measured.link.advances).map(([k, v]) => [k, round(v)])),
    button: Object.fromEntries(Object.entries(measured.button.advances).map(([k, v]) => [k, round(v)])),
  };
  const sum = (table: Record<string, number>, size: number, text: string) => [...text].reduce((n, ch) => n + (table[ch] ?? size * 1.5), 0);
  // How much wider than the sum a run can be drawn: the face pulls most
  // pairs together, but sets a few apart (a quote mark beside a letter, by
  // a tenth of a pixel). The estimate adds SLACK of the sum to every run;
  // the words below show that it covers them, and by how much at the least.
  const SLACK = 0.01;
  let tightest = Infinity;
  let widest = 0;
  const short: string[] = [];
  for (const sample of drawn) {
    for (const which of ["brand", "link", "button"] as const) {
      const plain = sum(tables[which], measured[which].size, sample.text);
      widest = Math.max(widest, sample[which] / plain - 1);
      const spare = plain * (1 + SLACK) - sample[which];
      tightest = Math.min(tightest, spare);
      if (spare < 0) short.push(`${which} "${sample.text}": the sum with its slack is ${(-spare).toFixed(3)} px narrower than the drawn run`);
    }
  }
  if (short.length > 0) throw new Error(`the sum of advances is narrower than what Chromium draws:\n  ${short.join("\n  ")}`);

  const metrics = {
    $comment: "Written by `node tools/header-metrics.ts` from cms/app/assets (site.css, tokens.css, the fonts), measured in Chromium headless in the desktop layout. The widths, in CSS px, of each character in the header's three places, and the spacing around them: the CMS (app/models/header_fit.rb) and the editor add them up to find the width below which a menu folds into Menu (data-fold on the header). A character not listed counts otherwise. Do not edit: run the script again after a change to the header's styles or fonts; --check compares.",
    fold: { breakpoint, steps, widest: measured.page.widest },
    slack: SLACK,
    page: { padX: measured.page.padX },
    brand: { size: measured.brand.size, fixed: round(measured.brand.fixed), after: measured.brand.after, otherwise: measured.brand.size * 1.5, advances: tables.brand },
    link: { size: measured.link.size, gap: measured.link.gap, after: measured.link.after, otherwise: measured.link.size * 1.5, advances: tables.link },
    nav: { gap: measured.nav.gap },
    button: { size: measured.button.size, fixed: measured.button.fixed, otherwise: measured.button.size * 1.5, advances: tables.button },
  };
  const text = JSON.stringify(metrics, null, 2) + "\n";
  const counts = `${Object.keys(tables.brand).length} characters of the face in each of 3 places (${measured.brand.missing.length} of the ranges it lacks count otherwise); folds at ${breakpoint} px and at ${steps.join(", ")}; ${drawn.length} words drawn whole in each place are at most ${(widest * 100).toFixed(2)}% wider than the sum, and the sum with its ${SLACK * 100}% slack is never narrower (closest: ${tightest.toFixed(3)} px wider)`;

  if (process.argv.includes("--check")) {
    const committed = readFileSync(target, "utf8");
    if (committed === text) {
      console.log(`header-metrics.json is what the fonts and styles give: ${counts}`);
    } else {
      const was = JSON.parse(committed) as typeof metrics;
      const differences: string[] = [];
      const compare = (path: string, a: unknown, b: unknown) => {
        if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
          for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(`${path}/${key}`, (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
        } else if (a !== b) differences.push(`${path}: the file has ${JSON.stringify(a)}, the fonts and styles give ${JSON.stringify(b)}`);
      };
      compare("", was, metrics);
      console.log(`header-metrics.json is NOT what the fonts and styles give (${differences.length} difference(s)); run node tools/header-metrics.ts`);
      for (const line of differences.slice(0, 20)) console.log(`  ${line}`);
      process.exitCode = 1;
    }
  } else {
    writeFileSync(target, text);
    console.log(`wrote schema/header-metrics.json: ${counts}`);
  }
} finally {
  await browser.close();
}
