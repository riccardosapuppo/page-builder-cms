// @vitest-environment node
//
// The canvas lays a page out as the published page is laid out, at the
// three widths the editor previews, without an iframe: what the render
// contract cannot see, since it compares markup, and the CSS decides the
// rest (spaces, the tokens' values, the container queries).
//
// The same documents are drawn twice in Chromium, headless:
// - the page the CMS serves (its draft preview), in a window as wide as the
//   device: 1280, 900 (where the type grows between the tablet and the
//   desktop sizes), and the editor's tablet and phone previews, 768 and
//   390 (src/shared/preview-widths.ts, from schema/tokens.json);
// - the editor's page root (src/render/page.tsx) with the published page's
//   stylesheets (site.css and tokens.css, as the CMS has them), all four
//   widths side by side in one window 1400 wide: only the root's width
//   tells each how to lay out. Each is drawn in the site style the CMS
//   stored while its page was served, which that page must carry (read as
//   ./style-served.ts says: another test file changes it for a moment).
// For every element of the page, in order, its box (from the left of the
// page root and the top of the sections' container, to 1/64 of a pixel,
// the unit layout works in) and the properties the stylesheets set must be
// the same. Images from elsewhere are not fetched by either page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { chromium, type Browser, type Page } from "playwright-core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, inject, test } from "vitest";
import { cmsFonts, cmsStylesheets } from "../build/paths.ts";
import { PageRoot, siteStyleAttributes, type SiteStyleChoice } from "../src/render/page.tsx";
import type { PageDocument } from "../src/shared/document.ts";
import { PREVIEW_WIDTHS } from "../src/shared/preview-widths.ts";
import { createRailsAdapter } from "../src/storage/rails.ts";
import { checked, page as randomPage } from "./render-arbitraries.ts";
import { servedWithStyle } from "./style-served.ts";

const cms = inject("cmsUrl");
const WIDTHS = [1280, 900, PREVIEW_WIDTHS.tablet, PREVIEW_WIDTHS.phone] as const;
const CANVAS = "http://canvas.test";

// A page whose settings change with the device: sizes, spaces, alignment,
// backgrounds, visibility, column widths, crops.
const block = (id: string, type: string, props: object, style: object = { base: {} }) => ({ id, type, props, children: [], style });
const responsive = checked({
  schemaVersion: 1,
  title: "Responsive",
  sections: [
    {
      id: "hero", type: "section", props: { anchor: "hero", columnWidths: "1:2" },
      style: { base: { background: "soft", spaceAbove: "section-l", spaceBelow: "xl", spaceBetween: "xl" }, tablet: { spaceAbove: "m", background: "primary" }, phone: { spaceBelow: "none", spaceBetween: "s" } },
      children: [
        {
          id: "hero-1", type: "column", props: {},
          style: { base: { spaceInside: "l", spaceBetween: "m", align: "center", verticalAlign: "middle", textSize: "large" }, tablet: { spaceInside: "s", align: "left" }, phone: { spaceInside: "none", verticalAlign: "top" } },
          children: [
            block("h1", "heading", { level: 1, text: "Swim at slack water" }, { base: { textSize: "display", color: "primary" }, tablet: { textSize: "heading-2", align: "right" }, phone: { textSize: "large" } }),
            block("t1", "text", { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Dawn swims, " }, { type: "text", text: "beginners", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "and a long word: Pneumonoultramicroscopicsilicovolcanoconiosis" }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Caps on" }] }] }] }] } }, { base: { textSize: "small" }, phone: { textSize: "body", align: "center" } }),
            block("b1", "button", { label: "Join the club", href: "/join" }, { base: { background: "accent", color: "text", align: "left" }, phone: { align: "center", background: "primary", color: "background" } }),
          ],
        },
        {
          id: "hero-2", type: "column", props: {}, style: { base: { background: "background" }, phone: { visibility: "hidden" } },
          children: [
            block("img1", "image", { url: "/media/not-there.png", alt: "The bay" }, { base: { aspect: "1:1" }, tablet: { aspect: "16:9" }, phone: { aspect: "4:3" } }),
            block("sp1", "spacer", { size: "xl" }, { base: {}, tablet: { visibility: "hidden" } }),
            block("d1", "divider", {}, { base: { color: "accent" }, phone: { color: "muted" } }),
          ],
        },
      ],
    },
    {
      id: "three", type: "section", props: { columnWidths: "2:1:1" }, style: { base: { spaceBetween: "l" } },
      children: ["a", "b", "c"].map((name, index) => ({
        id: `three-${name}`, type: "column", props: {}, style: { base: { spaceBetween: "s" } },
        children: [
          block(`ib-${name}`, "iconbox", { icon: ["sunrise", "buoys", "cup"][index], title: `Box ${name}`, text: "Short.\nTwo lines." }, { base: { align: "center" }, phone: { align: "left" } }),
          block(`q-${name}`, "quote", { text: "Cold water,\nwarm tea.", attribution: "A member" }, { base: { textSize: "heading-2" }, tablet: { textSize: "body" } }),
        ],
      })),
    },
    {
      id: "four", type: "section", props: {}, style: { base: { visibility: "hidden" }, tablet: { visibility: "visible" } },
      children: [1, 2, 3, 4].map((n) => ({ id: `four-${n}`, type: "column", props: {}, style: { base: {} }, children: [block(`h4-${n}`, "heading", { level: 4, text: `Column ${n}` })] })),
    },
    {
      id: "embeds", type: "section", props: {}, style: { base: {} },
      children: [{
        id: "embeds-1", type: "column", props: {}, style: { base: {} },
        children: [
          block("v1", "video", { provider: "vimeo", videoId: "76979871", title: "The same swim" }),
          block("m1", "map", { latitude: 54.5, longitude: -3.25, zoom: 13, label: "Meeting point" }),
          block("a1", "accordion", { items: [{ question: "Is it cold?", answer: "Yes.\nVery." }, { question: "Towels?", answer: "Bring two." }] }, { base: { color: "primary" } }),
          block("st1", "stats", {
            items: [
              { value: "12", label: "Years on the water" }, { value: "300+", label: "Swimmers each season" }, { value: "98%", label: "Who would come back" },
              { value: "1,200 m", label: "From the slipway to the buoy line" }, { value: "6", label: "Coaches" },
            ],
          }, { base: { color: "accent", align: "center" }, phone: { align: "left" } }),
          block("steps1", "steps", {
            items: [
              { title: "Get in touch", text: "Tell us what you would like to do and when." }, { title: "Try it", text: "Come along once,\nwith someone to show you how." },
              { title: "Join", text: "Stay on if it suits you." }, { title: "Swim all winter", text: "Short, cold swims, and very hot tea after." },
            ],
          }, { base: { color: "accent" }, phone: { color: "primary" } }),
          block("g1", "gallery", { items: [{ url: "/media/one.png", alt: "One" }, { url: "/media/two.png", decorative: true }, { url: "https://images.example.org/three.jpg", alt: "Three" }] }, { base: { spaceBetween: "l" }, phone: { spaceBetween: "xs" } }),
        ],
      }],
    },
  ],
});

// What the stylesheets set, read on every element.
const PROPERTIES = [
  "display", "position", "font-family", "font-size", "line-height", "font-weight", "font-style", "font-stretch", "color", "background-color",
  "padding-top", "padding-right", "padding-bottom", "padding-left", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "text-align", "column-gap", "row-gap", "grid-template-columns", "justify-content", "align-items", "aspect-ratio", "object-fit",
  "border-top-width", "border-top-color", "stroke", "fill", "white-space",
];

interface Measured {
  tag: string;
  block: string;
  box: [number, number, number, number] | null;
  style: string[];
}

// Fonts loaded, and every image settled. Images are lazy on both pages,
// and whether one has been asked for depends on where the window is, which
// differs between the two: each is made eager and waited for (loaded, or
// failed for one from elsewhere, which neither page fetches).
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    for (const image of images) image.loading = "eager";
    await Promise.all(images.map((image) => (image.complete ? undefined : new Promise((done) => {
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
    }))));
  });
}

// Every element of the page's own sections, in document order: those of
// the sections' container, not of the site's header and footer the CMS
// draws around it (./theme.rails.test.tsx holds those).
async function measure(page: Page, rootSelector: string): Promise<Measured[]> {
  return page.evaluate(([selector, properties]) => {
    const root = document.querySelector<HTMLElement>(selector as string)!;
    // The sections' container: the page's <main>, the canvas's plain block.
    const main = root.querySelector<HTMLElement>("main, .sw-main")!;
    const left = root.getBoundingClientRect().left;
    const top = main.getBoundingClientRect().top;
    // Layout works in 1/64 of a pixel; anything finer is the float error of
    // a drawing's box (an svg path's) at another place in the window.
    const round = (n: number) => Math.round(n * 64) / 64;
    return [...main.querySelectorAll<Element>("section.sec, section.sec *")].map((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      // An element that is not drawn (display: none) has no box at all.
      const drawn = element.getClientRects().length > 0;
      return {
        tag: element.tagName.toLowerCase(),
        block: element.closest("[data-block-id]")?.getAttribute("data-block-id") ?? "",
        box: drawn ? ([round(rect.left - left), round(rect.top - top), round(rect.width), round(rect.height)] as [number, number, number, number]) : null,
        style: (properties as string[]).map((p) => `${p}: ${style.getPropertyValue(p)}`),
      };
    });
  }, [rootSelector, PROPERTIES] as const);
}

let browser: Browser;
let pageId = 0;
let revision = 0;
let previewPath = "";
const adapter = createRailsAdapter({ apiBase: `${cms}/api` });

beforeAll(async () => {
  const created = await adapter.createPage({ title: "Canvas parity", slug: `canvas-parity-${Date.now().toString(36)}` });
  if (!created.ok) throw new Error(JSON.stringify(created.problem));
  pageId = created.value.page.id;
  revision = created.value.draft.revision;
  previewPath = created.value.links.preview;
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

async function newPage(width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 }, locale: "en-US", timezoneId: "UTC" });
  // Nothing from elsewhere, on either page: images and frames from other
  // sites are not fetched, so they draw the same broken way on both.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/]|canvas\.test[:/])/, (route) => route.abort());
  return page;
}

interface Difference {
  width: number;
  index: number;
  tag: string;
  block: string;
  page: Measured["box"];
  canvas: Measured["box"];
  styles: string[];
}

// The elements of the canvas that differ from the page's, at every width:
// none, when the canvas lays the page out as the CMS's page is laid out.
// The canvas uses the stylesheets named (both, unless a fault is planted).
async function compare(doc: PageDocument, label: string, stylesheets = ["site.css", "tokens.css"]): Promise<{ elements: number; differences: Difference[] }> {
  const saved = await adapter.saveDraft(pageId, { revision, document: doc, saveId: `${label}-${Date.now().toString(36)}` });
  if (!saved.ok) throw new Error(JSON.stringify(saved.problem));
  revision = saved.value.revision;

  // The pages the CMS serves, first, each with the site style the CMS
  // stored while it was served. That style is shared by every test file
  // of the run, and the storage contract (src/storage/contract.ts) changes
  // it for a moment to see that it can, then puts it back: a page served in
  // that moment is drawn in another type scale (text of 22 px where the
  // canvas, drawn in the style read before, had 24). So the page is served
  // again until the style held still around it (./style-served.ts), must
  // then carry it on its root, and each width's root on the canvas is drawn
  // in it.
  const served: { width: number; measured: Measured[]; style: SiteStyleChoice }[] = [];
  for (const width of WIDTHS) {
    const page = await newPage(width);
    const { served: carried, stored } = await servedWithStyle(adapter, async () => {
      await page.goto(new URL(previewPath, cms).href);
      return page.locator(".site").evaluate((root) => Object.fromEntries([...root.attributes].filter((a) => a.name !== "class").map((a) => [a.name, a.value])));
    });
    expect(carried, `the page served at ${width} carries the site style the CMS stores`).toEqual(siteStyleAttributes(stored));
    await settle(page);
    served.push({ width, measured: await measure(page, ".site"), style: stored });
    await page.close();
  }

  // The editor's page roots, one per width, side by side from the top of
  // the window, each at a whole pixel as the page's sections are: a root
  // half a pixel down would round some boxes the other way.
  let x = 0;
  const roots = served.map(({ width, style }) => {
    const at = x;
    x += width + 100;
    return `<div data-width="${width}" style="position: absolute; top: 0; left: ${at}px">${renderToStaticMarkup(<PageRoot document={doc} ctx={{ media: () => null }} siteStyle={style} width={width} landmark={false} />)}</div>`;
  }).join("");
  const css = stylesheets.map((name) => readFileSync(join(cmsStylesheets, name), "utf8")).join("\n");
  const canvas = await newPage(1400);
  await canvas.route(`${CANVAS}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${css}</style></head><body>${roots}</body></html>` });
    if (path.endsWith(".woff2")) return route.fulfill({ contentType: "font/woff2", body: readFileSync(join(cmsFonts, path.slice(1))) });
    return route.fulfill({ status: 404, body: "" });
  });
  await canvas.goto(`${CANVAS}/`);
  await settle(canvas);

  let elements = 0;
  const differences: Difference[] = [];
  for (const { width, measured: page } of served) {
    const ours = await measure(canvas, `[data-width="${width}"] > .site`);
    expect(page.length, `${label} at ${width}`).toBeGreaterThan(20);
    expect(ours.length, `${label} at ${width}`).toBe(page.length);
    // Each element that differs, with what differs: the deepest of a run is
    // usually the cause, its ancestors only grew with it.
    page.forEach((one, index) => {
      const drawn = ours[index]!;
      const sameBox = one.box === null || drawn.box === null ? one.box === drawn.box : one.box.every((n, k) => Math.abs(n - drawn.box![k]!) <= 1 / 64);
      if (sameBox && one.tag === drawn.tag && one.block === drawn.block && JSON.stringify(one.style) === JSON.stringify(drawn.style)) return;
      const styles = one.style.flatMap((line, k) => (line === drawn.style[k] ? [] : [`${line} | canvas ${drawn.style[k]}`]));
      differences.push({ width, index, tag: one.tag, block: one.block, page: one.box, canvas: drawn.box, styles });
    });
    elements += page.length;
  }
  await canvas.close();
  return { elements, differences };
}

test(`a page whose settings change with the device lays out on the canvas as on the CMS, at ${WIDTHS.join(", ")}`, async () => {
  const { elements, differences } = await compare(responsive as unknown as PageDocument, "responsive");
  expect(differences.slice(0, 12)).toEqual([]);
  console.log(`canvas parity: responsive page, ${elements} elements over ${WIDTHS.length} widths, the same boxes and styles`);
}, 300_000);

test("with tokens.css left out of the canvas, the comparison finds the page's settings missing", async () => {
  const { differences } = await compare(responsive as unknown as PageDocument, "planted", ["site.css"]);
  expect(differences.length).toBeGreaterThan(100);
  for (const width of WIDTHS) expect(differences.some((d) => d.width === width), String(width)).toBe(true);
  expect(differences.some((d) => d.block === "h1" && d.styles.some((s) => s.startsWith("font-size:")))).toBe(true);
}, 300_000);

test("three random valid pages lay out on the canvas as on the CMS", async () => {
  let elements = 0;
  const pages = randomPage([]).filter((doc) => (doc.sections as unknown[]).length >= 2);
  for (const doc of fc.sample(pages, { seed: 20261002, numRuns: 3 })) {
    const result = await compare(doc as unknown as PageDocument, "random");
    expect(result.differences.slice(0, 12)).toEqual([]);
    elements += result.elements;
  }
  console.log(`canvas parity: 3 random pages, ${elements} elements over ${WIDTHS.length} widths, the same boxes and styles`);
}, 300_000);
