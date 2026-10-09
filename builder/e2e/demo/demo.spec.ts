// The browser demo's story, on its build as GitHub Pages serves it, each
// test a first visit in a browser of its own:
// - the example site is there, its three pages published, the home page
//   open, and the demo's line at the bottom, word for word;
// - an edit is kept in this browser and is there after a reload;
// - two tabs: the one that saves second gets the conflict bar, and Reload
//   takes the other's words;
// - an image goes into the library beside the example site's nine;
// - Publish opens the page as published in a new tab, with its line; its
//   form says what the full system does instead of sending; a link to the
//   site's other page opens it as the demo draws it; Preview shows the
//   draft;
// - the header and footer changed from their panel, opened by a click on
//   the canvas's header: the canvas draws them as they are typed; saved,
//   the pages published in this browser show them with nothing published
//   again, and so does the preview; after a reload they are still there;
// - the screens promise nothing only the full system does (a visitor, a
//   live page, a server), and the notice that says how Publish went can be
//   closed from the keyboard without losing the place;
// - axe on each screen, with no serious finding;
// - and no request leaves the demo's own path: no CMS, no other site.
// With DEMO_SHOTS set to a folder, each screen is photographed there.
import { join } from "node:path";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { DEMO_BASE } from "../../build/demo.ts";
import { readSiteTheme } from "../../build/site-file.ts";
import { axe } from "../helpers/axe.ts";
import { block } from "../helpers/canvas.ts";
import { saveState } from "../helpers/heading.ts";
import { png } from "../helpers/images.ts";

const LINE = "Browser demo: drafts stay in this browser. The full CMS runs on Rails 8, with publishing, shared versions and caching. Source on GitHub.";
const SOURCE = "https://github.com/riccardosapuppo/page-builder-cms";
const PUBLISHED_LINE = "Published in this browser. In the full system, Rails publishes and serves this page, with the cache.";
const PREVIEW_LINE = "The draft, as it would be published. In the full system, Rails draws this preview and never stores it.";
const FORM_LINE = "In the full system, Rails keeps these answers for the CMS's Form responses.";
const FORM_NOT_SENT = "Not sent: in the full system, Rails keeps these answers for the CMS's Form responses.";
const REACH_LINE = "Saved changes show on every page published in this browser at once, with nothing to publish.";

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

test("a first visit opens the example site: three pages, all published, the home page open, and the demo's line at the bottom", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Switch page. Open: Slack Water" }).click();
  const pages = page.getByRole("dialog", { name: "Pages" });
  await expect(pages.locator(".page-row")).toHaveText(["Slack Water/Published", "Winter series/winter-seriesPublished", "Notices/noticesPublished"]);
  await shoot(page, "demo-pages");
  await page.keyboard.press("Escape");

  const line = page.getByRole("complementary", { name: "About this demo" });
  await expect(line).toHaveText(LINE);
  await expect(line.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", SOURCE);
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

test("an image goes into the library from this browser, beside the example site's nine", async ({ page }) => {
  await openDemo(page);
  await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
  await page.getByRole("menuitem", { name: "Media library" }).click();
  const dialog = page.getByRole("dialog", { name: "Media library" });
  const images = dialog.getByRole("radiogroup", { name: "Images" }).getByRole("radio");
  await expect(images).toHaveCount(9);
  await expect(dialog.getByRole("radio", { name: /^hero-dawn\.png, / })).toBeVisible();
  await expect(dialog).toContainText("This browser keeps no smaller copies of them");

  await dialog.getByLabel("Images to upload").setInputFiles({ name: "harbour-wall.png", mimeType: "image/png", buffer: png(1200, 800, (x) => (x < 600 ? [30, 110, 90] : [230, 200, 140])) });
  const tile = dialog.getByRole("radio", { name: "harbour-wall.png, no alt text" });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => tile.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1200);
  await expect(images).toHaveCount(10);
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
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=1`);
  await expect(view.getByRole("complementary", { name: "About this page" })).toHaveText(PUBLISHED_LINE);
  await expect(view.getByRole("heading", { level: 1, name: "Swim when the tide stands still" })).toBeVisible();
  await expect(view).toHaveTitle("Slack Water");
  await expect(notice(page)).toContainText(PUBLISHED_LINE);
  await expect(page.getByRole("link", { name: "View published page" })).toHaveAttribute("href", `${baseURL}${DEMO_BASE}?published=1`);
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
  await expect(view).toHaveURL(`${baseURL}${DEMO_BASE}?published=1`);
  await form.scrollIntoViewIfNeeded();
  await shoot(view, "demo-form");

  // The site's links: the header's to a section of the page shown, the
  // winter series' back to the home page, each as the demo draws it.
  await view.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Questions" }).first().click();
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=1#questions`);
  await view.goto(`${DEMO_BASE}?published=2`);
  await expect(view.getByRole("heading", { level: 1, name: "Winter series" })).toBeVisible();
  await view.getByRole("link", { name: "Back to the club" }).click();
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=1`);
  await expect(view.getByRole("heading", { level: 1, name: "Swim when the tide stands still" })).toBeVisible();

  // Preview: the draft, in a tab of its own.
  await retitleHero(page, "A draft not published yet");
  await saved(page);
  const previewed = context.waitForEvent("page");
  await page.getByRole("link", { name: "Preview" }).click();
  const preview = await previewed;
  await preview.waitForURL(`${baseURL}${DEMO_BASE}?preview=1`);
  await expect(preview.getByRole("complementary", { name: "About this page" })).toHaveText(PREVIEW_LINE);
  await expect(preview.getByRole("heading", { level: 1, name: "A draft not published yet" })).toBeVisible();
  await shoot(preview, "demo-preview");
  await noSeriousFinding(preview, "the draft's preview");
});

// A click in the middle of what the selector finds. The canvas's header
// and footer are inert, so the click reaches the canvas, which opens their
// panel on the value under it.
async function clickMiddle(page: Page, selector: string): Promise<void> {
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// The header and footer as a page draws them: the canvas's own two parts,
// or those of a page the demo draws. Their words as the document holds
// them (textContent: no CSS casing), each link with its address.
async function themeOf(page: Page, around = { header: "header.sw-header", footer: "footer.sw-footer" }) {
  const text = (selector: string) => page.locator(selector).evaluate((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim());
  return {
    name: await text(`${around.header} .sw-brand`),
    links: await page.locator(`${around.header} .sw-nav-links a`).evaluateAll((links) => links.map((link) => [link.textContent, link.getAttribute("href")])),
    button: await page.locator(`${around.header} .sw-btn`).count(),
    footer: await text(`${around.footer} p`),
  };
}

const CANVAS = { header: '.canvas [data-theme-part="header"]', footer: '.canvas [data-theme-part="footer"]' };

test("the header and footer, changed in this browser: the canvas draws them as typed; saved, the published pages show them with nothing published again, and so does the preview; a reload finds them kept", async ({ page, context, baseURL }) => {
  // What the example site starts with: config/site.yml's, as the build
  // gives them to the browser's storage.
  const defaults = readSiteTheme();
  const menu = (defaults.menu as Array<{ label: string; href: string }>).map((link) => [link.label, link.href]);
  const changed = {
    name: "Harbour Swim Club",
    links: [...menu, ["Winter", "/winter-series"]],
    button: 0,
    footer: `Harbour Swim Club, since 1931. ${(defaults.footer as { text: string }).text}`,
  };
  await openDemo(page);
  expect((await themeOf(page, CANVAS)).name).toBe(defaults.name);

  // A click on the site's name in the canvas opens the panel on it.
  await clickMiddle(page, `${CANVAS.header} .sw-brand`);
  const panel = page.getByRole("complementary", { name: "Header and footer" });
  await expect(panel.getByLabel("Site name")).toBeFocused();
  await expect(panel).toContainText(REACH_LINE);

  // Each change on the canvas as it is typed.
  await panel.getByLabel("Site name").fill(changed.name);
  await expect(page.locator(`${CANVAS.header} .sw-brand`)).toHaveText(changed.name);
  // A link to another page of the site, chosen among those offered.
  await panel.getByRole("button", { name: "Add a link" }).click();
  const added = panel.getByRole("group", { name: `Link ${menu.length + 1}` });
  await expect(added.getByLabel("Text")).toBeFocused();
  await page.keyboard.type("Winter");
  const offered = panel.locator('datalist option[value="/winter-series"]');
  await expect(offered).toHaveText("Winter series");
  await added.getByLabel("Link").fill((await offered.getAttribute("value"))!);
  await expect(page.locator(`${CANVAS.header} .sw-nav-links a`).last()).toHaveText("Winter");
  await panel.getByRole("button", { name: "Remove the button" }).click();
  await expect(page.locator(`${CANVAS.header} .sw-btn`)).toHaveCount(0);
  await panel.getByLabel("Bold words").fill("Harbour Swim Club, since 1931.");
  await expect(page.locator(`${CANVAS.footer} strong`)).toHaveText("Harbour Swim Club, since 1931.");
  await expect(panel.getByRole("status").filter({ hasText: "Not saved yet" })).toBeVisible();

  await panel.getByRole("button", { name: "Save" }).click();
  await expect(panel.getByRole("status").filter({ hasText: "Saved for every page" })).toBeVisible();
  expect(await themeOf(page, CANVAS)).toEqual(changed);
  await shoot(page, "demo-header-footer");
  await noSeriousFinding(page, "the Header and footer panel");

  // The home page as published in this browser, with nothing published
  // since the example site went in: the new header and footer.
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "More publish options" }).click();
  await page.getByRole("menuitem", { name: /^View published page/ }).click();
  const view = await opened;
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=1`);
  await expect(view.getByRole("complementary", { name: "About this page" })).toHaveText(PUBLISHED_LINE);
  await expect(view.locator("header.sw-header .sw-brand")).toHaveText(changed.name);
  expect(await themeOf(view)).toEqual(changed);
  // The new link opens the winter series as published, under the same
  // header and footer.
  await view.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Winter", exact: true }).first().click();
  await view.waitForURL(`${baseURL}${DEMO_BASE}?published=2`);
  await expect(view.getByRole("heading", { level: 1, name: "Winter series" })).toBeVisible();
  expect(await themeOf(view)).toEqual(changed);
  await shoot(view, "demo-header-footer-published");

  // The preview of the draft too.
  const previewed = context.waitForEvent("page");
  await page.getByRole("link", { name: "Preview" }).click();
  const preview = await previewed;
  await preview.waitForURL(`${baseURL}${DEMO_BASE}?preview=1`);
  await expect(preview.locator("header.sw-header .sw-brand")).toHaveText(changed.name);
  expect(await themeOf(preview)).toEqual(changed);

  // Kept in this browser: after a reload, the canvas and the panel have
  // them, and so has the page as published.
  await page.reload();
  await expect(page.locator(`${CANVAS.header} .sw-brand`)).toHaveText(changed.name, { timeout: 30_000 });
  expect(await themeOf(page, CANVAS)).toEqual(changed);
  await page.getByRole("complementary", { name: "Settings" }).getByRole("tab", { name: "Page" }).click();
  await page.getByRole("complementary", { name: "Settings" }).getByRole("button", { name: "Header and footer" }).click();
  await expect(panel.getByLabel("Site name")).toHaveValue(changed.name);
  await expect(panel.getByRole("group", { name: `Link ${menu.length + 1}` }).getByLabel("Link")).toHaveValue("/winter-series");
  await expect(panel.getByText("No button in the header.")).toBeVisible();
  await expect(panel.getByLabel("Bold words")).toHaveValue("Harbour Swim Club, since 1931.");
  await view.goto(`${DEMO_BASE}?published=1`);
  await expect(view.locator("header.sw-header .sw-brand")).toHaveText(changed.name);
  expect(await themeOf(view)).toEqual(changed);
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
  // The header and footer's panel, a level below it.
  await page.getByRole("complementary", { name: "Settings" }).getByRole("button", { name: "Header and footer" }).click();
  const headerFooter = page.getByRole("complementary", { name: "Header and footer" });
  await expect(headerFooter).toContainText(REACH_LINE);
  await promisesNothing(page, "the Header and footer panel", found);
  await headerFooter.getByRole("button", { name: "Back to Page" }).click();
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

