// node tools/site-shots.ts <site address> <folder> [preview page id]
//
// Photographs the published pages of a running CMS, headless, the way the
// design's shots were taken (design/tools/shots.mjs): the home page full
// length at 1280 and at 390 wide, the other example pages, one of News's
// entries, and a draft preview. Compare page.png and page-phone.png with
// design/shots/.
//
// It also checks what a visitor's browser does on the home page:
// - no request leaves the site while the page loads, and nothing is
//   logged as an error (a Content-Security-Policy violation would be);
// - opening the video and then the map asks the provider for exactly one
//   frame each. Those frames are answered inside the browser by
//   Playwright, so nothing reaches the network;
// - no page it photographs scrolls sideways in a window 320 wide, the
//   width WCAG's reflow criterion tests (a 1280 window at 400%).
//
// It starts no server and writes only into <folder>. Exits 1 on a failed
// check, 2 on bad arguments.
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [base, folder, previewId] = process.argv.slice(2);
if (!base || !folder) {
  console.error("usage: node tools/site-shots.ts <site address, e.g. http://127.0.0.1:3900> <folder> [preview page id]");
  process.exit(2);
}
const origin = new URL(base).origin;
const out = resolve(folder);
mkdirSync(out, { recursive: true });

const SHOTS = [
  { name: "page", path: "/", width: 1280, height: 900 },
  { name: "page-phone", path: "/", width: 390, height: 844 },
  { name: "winter-series", path: "/winter-series", width: 1280, height: 900 },
  { name: "winter-series-phone", path: "/winter-series", width: 390, height: 844 },
  { name: "news", path: "/news", width: 1280, height: 900 },
  { name: "news-phone", path: "/news", width: 390, height: 844 },
  { name: "news-entry", path: "/news/winter-series-starts", width: 1280, height: 900 },
  { name: "news-entry-phone", path: "/news/winter-series-starts", width: 390, height: 844 },
  { name: "notices", path: "/notices", width: 1280, height: 900 },
  { name: "notices-tablet", path: "/notices", width: 768, height: 1024 },
  { name: "notices-phone", path: "/notices", width: 390, height: 844 },
  { name: "not-found", path: "/no-such-page", width: 1280, height: 900 },
  ...(previewId ? [{ name: "preview", path: `/preview/${previewId}`, width: 1280, height: 900 }] : []),
];
const PROVIDERS = ["https://www.youtube-nocookie.com/", "https://player.vimeo.com/", "https://www.openstreetmap.org/"];

const problems: string[] = [];
const browser = await chromium.launch();

async function open(width: number, height: number, label: string): Promise<{ page: Page; outside: string[] }> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const outside: string[] = [];
  page.on("console", (m) => {
    // The 404 page's own status is logged as a failed load; it is the answer expected there.
    if ((label === "not-found" || label === "reflow /no-such-page") && m.text().includes("status of 404")) return;
    if (m.type() === "error") problems.push(`${label}: console error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${label}: page error: ${e.message}`));
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    outside.push(url);
    if (PROVIDERS.some((p) => url.startsWith(p))) {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>provider frame, answered by the test</p>" });
    }
    return route.abort();
  });
  return { page, outside };
}

try {
  for (const shot of SHOTS) {
    const { page, outside } = await open(shot.width, shot.height, shot.name);
    const response = await page.goto(origin + shot.path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // A full-length shot shows the whole page at once, but the page's
    // images are loading="lazy": a visitor's browser fetches them as they
    // scroll near. Here they are all fetched, and awaited, before the shot.
    await page.evaluate(async () => {
      const images = Array.from(document.images);
      for (const image of images) image.loading = "eager";
      await Promise.all(images.map((image) => image.complete ? null : new Promise((done) => { image.onload = done; image.onerror = done; })));
      // decoding="async": a loaded image may still be undecoded, and blank in the shot.
      await Promise.all(images.map((image) => image.decode().catch(() => null)));
    });
    const broken = await page.evaluate(() => Array.from(document.images).filter((image) => image.naturalWidth === 0).map((image) => image.src));
    if (broken.length) problems.push(`${shot.name}: images that did not load: ${broken.join(", ")}`);
    const status = response?.status();
    const expected = shot.name === "not-found" ? 404 : 200;
    if (status !== expected) problems.push(`${shot.name}: ${shot.path} answered ${status}, expected ${expected}`);
    await page.screenshot({ path: join(out, `${shot.name}.png`), fullPage: true });
    if (outside.length) problems.push(`${shot.name}: requests outside the site while loading: ${outside.join(", ")}`);
    console.log(`${shot.name}.png: ${shot.path} at ${shot.width} wide, status ${status}`);
    await page.close();
  }

  // Reflow: every page photographed above, 320 wide.
  const paths = [...new Set(SHOTS.map((shot) => shot.path))];
  for (const path of paths) {
    const { page } = await open(320, 800, `reflow ${path}`);
    await page.goto(origin + path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    if (m.scroll > m.client) problems.push(`${path} at 320 wide: scrollWidth ${m.scroll}, clientWidth ${m.client}`);
    await page.close();
  }
  console.log(`reflow: ${paths.length} pages measured at 320 wide`);

  // The click-to-load embeds on the home page.
  const { page, outside } = await open(1280, 900, "embeds");
  await page.goto(origin + "/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("[data-block-type=video] summary").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  const before = outside.length;
  await page.locator("[data-block-type=video] summary").click();
  await page.waitForTimeout(1000);
  const afterVideo = outside.slice(before);
  await page.locator("[data-block-type=map] summary").click();
  await page.waitForTimeout(1000);
  const afterMap = outside.slice(before + afterVideo.length);
  await page.locator("[data-block-type=video]").screenshot({ path: join(out, "video-open.png") });
  await page.locator("[data-block-type=map]").screenshot({ path: join(out, "map-open.png") });
  console.log(`embeds: before any click ${before} request(s) to a provider; video click ${afterVideo.length} [${afterVideo.join(", ")}]; map click ${afterMap.length} [${afterMap.join(", ")}]`);
  if (before !== 0) problems.push(`embeds: ${before} request(s) left the site before any click`);
  if (afterVideo.length !== 1 || !afterVideo[0]?.startsWith("https://www.youtube-nocookie.com/embed/")) problems.push("embeds: opening the video did not ask for exactly its frame");
  if (afterMap.length !== 1 || !afterMap[0]?.startsWith("https://www.openstreetmap.org/export/embed.html")) problems.push("embeds: opening the map did not ask for exactly its frame");
  await page.close();
} finally {
  await browser.close();
}

if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
console.log(`RESULT: ${SHOTS.length} shots in ${out}, no request left the site before a click, embeds load on click, no page scrolls sideways at 320 wide`);
