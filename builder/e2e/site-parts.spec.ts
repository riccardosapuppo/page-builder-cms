// The site's header and footer, the site's parts, edited from the editor on
// the run's CMS as a page is, and met as a visitor meets them. A button
// dragged from Insert into the header's column lands there, saved as the
// header's draft; a visitor's browser (helpers/visitor.ts, its HTTP cache
// on), which kept a published page and got a 304 for it before, and while
// the change was only a draft, gets the page with the new header once it
// is published, the CMS drawing again only the page around its blocks and
// the header's blocks that changed, the rest read back from Solid Cache
// (counted in its database, helpers/cms-store.ts). The header the site
// starts with holds one row on a phone 375 wide, published and in the
// editor's phone view. A footer of words that cannot break stays inside a
// window of 375 and of 320, and inside the editor's phone view. A short
// menu in Hebrew, Greek or Cyrillic keeps its links in the row at 1024 and
// 1440. The header opens from a page's Page tab by the keyboard, and axe
// finds nothing serious there. A form pasted into the footer is refused by
// the CMS at its block, in the part's words. The tests of a run share one
// CMS, so each puts the parts back as it found them: their drafts, and
// what every page draws.
import type { APIRequestContext, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block, caption, childIds, moveOnto, pickUp } from "./helpers/canvas.ts";
import { fragments } from "./helpers/cms-store.ts";
import { cms, column, device, draftOf, drawer, expect, heading, makePage, open, saved, section, test, widget, type DraftBlock } from "./helpers/site.ts";
import { visitor } from "./helpers/visitor.ts";

test.use({ viewport: { width: 1440, height: 900 } });

type Kind = "header" | "footer";
interface Part {
  id: number;
  kind: Kind;
  revision: number;
  published: { versionNumber: number } | null;
}
type PartDocument = { schemaVersion: number; title: string; sections: DraftBlock[] };

const PART_FORM = "A header or footer holds no form: a form's answers belong to the page it is on.";

async function partsNow(request: APIRequestContext): Promise<Record<Kind, Part>> {
  const answer = await request.get(`${cms()}/api/pages`);
  expect(answer.status()).toBe(200);
  const { parts } = (await answer.json()) as { parts: Part[] };
  return { header: parts.find((p) => p.kind === "header")!, footer: parts.find((p) => p.kind === "footer")! };
}

// What every page draws for the part: the version it published; its draft
// stands in for a part never published, which every page draws as its
// starter, the part's first draft.
async function liveOf(request: APIRequestContext, part: Part): Promise<PartDocument> {
  if (!part.published) return (await draftOf(request, part.id)).document as PartDocument;
  const version = await request.get(`${cms()}/api/pages/${part.id}/versions/${part.published.versionNumber}`);
  expect(version.status()).toBe(200);
  return ((await version.json()) as { document: PartDocument }).document;
}

async function saveDraft(request: APIRequestContext, id: number, document: PartDocument, saveId: string): Promise<void> {
  const { revision } = await draftOf(request, id);
  const put = await request.put(`${cms()}/api/pages/${id}/draft`, { data: { revision, saveId, document } });
  expect(put.status(), await put.text()).toBe(200);
}

async function publish(request: APIRequestContext, id: number): Promise<void> {
  const answer = await request.post(`${cms()}/api/pages/${id}/publish`, { data: {} });
  expect(answer.status(), await answer.text()).toBe(200);
}

// The part as a test found it: its draft, and what every page drew.
async function found(request: APIRequestContext, kind: Kind) {
  const part = (await partsNow(request))[kind];
  return { part, draft: (await draftOf(request, part.id)).document as PartDocument, live: await liveOf(request, part) };
}

// Put back as found: what every page draws, published again if it
// changed, then the draft.
async function putBack(request: APIRequestContext, was: Awaited<ReturnType<typeof found>>): Promise<void> {
  const now = (await partsNow(request))[was.part.kind];
  if (JSON.stringify(await liveOf(request, now)) !== JSON.stringify(was.live)) {
    await saveDraft(request, now.id, was.live, `put-back-live-${now.kind}`);
    await publish(request, now.id);
  }
  await saveDraft(request, now.id, was.draft, `put-back-${now.kind}`);
}

// A part's document with each block changed by `change`.
function changed(document: PartDocument, change: (block: DraftBlock) => void): PartDocument {
  const copy = structuredClone(document);
  const visit = (block: DraftBlock) => {
    change(block);
    block.children.forEach(visit);
  };
  copy.sections.forEach(visit);
  return copy;
}

// A page whose second section has an anchor.
async function tidePage(request: APIRequestContext) {
  const tides = { ...section("tides", "Tides", [column("c2", [heading("h2", "Today's tides")])]), props: { label: "Tides", anchor: "tides" } };
  return makePage(request, "Tide table", [section("intro", "Intro", [column("c1", [heading("h1", "Swim with the tide")])]), tides]);
}

// How a header fits where it is drawn: each of its blocks inside the page
// root (a published page's window, the canvas's frame), on one row; how
// tall it is; and how far the window scrolls sideways.
async function headerFit(page: Page, header: string) {
  return page.locator(header).evaluate((element) => {
    const root = element.closest(".site")!.getBoundingClientRect();
    const boxes = [...element.querySelectorAll(".w-logo, .w-menu, .w-button")].map((e) => e.getBoundingClientRect());
    const tops = boxes.map((box) => box.top);
    const bottoms = boxes.map((box) => box.bottom);
    return {
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      blocks: boxes.length,
      inside: boxes.every((box) => box.left >= root.left - 0.5 && box.right <= root.right + 0.5),
      // On one row: every block's top above every other's bottom.
      oneRow: Math.max(...tops) < Math.min(...bottoms),
      height: Math.round(element.getBoundingClientRect().height),
    };
  });
}

// How a footer fits where it is drawn: how far the window and the page root
// scroll sideways, and whether its words stay inside the root.
async function footerFit(page: Page, footer: string) {
  return page.locator(footer).evaluate((element) => {
    const site = element.closest(".site")!;
    const root = site.getBoundingClientRect();
    const words = [...element.querySelectorAll(".w-text")].map((e) => e.getBoundingClientRect());
    return {
      window: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      site: site.scrollWidth - site.clientWidth,
      inside: words.length > 0 && words.every((box) => box.left >= root.left - 0.5 && box.right <= root.right + 0.5),
    };
  });
}

test("a button dragged from Insert into the header's column is saved as the header's draft; published, a visitor's next visit gets it around the page's cached blocks", async ({ page, request, browser }) => {
  const header = await found(request, "header");
  const { id, slug } = await tidePage(request);
  await publish(request, id);
  const live = `${cms()}/${slug}`;
  const reader = await visitor(browser);
  try {
    // Visit, then revisit: the browser keeps the page and the CMS, asked
    // with its ETag, sends no page.
    const first = await reader.visit(live);
    expect(first.status).toBe(200);
    await expect(reader.tab.locator("header.sw-header [data-block-type=button]")).toHaveCount(1);
    let before = await fragments();
    const again = await reader.visit(live);
    expect([again.status, again.sent]).toEqual([304, first.etag]);
    expect(await fragments() - before).toBe(0);

    await open(page, header.part.id);
    await expect(page.getByRole("button", { name: "Switch page. Open: Header" })).toBeVisible();
    await drawer(page, "Insert");
    // A header holds no form: Insert offers none.
    await expect(page.getByRole("complementary", { name: "Insert", exact: true }).getByRole("button", { name: "Form" })).toHaveCount(0);
    await pickUp(page, page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Button" }));
    await moveOnto(page, block(page, "header-join"), "bottom");
    await expect(caption(page).locator("strong")).toContainText("will be added to Column 3 in Header");
    await page.mouse.up();
    await expect.poll(() => childIds(page, "header-action")).toHaveLength(2);
    await saved(page);
    expect((await draftOf(request, header.part.id)).document.sections[0]!.children[2]!.children.map((w) => w.type)).toEqual(["button", "button"]);

    // A draft only: the visitor still gets its copy.
    const drafted = await reader.visit(live);
    expect([drafted.status, drafted.sent]).toEqual([304, first.etag]);

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.locator(".notice")).toContainText("Published: every page shows this header at its next visit.");

    // The visitor's next visit, still with the old ETag, gets the new
    // header: the CMS draws again the page around its blocks, and of the
    // header the section, the column that changed and the new button,
    // and reads the rest back from the cache.
    before = await fragments();
    const after = await reader.visit(live);
    expect([after.status, after.sent]).toEqual([200, first.etag]);
    expect(after.etag).not.toBe(first.etag);
    expect(await fragments() - before, "the page's own fragment, and the header's section, column and button").toBe(4);
    await expect(reader.tab.locator("header.sw-header [data-block-type=button]")).toHaveCount(2);
    await expect(reader.tab.getByRole("heading", { name: "Today's tides" })).toBeVisible();
    const kept = await reader.visit(live);
    expect([kept.status, kept.sent]).toEqual([304, after.etag]);
    expect(reader.problems).toEqual([]);
  } finally {
    await reader.close();
    await putBack(request, header);
  }
});

test("the header the site starts with holds one row on a phone, 375 and 320 wide, Menu's pill with its word where its column has room and its icon alone where not, published and in the editor's phone view", async ({ page, request, browser }) => {
  const header = await found(request, "header");
  const { id, slug } = await tidePage(request);
  await publish(request, id);
  for (const width of [375, 320]) {
    const phone = await browser.newContext({ viewport: { width, height: 812 }, locale: "en-US", timezoneId: "UTC" });
    try {
      const tab = await phone.newPage();
      await tab.goto(`${cms()}/${slug}`);
      await tab.evaluate(() => document.fonts.ready);
      await expect(tab.locator("header.sw-header .w-menu-links")).toBeHidden();
      await expect(tab.locator("header.sw-header .sw-menu-button")).toBeVisible();
      // The menu's column, which its container query reads, and the pill.
      const { column, pill } = await tab.locator("header.sw-header .w-menu").evaluate((menu) => ({
        column: menu.getBoundingClientRect().width,
        pill: Math.round(menu.querySelector(".sw-menu-button")!.getBoundingClientRect().width),
      }));
      if (column < 104) {
        // No room for its word: the pill its icon alone, its word for a
        // screen reader.
        expect(pill, `at ${width}`).toBe(40);
        await expect(tab.locator("header.sw-header .w-menu-word")).toHaveCSS("clip-path", "inset(50%)");
      } else {
        expect(pill, `at ${width}`).toBeGreaterThan(40);
        await expect(tab.locator("header.sw-header .w-menu-word")).toHaveCSS("clip-path", "none");
      }
      const fit = await headerFit(tab, "header.sw-header");
      expect(fit, `at ${width}`).toMatchObject({ sideways: 0, blocks: 3, inside: true, oneRow: true });
      expect(fit.height).toBeLessThanOrEqual(72);
      console.log(`site parts: at ${width} the header is ${fit.height} px tall, on one row; Menu's column ${Math.round(column)} px, its pill ${pill}`);
    } finally {
      await phone.close();
    }
  }
  // The editor's phone view draws the header being edited the same way.
  await open(page, header.part.id);
  await device(page, "Phone").click();
  const drawn = await headerFit(page, '.canvas [data-editing-part="header"]');
  expect(drawn).toMatchObject({ blocks: 3, inside: true, oneRow: true });
});

// A footer's text takes any words, so it can hold one that has no place to
// break: it stays inside the window, published and in the editor.
test("a footer of words that cannot break stays inside the window: published at 375 and 320, and in the editor's phone view", async ({ page, request, browser }) => {
  const footer = await found(request, "footer");
  const { slug } = await tidePage(request).then(async (made) => (await publish(request, made.id), made));
  const words = [
    "Write to membership@slackwaterswimmingclub.example",
    "Tide tables: https://www.tidetablesforthenorthbay.example/slackwater?days=7",
    "Schwimmvereinsmitgliedschaftsbedingungen. Gezeitentabellenhinweis.",
  ];
  try {
    for (const text of words) {
      const edited = changed(footer.live, (b) => {
        if (b.type === "text") b.props = { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } };
      });
      await saveDraft(request, footer.part.id, edited, "long-words");
      await publish(request, footer.part.id);
      for (const width of [375, 320]) {
        const phone = await browser.newContext({ viewport: { width, height: 812 }, locale: "en-US", timezoneId: "UTC" });
        try {
          const tab = await phone.newPage();
          await tab.goto(`${cms()}/${slug}`);
          await tab.evaluate(() => document.fonts.ready);
          await expect(tab.locator("footer.sw-footer .w-text")).toHaveText(text);
          expect(await footerFit(tab, "footer.sw-footer"), `"${text}" published, ${width} wide`).toEqual({ window: 0, site: 0, inside: true });
        } finally {
          await phone.close();
        }
      }
      await open(page, footer.part.id);
      await device(page, "Phone").click();
      await expect(page.locator('.canvas [data-editing-part="footer"] .w-text')).toHaveText(text);
      expect(await footerFit(page, '.canvas [data-editing-part="footer"]'), `"${text}" in the editor's phone view`).toEqual({ window: 0, site: 0, inside: true });
    }
  } finally {
    await putBack(request, footer);
  }
});

// A short menu in another alphabet is no longer than the same words in
// Latin letters: its links stay in the row where the design keeps them.
// Each letter outside the face counts what the browser's fallback fonts
// draw it at (schema/header-metrics.json); nothing here asks how a
// visitor's own fonts draw them, only where the page puts the links.
test("short menus in Hebrew, Greek and Cyrillic keep their links in the row at 1024 and at 1440, on the published page and in the editor", async ({ page, request, browser }) => {
  const header = await found(request, "header");
  const { slug } = await tidePage(request).then(async (made) => (await publish(request, made.id), made));
  const menus: Array<{ script: string; labels: string[] }> = [
    { script: "Hebrew", labels: ["שחייה", "גלריה", "עלינו", "שאלות"] },
    { script: "Greek", labels: ["Κολύμπι", "Εικόνες", "Εμείς", "Ερωτήσεις"] },
    { script: "Cyrillic", labels: ["Заплывы", "Галерея", "Встречи", "Вопросы"] },
  ];
  try {
    for (const { script, labels } of menus) {
      const edited = changed(header.live, (b) => {
        if (b.type === "menu") b.props = { ...b.props, items: labels.map((label, k) => ({ label, href: `/#part-${k + 1}` })) };
      });
      await saveDraft(request, header.part.id, edited, `menu-${script.toLowerCase()}`);
      await publish(request, header.part.id);
      for (const width of [1024, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US", timezoneId: "UTC" });
        try {
          const tab = await context.newPage();
          await tab.goto(`${cms()}/${slug}`);
          const menu = tab.locator("header.sw-header .w-menu");
          await expect(menu.locator(".w-menu-links a"), `${script} at ${width}: the links in the row`).toHaveText(labels);
          await expect(menu.locator(".w-menu-links"), `${script} at ${width}`).toBeVisible();
          await expect(menu.locator(".w-menu-fold"), `${script} at ${width}: no Menu beside them`).toBeHidden();
          const sideways = await tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(sideways, `${script} at ${width}: the page scrolls sideways`).toBe(0);
        } finally {
          await context.close();
        }
      }
      // The editor draws the header being edited with the same links.
      await open(page, header.part.id);
      const canvasMenu = page.locator('.canvas [data-editing-part="header"] .w-menu');
      await expect(canvasMenu.locator(".w-menu-links"), `${script} in the editor`).toBeVisible();
      await expect(canvasMenu.locator(".w-menu-fold"), `${script} in the editor: no Menu beside them`).toBeHidden();
    }
  } finally {
    await putBack(request, header);
  }
});

test("from a page's Page tab the header opens by the keyboard, says it is on every page, and leads back; axe finds nothing serious", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await tidePage(request);
  await open(page, id);
  const sidebar = page.getByRole("complementary", { name: "Settings" });
  await sidebar.getByRole("tab", { name: "Page" }).click();
  const entry = sidebar.getByRole("button", { name: "Header", exact: true });
  await entry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Switch page. Open: Header" })).toBeVisible();
  await expect(sidebar).toContainText("On every page");
  await expect(page.locator(".canvas [data-around-page]")).toContainText("Swim with the tide");
  const report = await axe(page);
  for (const line of report.other) console.log(`site parts, the header open: ${line}`);
  expect(report.passes, "axe ran its rules").toBeGreaterThan(10);
  expect(report.serious).toEqual([]);
  const back = sidebar.getByRole("button", { name: "Back to Tide table" });
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Switch page. Open: Tide table" })).toBeVisible();
});

test("a page neither the header nor the footer links to says so in its Page tab; one click opens the header with the page at the end of its menu, its draft saved", async ({ page, request }) => {
  const header = await found(request, "header");
  try {
    const { id, slug } = await makePage(request, "Prices", [section("s", "Prices", [column("c", [heading("h", "What a season costs")])])]);
    await open(page, id);
    const note = page.locator(".not-linked");
    await expect(note).toContainText("Neither the header nor the footer links to this page: visitors reach it only from a link on another page, or by its address.");
    await note.getByRole("button", { name: "Add it to the header’s menu" }).click();
    // The header open, its menu selected, the page its last link.
    await expect(page.locator('.canvas [data-editing-part="header"] [data-block-id="header-menu"]')).toHaveAttribute("data-editor-selected", "true");
    await expect(page.locator(".notice")).toContainText("Prices is the last link of the header’s menu now. Publish the header to put it on every page.");
    await saved(page);
    const menu = (await draftOf(request, header.part.id)).document.sections.flatMap(function all(block: DraftBlock): DraftBlock[] { return [block, ...block.children.flatMap(all)]; }).find((block) => block.id === "header-menu");
    expect(menu, "the header's menu").toBeDefined();
    expect((menu!.props as { items: Array<{ label: string; href: string }> }).items.at(-1)).toEqual({ label: "Prices", href: `/${slug}` });
  } finally {
    await putBack(request, header);
  }
});

test.describe("a form in a part", () => {
  // The CMS's 422, which Chromium lists in the console.
  test.use({ allowConsole: /status of 422 \(Unprocessable (Content|Entity)\)/ });

  test("a form pasted into the footer is refused by the CMS at its block, in the part's words, and the footer's draft keeps none", async ({ page, request, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const footer = await found(request, "footer");
    const form = widget("join-form", "form", { items: [{ name: "email", kind: "email", label: "Email", required: true }], submitLabel: "Join", confirmation: "Thank you." });
    const { id } = await makePage(request, "Join us", [section("s", "Join", [column("c", [heading("h", "Join the club"), form])])]);
    try {
      await open(page, id);
      await block(page, "join-form").click({ button: "right" });
      await page.getByRole("menu", { name: "Form actions" }).getByRole("menuitem", { name: /^Copy/ }).click();
      // The menu writes to the system clipboard without waiting: the
      // footer, a page of its own, is opened once the clipboard holds it.
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"type":"form"');
      await open(page, footer.part.id);
      await block(page, "footer-text").click();
      await expect(block(page, "footer-text")).toBeFocused();
      await page.keyboard.press("Control+v");
      const pasted = page.locator('.canvas [data-editing-part="footer"] [data-block-type="form"]');
      await expect(pasted).toHaveCount(1);
      await expect(page.getByText(PART_FORM).first()).toBeVisible({ timeout: 15_000 });
      const kept = (await draftOf(request, footer.part.id)).document;
      expect(JSON.stringify(kept)).not.toContain('"form"');
    } finally {
      await putBack(request, footer);
    }
  });
});
