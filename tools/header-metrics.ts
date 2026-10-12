// node tools/header-metrics.ts [--check]
//
// How wide a menu's letters are, measured once in the site's own typeface,
// so that the server can tell, from the words alone, where a menu's row of
// links stops fitting its block. A published page runs no script and
// cannot measure itself; the editor sets a menu's links (a menu block, in
// the header, the footer or a page), and its row folds into Menu wherever
// the block is narrower than the row. So the CMS adds up these widths for
// the labels it draws (app/models/header_fit.rb) and names, on the block,
// the step of site.css's container queries below which the links fold
// (data-fold). The editor's canvas reads the same file to draw the same
// menu.
//
// It renders a menu of the CMS's stylesheets (cms/app/assets: site.css,
// tokens.css and the fonts) in Chromium headless (Playwright 1.62.1, from
// the root package), and writes schema/header-metrics.json:
// - the advance of every character of Basic Latin, Latin-1, Latin
//   Extended-A and the common punctuation that the face's file holds (it
//   is a subset), in a link of the menu. A combining accent counts what it
//   adds to its letter;
// - for each script the face lacks and a label may hold (Greek, Cyrillic,
//   Hebrew, Arabic, CJK), the widest advance its letters are drawn with, by
//   the fonts this machine falls back to: the page's own stack and three
//   generic families, whichever draws a letter widest; a letter of Greek,
//   Cyrillic or Hebrew alone and after each letter of its script,
//   whichever adds most, and an Arabic letter in whichever of its four
//   joined forms is widest.
//   Greek, Cyrillic, Hebrew and Arabic letters each count their own, CJK
//   letters the widest of their script's. Any other character is counted as
//   1.5 times the font size, wider than any letter measured, so a symbol or
//   a script left out folds the menu early rather than late. What a
//   visitor's own fonts draw is theirs: these are the widths on the machine
//   that measures, and a letter that a font draws wider than counted here
//   can still put the row on two lines (site.css lets it wrap inside the
//   block);
// - the gap between two links, read from the computed style;
// - the widths where the links fold, those site.css gives data-fold, each
//   checked by drawing the menu in a block just narrower than it and as
//   wide as it, and "all", checked at the widest page.
// It then checks its own sum on words drawn whole (the design's labels,
// capitals, accents, digits, punctuation, and words of the other scripts:
// Arabic ones whose letters join, Cyrillic pairs the fonts set apart): the
// sum must never be narrower than the drawn run, or a menu that does not
// fit could be told it does. It writes nothing if it is.
//
// --check measures again and compares with the file, writing nothing. Run
// it after a change to the menu's styles or to the fonts, and write the
// file again with the plain command. It exits 1 on a difference, or on a
// word drawn wider than its sum. The widths of the letters outside the
// face are those the fonts of the measuring machine drew, so the file
// keeps two fingerprints of each script (`fonts`): `drew`, of every width
// those fonts drew its letters at, in the four stacks and every form and
// pair; and `holds`, of `drew` together with what was drawn (its letters,
// their forms and pairs, the stacks, the type of a link) and the widths the
// file holds for the script. Where this machine draws a script otherwise
// (another machine, or these fonts after an update), its `drew` is not the
// file's: that script's widths and words cannot be compared here, and
// --check says so and exits 2, having compared all the rest. Where it
// draws it as the file was measured, its widths are compared as the
// face's own letters are. And a file whose `holds` does not go with its
// own `drew` and widths and with what this tool draws (edited, or written
// from other letters, places or stacks) fails wherever it runs. What
// `drew` records is the letters alone: a font change only in the joined
// forms fails rather than exiting 2, and a file written with the pairs
// drawn otherwise or another font-variant setting exits 2 rather than
// failing. The last line of --check is the verdict, for the programs that
// act on it (lib/header-metrics-verdict.ts).
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verdictLine, type Verdict } from "./lib/header-metrics-verdict.ts";

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

// The scripts the face lacks, as ranges of code points. A letter of one
// counts what it is drawn at, at its widest among the fallback fonts, if
// the script's letters are measured one by one (`letters`: Greek, Cyrillic,
// Hebrew and Arabic), and the script's widest letter if not (CJK, where
// every ideograph has the same advance, and too many to list).
// A font's kerning sets a few pairs apart: Cyrillic Д after А is drawn
// 0.7 px wider in the name than the two alone, so that pair was 2.6% wider
// than its sum. A letter of a script that `kerns` is drawn after each
// letter of its script too, and counts the most it adds to the one before
// it, if that is more than its own width: no pair of Greek, Cyrillic or
// Hebrew letters is then wider than its sum.
// An Arabic letter takes another shape where it joins the letters beside
// it, and some of those shapes are drawn wider than the letter alone (heh
// and meem where a letter follows them, alef and teh marbuta after a
// letter that joins them, keheh at the end of a word, by up to 2.5 px in a
// link): so a letter of a script that `joins` is drawn in its four forms,
// alone, joined to a letter after it, to letters on both sides and to one
// before it (a zero-width joiner, U+200D, standing for the neighbour), and
// counts the widest; no pair or run of them was found drawn wider than its
// sum with the slack, nor of CJK, which are not drawn in pairs.
// The ranges hold the letters, digits and punctuation in common
// use, not the marks that sit on a letter, historic letters or
// presentation forms, which count 1.5 em; of a range longer than 1000 code
// points every `every`th is drawn, which for CJK is as good as every one.
const SCRIPTS: Array<{ name: string; ranges: Array<[number, number]>; letters?: true; joins?: true; kerns?: true; every?: number }> = [
  { name: "Greek", ranges: [[0x386, 0x3ce]], letters: true, kerns: true },
  { name: "Cyrillic", ranges: [[0x400, 0x45f], [0x490, 0x491]], letters: true, kerns: true },
  { name: "Hebrew", ranges: [[0x5d0, 0x5ea]], letters: true, kerns: true },
  { name: "Arabic", ranges: [[0x621, 0x64a], [0x660, 0x669], [0x66e, 0x6d3]], letters: true, joins: true },
  { name: "CJK", ranges: [[0x3000, 0x303f], [0x3041, 0x30ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xac00, 0xd7a3], [0xff01, 0xff60]], every: 37 },
];
// The code points of a script that are drawn: assigned letters, digits,
// punctuation, symbols and spaces, no marks, controls or unassigned ones.
const DRAWN = /^[\p{L}\p{N}\p{P}\p{S}\p{Z}]$/u;
const sampleOf = (script: (typeof SCRIPTS)[number]): number[] => {
  const points = new Set<number>();
  for (const [from, to] of script.ranges) {
    const step = to - from + 1 > 1000 ? script.every ?? 1 : 1;
    for (let point = from; point <= to; point += step) points.add(point);
    points.add(to);
  }
  return [...points].filter((point) => DRAWN.test(String.fromCodePoint(point))).sort((a, b) => a - b);
};
// The stacks a letter the face lacks is drawn in: the page's own, and the
// face before each of three generic families, as unlike as can be.
const STACKS = ["", "monospace", "serif", "sans-serif"];
// The forms a letter is drawn in, as what stands before and after it:
// alone; and for a script that joins, joined to a letter after it, on both
// sides and before it, a zero-width joiner standing for the neighbour.
const ZWJ = "\u200D";
const ALONE: Array<[string, string]> = [["", ""]];
const JOINED: Array<[string, string]> = [["", ""], ["", ZWJ], [ZWJ, ZWJ], [ZWJ, ""]];
// The properties of a place's type that choose a fallback font or set the
// widths it draws at.
const TYPE = ["font-family", "font-size", "font-weight", "font-stretch", "font-style", "font-kerning", "font-feature-settings", "font-variation-settings", "font-variant-ligatures", "font-synthesis", "letter-spacing", "word-spacing", "text-transform", "text-rendering"];
// One place: a link of a menu.
const PLACES = ["link"] as const;
type Place = (typeof PLACES)[number];
const codePoints = (ranges: Array<[number, number]>) => ranges.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, k) => from + k));
// Rounded to 1/1000 px: Chromium lays text out in 1/64 px.
const round = (n: number) => Math.round(n * 1000) / 1000;

const css = (name: string) => readFileSync(join(assets, "stylesheets", name), "utf8");
const siteCss = css("site.css");
// The widths site.css folds a menu's links below, as data-fold names them.
const steps = [...new Set([...siteCss.matchAll(/\.w-menu\[data-fold="(\d+)"\]/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
if (steps.length === 0) throw new Error("site.css gives data-fold no width");
if (!/\.w-menu\[data-fold="all"\]/.test(siteCss)) throw new Error('site.css has no rule for data-fold="all"');

// A menu block as the partial draws it (app/views/blocks/_menu.html.erb),
// in a box of the width given, on a page as wide as the window; an id on
// the row and on the link whose text is measured.
const page = (fold: string | null, width: number) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/site.css"><link rel="stylesheet" href="/tokens.css"></head><body>
<div class="site"><div class="sw"><main><div style="width: ${width}px"><div class="w w-menu"${fold ? ` data-fold="${fold}"` : ""}><nav aria-label="Main"><div class="w-menu-links" id="links"><a href="/" id="link">Swims</a><a href="/">Gallery</a><a href="/">Meet us</a><a href="/">Questions</a></div><details class="w-menu-fold"><summary class="sw-menu-button">Menu</summary><div class="sw-menu-sheet"><a href="/">Swims</a></div></details></nav></div></div></main></div></div></body></html>`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  let html = page(null, WIDE);
  await context.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: html });
    if (path.endsWith(".css")) return route.fulfill({ contentType: "text/css", body: css(path.slice(1)) });
    if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: readFileSync(join(assets, "fonts", path.slice(1))) });
    return route.fulfill({ status: 404, body: "" });
  });
  const tab = await context.newPage();
  // A menu in a block `width` wide, on a page as wide as the widest.
  const open = async (width: number, fold: string | null = null) => {
    html = page(fold, width);
    await tab.setViewportSize({ width: WIDE, height: 600 });
    await tab.goto(`${ORIGIN}/`);
    await tab.evaluate(() => document.fonts.ready);
  };

  // Where the links fold: never without data-fold, and below each data-fold
  // width, checked in a block just narrower than it and as wide as it.
  const linksShown = () => tab.evaluate(() => getComputedStyle(document.getElementById("links")!).display !== "none");
  await open(40);
  if (!(await linksShown())) throw new Error("the links are folded in a block 40 px wide without data-fold");
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
  const measured = await tab.evaluate(({ points, combining, scripts, stacks, zwj, type }) => {
    const px = (value: string) => Number.parseFloat(value) || 0;
    const link = document.getElementById("link")!;
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
      // What each letter of the scripts is drawn at, at its widest among
      // the page's own stack and the three generic families: a letter the
      // face lacks is drawn by whichever font the machine falls back to, so
      // the widest of four such fonts is the bound this machine can vouch
      // for. A letter is drawn in each of its forms (a zero-width joiner,
      // which must itself draw nothing, standing for a neighbour it joins),
      // and, in a script that kerns, after each letter of its script, where
      // it counts what it adds to the one before it. Every width drawn is
      // kept, in the order drawn, for the fingerprint of the fonts.
      const stack = (generic: string) => (generic ? `${face}, ${generic}` : "");
      const joiner = Math.max(...stacks.map((generic) => set(element, zwj, stack(generic))));
      const drawnScripts = scripts.map(({ sample, forms, letters, kerns }) => {
        const drew: number[] = [];
        const draw = (text: string, family: string) => {
          const width = set(element, text, family);
          drew.push(width);
          return width;
        };
        const chars = sample.map((point) => String.fromCodePoint(point));
        const widest: Record<string, number> = {};
        for (const generic of stacks) {
          const family = stack(generic);
          const alone: Record<string, number> = {};
          for (const ch of chars) {
            const widths = forms.map(([before, after]) => draw(before + ch + after, family));
            alone[ch] = widths[0]!;
            widest[ch] = Math.max(widest[ch] ?? 0, ...widths);
          }
          if (kerns) for (const a of chars) for (const b of chars) widest[b] = Math.max(widest[b]!, draw(a + b, family) - alone[a]!);
        }
        return { advance: Math.max(...Object.values(widest)), letters: letters ? widest : {}, drew };
      });
      set(element, "");
      const style = getComputedStyle(element);
      return { advances, missing, size: px(style.fontSize), face, scripts: drawnScripts, joiner, type: type.map((property) => style.getPropertyValue(property)) };
    };
    // Two links stand their margins apart: the right one of the first and
    // the left one of the next.
    const linkStyle = getComputedStyle(link);
    return {
      link: { ...place(link), gap: px(linkStyle.marginLeft) + px(linkStyle.marginRight) },
      lang: document.documentElement.lang,
    };
  }, {
    points: codePoints(RANGES),
    combining: codePoints(COMBINING),
    scripts: SCRIPTS.map((script) => ({ sample: sampleOf(script), forms: script.joins ? JOINED : ALONE, letters: script.letters === true, kerns: script.kerns === true })),
    stacks: STACKS,
    zwj: ZWJ,
    type: TYPE,
  });

  // A script none of whose letters was drawn would be counted at no width;
  // a joiner drawn with a width would be counted in a joined form.
  for (const which of PLACES) {
    measured[which].scripts.forEach(({ advance }, k) => {
      if (!(advance > 0)) throw new Error(`${SCRIPTS[k]!.name}: no letter of it was drawn with a width in the ${which} place`);
    });
    if (measured[which].joiner > 0.001) throw new Error(`a zero-width joiner is drawn ${measured[which].joiner} px wide in the ${which} place: the joined forms would count it`);
  }

  // The sum against words drawn whole, in each place.
  const SAMPLES = [
    "Slack Water", "Swims", "Gallery", "Meet us", "Questions", "Join", "Sea Thrift Swimming Club", "Become a member",
    "WWWWWWWW", "MMMMMMMM", "AVATAR", "To Wa", "Ïllüstrâtïön", "Œuvre Ærø", "0123456789", "Q&A — FAQ’s…", "“Open” • ‘water’", "tel: +44 (0)1234", "ffi ffl fi fl",
    "‘a’ “b” ‘c’ “d” • ‘e’ “f”", "“‘“‘“‘“‘”’”’”’”’", "• • • • • • • •",
    `Cafe${String.fromCodePoint(0x301)} de${String.fromCodePoint(0x301)}ja${String.fromCodePoint(0x300)}`,
    // Other scripts, whole: each letter counts its own width, or its
    // script's widest. Among them Arabic words whose heh, meem, alef, teh
    // marbuta and keheh join their neighbours, whose sum, each letter
    // counted alone as before 10 October, was up to 30% narrower than the
    // word drawn; and Cyrillic pairs the fonts' kerning sets apart, whose
    // sum, each letter counted alone, was up to 2.6% narrower than the pair
    // drawn, beyond the slack.
    "Ήρεμα νερά", "Ερωτήσεις", "ΩΜΕΓΑ ΔΩΡΟ", "Тихая вода", "ЩЮЖШЫ Ёё", "Вопросы и ответы", "מים שקטים", "שאלות ושחייה", "מרחב",
    "АД", "ЖЪ", "Ца", "са", "ух", "ху", "ца", "АДРЕС", "Цапля", "сахар", "уха",
    "مرحبا بكم", "السباحة في البحر", "ضصطظ", "مهم", "مهارات", "مهرجان", "جمهور", "المهمة", "مہمان", "ههههه", "طاطاطاطا", "کمک",
    "潮の会", "日本語の案内", "ひらがなカタカナ", "한국어 수영 클럽", "Slack Water 潮",
  ];
  const drawn = await tab.evaluate((samples) => {
    const measure = (id: string, text: string) => {
      const element = document.getElementById(id)!;
      element.textContent = text;
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().width;
    };
    return samples.map((text) => ({ text, link: measure("link", text) }));
  }, SAMPLES);

  const tables = {
    link: Object.fromEntries(Object.entries(measured.link.advances).map(([k, v]) => [k, round(v)])),
  };
  // The scripts as the file holds them, in each place.
  type ScriptTable = { name: string; ranges: Array<[number, number]>; advance: number; letters: Record<string, number> };
  const scriptTables = Object.fromEntries(PLACES.map((which) => [which, SCRIPTS.map((script, k): ScriptTable => {
    const drawnScript = measured[which].scripts[k]!;
    return { name: script.name, ranges: script.ranges, advance: round(drawnScript.advance), letters: Object.fromEntries(Object.entries(drawnScript.letters).map(([letter, width]) => [letter, round(width)])) };
  })])) as Record<Place, ScriptTable[]>;
  // What a character counts in a place, as header_fit.rb and header-fit.ts
  // count it: its own advance in the face, else, in a script, its own width
  // if the script has its letters measured and the script's widest letter
  // if not, else 1.5 times the place's font size.
  const advanceOf = (which: Place, ch: string): number => {
    const own = tables[which][ch];
    if (own !== undefined) return own;
    const point = ch.codePointAt(0)!;
    const script = scriptTables[which].find((s) => s.ranges.some(([from, to]) => point >= from && point <= to));
    return script ? (script.letters[ch] ?? script.advance) : measured[which].size * 1.5;
  };
  const sum = (which: Place, text: string) => [...text].reduce((n, ch) => n + advanceOf(which, ch), 0);
  // How much wider than the sum a run can be drawn: the face pulls most
  // pairs together, but sets a few apart (a quote mark beside a letter, by
  // a tenth of a pixel). The estimate adds SLACK of the sum to every run;
  // the words below show that it covers them, and by how much at the least.
  const SLACK = 0.01;
  let tightest = Infinity;
  let widest = 0;
  // The words short of their sum, each with the scripts of its letters
  // that the face lacks (none for a word of the face's own letters).
  const scriptOf = (ch: string) => {
    const point = ch.codePointAt(0)!;
    return SCRIPTS.find((s) => s.ranges.some(([from, to]) => point >= from && point <= to))?.name ?? "otherwise";
  };
  const short: Array<{ line: string; scripts: string[] }> = [];
  for (const sample of drawn) {
    const scripts = [...new Set([...sample.text].filter((ch) => tables.link[ch] === undefined).map(scriptOf))];
    for (const which of PLACES) {
      const plain = sum(which, sample.text);
      widest = Math.max(widest, sample[which] / plain - 1);
      const spare = plain * (1 + SLACK) - sample[which];
      tightest = Math.min(tightest, spare);
      if (spare < 0) short.push({ line: `${which} "${sample.text}": the sum with its slack is ${(-spare).toFixed(3)} px narrower than the drawn run`, scripts });
    }
  }
  const checking = process.argv.includes("--check");
  if (!checking && short.length > 0) throw new Error(`the sum of advances is narrower than what Chromium draws:\n  ${short.map((s) => s.line).join("\n  ")}`);

  // The fingerprints of each script. `drew`: every width this machine's
  // fonts drew its letters at, in a link. `holds`: `drew` with what was
  // drawn (the letters, their forms, the pairs, the stacks, the type of a
  // link and the page's language) and the script's
  // entries as a file holds them, in one order, letters by code point.
  const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
  const drew = SCRIPTS.map((_, k) => sha(PLACES.map((which) => measured[which].scripts[k]!.drew.map(round))));
  const plans = SCRIPTS.map((script) => ({
    sample: sampleOf(script),
    forms: script.joins ? JOINED : ALONE,
    kerns: script.kerns === true,
    stacks: STACKS,
    type: PLACES.map((which) => Object.fromEntries(TYPE.map((property, k) => [property, measured[which].type[k]]))),
    lang: measured.lang,
  }));
  const entriesOf = (file: unknown, k: number) => PLACES.map((which) => {
    const entry = (file as Record<string, { scripts?: unknown[] } | undefined> | null)?.[which]?.scripts?.[k] as { name?: unknown; ranges?: unknown; advance?: unknown; letters?: unknown } | undefined;
    if (typeof entry !== "object" || entry === null) return null;
    const letters = typeof entry.letters === "object" && entry.letters !== null ? Object.entries(entry.letters).sort(([a], [b]) => a.codePointAt(0)! - b.codePointAt(0)!) : entry.letters;
    return { name: entry.name, ranges: entry.ranges, advance: entry.advance, letters };
  });
  const holds = (k: number, drewThere: unknown, file: unknown) => sha({ plan: plans[k], drew: drewThere, entries: entriesOf(file, k) });

  const metrics = {
    $comment: "Written by `node tools/header-metrics.ts` from cms/app/assets (site.css, tokens.css, the fonts), measured in Chromium headless. The widths, in CSS px, of each character in a link of a menu, the gap between two links, and the steps site.css folds a menu below: the CMS (app/models/header_fit.rb) and the editor add them up to find the step below which a menu's links fold into Menu (data-fold on the menu block). A letter of a script listed counts its own width if the script lists its letters, else the script's widest letter, as the fallback fonts of the machine that measured draw them: a Greek, Cyrillic or Hebrew letter at the most it adds after any letter of its script, an Arabic letter in the widest of its four joined forms; any other character not listed counts otherwise. `fonts` keeps two fingerprints of each script: `drew`, of every width the fallback fonts drew its letters at, by which --check tells a machine that draws the script with other fonts, whose widths it cannot compare; and `holds`, of `drew` with what was drawn and the widths this file holds for the script, by which it tells a file it no longer writes, or one edited. Do not edit: run the script again after a change to the header's styles or fonts, or to the fonts of the machine that measures; --check compares.",
    fold: { steps },
    slack: SLACK,
    link: { size: measured.link.size, gap: measured.link.gap, otherwise: measured.link.size * 1.5, advances: tables.link, scripts: scriptTables.link },
    fonts: {} as Record<string, { drew: string; holds: string }>,
  };
  metrics.fonts = Object.fromEntries(SCRIPTS.map((script, k) => [script.name, { drew: drew[k]!, holds: holds(k, drew[k], metrics) }]));
  // A range of code points on one line: [from, to].
  const text = JSON.stringify(metrics, null, 2).replace(/\[\s+(\d+),\s+(\d+)\s+\]/g, "[$1, $2]") + "\n";
  const counts = `${Object.keys(tables.link).length} characters of the face in a link (${measured.link.missing.length} of the ranges it lacks count otherwise, but the letters of ${SCRIPTS.map((s) => s.name).join(", ")} count what the fallback fonts draw them at); folds below ${steps.length} steps, ${steps[0]} to ${steps.at(-1)} px; ${drawn.length} words drawn whole are at most ${(widest * 100).toFixed(2)}% wider than the sum, and the sum with its ${SLACK * 100}% slack is never narrower (closest: ${tightest.toFixed(3)} px wider)`;

  if (checking) {
    const committed = readFileSync(target, "utf8");
    const was = JSON.parse(committed) as { fonts?: Record<string, { drew?: unknown; holds?: unknown } | undefined> };
    const names = SCRIPTS.map((s) => s.name);
    // A script whose fingerprints go with the file's widths of it and with
    // what this tool draws; else the file was not written as it stands by
    // this tool, from these styles.
    const sealed = names.map((name, k) => {
      const prints = was.fonts?.[name];
      return typeof prints?.drew === "string" && prints.holds === holds(k, prints.drew, was);
    });
    // The scripts this machine draws with other fonts than the file was
    // measured with: their widths are those fonts', and cannot be compared
    // here. Every other difference can: the face's, the styles', the
    // tool's own, and the widths of a script drawn here as the file was
    // measured, or whose fingerprints do not go with the file.
    const others = names.filter((name, k) => sealed[k] && was.fonts?.[name]?.drew !== drew[k]);
    const differences: string[] = names.filter((_, k) => !sealed[k]).map((name) => `/fonts/${name}: the file's fingerprints of ${name} do not go with its widths of ${name} and with what this tool draws from these styles: it was written by another version of the tool or from other styles, or edited`);
    const elsewhere: string[] = [];
    if (committed !== text) {
      const scriptPath = /^\/link\/scripts\/(\d+)\/(?:advance|letters\/.+)$/;
      const compare = (path: string, a: unknown, b: unknown) => {
        if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
          for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) compare(`${path}/${key}`, (a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
        } else if (a !== b) {
          // The fingerprints are what `sealed` and `others` read, not a difference.
          if (path.startsWith("/fonts/")) return;
          const line = `${path}: the file has ${JSON.stringify(a)}, the fonts and styles give ${JSON.stringify(b)}`;
          const k = scriptPath.exec(path)?.[1];
          const elsewhereDrawn = k !== undefined && typeof a === "number" && typeof b === "number" && others.includes(SCRIPTS[Number(k)]!.name);
          (elsewhereDrawn ? elsewhere : differences).push(line);
        }
      };
      compare("", was, metrics);
      if (differences.length === 0 && elsewhere.length === 0 && others.length === 0) differences.push("the file's text is not what the tool writes, though its values are");
    }
    // A word short of its sum on the fonts the file was measured with is a
    // fault of the sum; on other fonts, it is what those fonts draw.
    const shortHere = short.filter((s) => !s.scripts.some((name) => others.includes(name)));
    const shortElsewhere = short.filter((s) => s.scripts.some((name) => others.includes(name)));
    let verdict: Verdict;
    if (differences.length > 0 || shortHere.length > 0) {
      if (differences.length > 0) {
        console.log(`header-metrics.json is NOT what the fonts and styles give (${differences.length} difference(s)${elsewhere.length > 0 ? `, besides ${elsewhere.length} in letters this machine draws with other fonts` : ""}); run node tools/header-metrics.ts`);
        for (const line of differences.slice(0, 20)) console.log(`  ${line}`);
      }
      if (shortHere.length > 0) console.log(`the sum of advances is narrower than what Chromium draws:\n  ${shortHere.map((s) => s.line).join("\n  ")}`);
      verdict = "neither";
    } else if (others.length > 0) {
      const compared = names.filter((name) => !others.includes(name));
      console.log(`header-metrics.json could not be compared here for the letters of ${others.join(", ")}: this machine draws them with other fonts than the file was measured with (${elsewhere.length} of their widths differ); the face's own ${Object.keys(tables.link).length} characters, the spacing, the folds${compared.length > 0 ? ` and the letters of ${compared.join(", ")}` : ""} are what it holds`);
      for (const line of elsewhere.slice(0, 10)) console.log(`  ${line}`);
      if (shortElsewhere.length > 0) console.log(`  and on these fonts the sum is narrower than ${shortElsewhere.length} word(s) of those letters drawn whole: ${shortElsewhere.slice(0, 5).map((s) => s.line).join("; ")}`);
      verdict = "face";
    } else {
      console.log(`header-metrics.json is what the fonts and styles give: ${counts}`);
      verdict = "file";
    }
    console.log(verdictLine(verdict, others));
    process.exitCode = { file: 0, face: 2, neither: 1 }[verdict];
  } else {
    writeFileSync(target, text);
    console.log(`wrote schema/header-metrics.json: ${counts}`);
  }
} finally {
  await browser.close();
}
