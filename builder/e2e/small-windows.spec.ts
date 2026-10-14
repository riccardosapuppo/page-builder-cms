// The editor in a phone's window and in a tablet's (src/editor/layout-mode.ts),
// in Chromium, with a finger. On a phone: the page at the phone's width,
// whole; the keys in a bar at the foot; Insert, the Outline, History, the
// settings and the "+" picker sheets that rise from it, the window's width;
// the top bar's windows inside the window; nothing of the editor reaching
// past the window's sides; the top bar the mark, the page's title with
// whether it is live under it, both on the left, and Publish on the right,
// the save state drawn only when a save waits or fails. On a tablet: the approved layout, its panels
// over the canvas, the page keeping its width, the bottom line's path whole.
// With a finger anywhere: keys 44 square at least, and no keyboard opened
// for the person (no field focused unasked).
import type { Locator, Page } from "@playwright/test";
import { axe } from "./helpers/axe.ts";
import { block, childIds } from "./helpers/canvas.ts";
import { column, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

const words = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const content = () => [
  section("s1", "Hero", [column("c1", [heading("h1", "Swim at slack water"), widget("t1", "text", { doc: words("Dawn swims and a winter series.") })])]),
  section("s2", "Course", [
    column("c2", [heading("h2", "The course"), widget("q2", "quote", { text: "Cold, then glad." }), widget("b2", "button", { label: "Join", href: "#" })]),
    column("c3", [heading("h3", "Times")]),
  ]),
];

const bar = (page: Page) => page.getByRole("navigation", { name: "Editor tools" });
const key = (page: Page, name: string) => bar(page).getByRole("button", { name, exact: true });

// Where an element stands, to the pixel.
async function box(locator: Locator) {
  const b = (await locator.boundingBox())!;
  return { left: Math.round(b.x), top: Math.round(b.y), right: Math.round(b.x + b.width), bottom: Math.round(b.y + b.height), width: Math.round(b.width), height: Math.round(b.height) };
}

// Where an element stands once it has stopped moving: a sheet rises as it
// opens, and grows or shrinks, in a fifth of a second.
async function settled(locator: Locator) {
  let now = await box(locator);
  await expect.poll(async () => {
    const before = await box(locator);
    await new Promise((done) => setTimeout(done, 150));
    now = await box(locator);
    return JSON.stringify(now) === JSON.stringify(before);
  }).toBe(true);
  return now;
}

// How far the window and the canvas scroll sideways: never at all.
const sideways = (page: Page) => page.evaluate(() => {
  const canvas = document.querySelector(".canvas")!;
  return { window: document.documentElement.scrollWidth - document.documentElement.clientWidth, canvas: canvas.scrollWidth - canvas.clientWidth };
});

// Whether the focus is on a field that takes typing: a phone would open
// its keyboard for it.
const typing = (page: Page) => page.evaluate(() => document.activeElement?.matches("input:not([type=checkbox], [type=radio]), textarea, [contenteditable='true']") ?? false);

// Each of these at least 44 by 44.
async function fingerSized(locators: Locator[], why: string) {
  expect(locators.length, why).toBeGreaterThan(0);
  for (const each of locators) {
    const b = await box(each);
    expect([b.width >= 44, b.height >= 44], `${why}: ${await each.getAttribute("aria-label") ?? await each.innerText()} is ${b.width} by ${b.height}`).toEqual([true, true]);
  }
}

async function noSeriousFinding(page: Page, state: string) {
  const report = await axe(page);
  for (const line of report.other) console.log(`${state}: ${line}`);
  expect(report.passes, `${state}: axe ran its rules`).toBeGreaterThan(10);
  expect(report.serious, state).toEqual([]);
}

test.describe("in a phone's window, 390 by 844, with a finger", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the page at the phone's width, whole; the keys in a bar at the foot, a finger's size; no panel over the canvas", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone opens", content());
    await open(page, id);
    await expect(page.locator(".app")).toHaveAttribute("data-layout", "narrow");
    // The phone's page, drawn at its size, as wide as the canvas.
    await expect(page.locator(".canvas .frame")).not.toHaveAttribute("data-scale");
    expect((await box(page.locator(".canvas .site"))).width).toBe((await box(page.locator(".canvas"))).width);
    await expect(bar(page).getByRole("button")).toHaveText(["Insert", "Outline", "Undo", "Redo", "Settings", "More"]);
    await fingerSized(await bar(page).getByRole("button").all(), "the bar's keys");
    expect((await box(bar(page))).bottom).toBe(844);
    // The top bar keeps the mark's menu, the page and Publish; its keys
    // for the panels are the bar's now.
    await expect(page.getByRole("button", { name: /^Switch page\. Open: Phone opens/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "More publish options" })).toBeVisible();
    for (const each of await page.locator(".topbar [data-drawer], .topbar [data-sidebar]").all()) await expect(each).toBeHidden();
    await expect(page.getByRole("complementary")).toHaveCount(0);
    // The bottom line, kept for its live region, is not drawn: no key in
    // it for a Tab to reach unseen.
    expect(await page.locator(".statusbar").evaluate((line) => [...line.querySelectorAll("button, a[href], input, [tabindex]:not([tabindex='-1'])")].filter((key) => key.getClientRects().length > 0).length)).toBe(0);
    expect(await sideways(page)).toEqual({ window: 0, canvas: 0 });
    await noSeriousFinding(page, "a phone, nothing open");
  });

  test.describe("with a save the network loses", () => {
    // The browser's own line for the request the test drops.
    test.use({ allowConsole: /net::ERR_INTERNET_DISCONNECTED/ });

    test("the top bar is the mark, a key of its own, the page's title with whether it is live under it, both on the left, and Publish on the right; the save state is said, and drawn only when a save waits or fails", async ({ page, request }) => {
      const { id } = await makePage(request, "Phone bar, with a title long enough to be cut short", content());
      await open(page, id);
      const mark = await box(page.getByRole("button", { name: "Page Builder CMS menu" }));
      expect([mark.left, mark.width, mark.height]).toEqual([8, 44, 44]);
      await expect(page.locator(".tb-mark .i"), "no chevron beside the mark").toBeHidden();
      const title = page.getByRole("button", { name: /^Switch page\. Open: Phone bar/ });
      const button = await box(title);
      const words = await box(title.locator(".tb-page-title"));
      const live = await box(title.locator(".tb-status"));
      expect(button.left).toBeGreaterThanOrEqual(mark.right);
      expect(button.height).toBe(44);
      expect(live.left, "the title and the line under it start together").toBe(words.left);
      expect(live.top).toBeGreaterThanOrEqual(words.bottom);
      await expect(title.locator(".tb-title-row > .i").first(), "no page icon before the title").toBeHidden();
      expect(await title.locator(".tb-page-title").evaluate((element) => element.scrollWidth > element.clientWidth), "the long title is cut short").toBe(true);
      const more = await box(page.getByRole("button", { name: "More publish options" }));
      const publish = await box(page.getByRole("button", { name: "Publish", exact: true }));
      expect(Math.abs(more.right - (390 - 8)), `Publish's choices end at the bar's margin, at ${more.right}`).toBeLessThanOrEqual(1);
      expect(button.right).toBeLessThanOrEqual(publish.left);
      // All saved: said to a screen reader, not drawn.
      const state = page.locator(".topbar .save-state");
      await expect(state).toHaveText("Saved");
      expect((await box(state)).width).toBeLessThanOrEqual(1);
      // A save the network loses: its icon, between the title and Publish.
      await page.route("**/api/pages/*/draft", (route) => (route.request().method() === "PUT" ? route.abort("internetdisconnected") : route.fallback()));
      await block(page, "q2").tap();
      await page.keyboard.press("Delete");
      await expect(state).toHaveText(/^Not saved, retrying/);
      const failing = await box(state.locator(".i"));
      expect([failing.width, failing.height]).toEqual([20, 20]);
      expect([failing.left >= button.left, failing.right <= publish.left], `the icon at ${failing.left} to ${failing.right}`).toEqual([true, true]);
      expect(await sideways(page)).toEqual({ window: 0, canvas: 0 });
      await noSeriousFinding(page, "a phone, a save the network lost");
    });
  });

  test("a tap selects a block; Settings rises as a sheet on the bar, the grip makes it tall, and a drag down closes it", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone settings", content());
    await open(page, id);
    await block(page, "h2").tap();
    await expect(block(page, "h2")).toHaveAttribute("data-editor-selected", "true");
    await key(page, "Settings").tap();
    const sheet = page.getByRole("complementary", { name: "Settings" });
    await expect(sheet).toBeVisible();
    await expect(key(page, "Settings")).toHaveAttribute("aria-pressed", "true");
    await expect(sheet.getByRole("tab", { name: "Block" })).toHaveAttribute("aria-selected", "true");
    // The window's width, standing on the bar once it has risen; the
    // focus on its tab.
    const low = await settled(sheet);
    expect([low.left, low.width, low.bottom]).toEqual([0, 390, (await box(bar(page))).top]);
    expect(await typing(page)).toBe(false);
    await noSeriousFinding(page, "a phone, the settings' sheet");
    // The grip makes it tall, under the top bar; a drag down closes it.
    const grip = sheet.getByRole("button", { name: "Settings: full height" });
    await fingerSized([grip], "the grip");
    await grip.tap();
    await expect(grip).toHaveAttribute("aria-pressed", "true");
    const tall = await settled(sheet);
    expect(tall.height).toBeGreaterThan(low.height + 100);
    expect(tall.top).toBeGreaterThanOrEqual((await box(page.locator(".topbar"))).bottom);
    const from = await box(grip);
    await page.mouse.move(from.left + from.width / 2, from.top + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.left + from.width / 2, from.top + 60, { steps: 4 });
    await page.mouse.move(from.left + from.width / 2, from.top + 140, { steps: 4 });
    await page.mouse.up();
    await expect(sheet).toHaveCount(0);
    await expect(key(page, "Settings")).toHaveAttribute("aria-pressed", "false");
    // Opened again, it is at its own height.
    await key(page, "Settings").tap();
    await expect(sheet.getByRole("button", { name: "Settings: full height" })).toHaveAttribute("aria-pressed", "false");
  });

  test("Insert rises as a sheet with no field focused; a tap on a key adds its block after the selection", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone insert", content());
    await open(page, id);
    await block(page, "q2").tap();
    await key(page, "Insert").tap();
    const sheet = page.getByRole("complementary", { name: "Insert", exact: true });
    await expect(sheet).toBeVisible();
    expect(await typing(page)).toBe(false);
    await expect(sheet.locator(".drawer-where")).toHaveText("Tap to add after Quote in Column 1 of Course, or hold a key and drag it to any column.");
    expect((await box(sheet)).width).toBe(390);
    await sheet.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" }).tap();
    await expect(page.locator('.canvas [data-block-id="c2"] > [data-block-type="divider"]')).toHaveCount(1);
    const order = await childIds(page, "c2");
    expect([order[0], order[1], order[3]]).toEqual(["h2", "q2", "b2"]);
    expect(await sideways(page)).toEqual({ window: 0, canvas: 0 });
  });

  test("a key of Insert dragged onto the page: its sheet gives way, and the block lands where the sheet stood", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone insert drag", content());
    await open(page, id);
    await key(page, "Insert").tap();
    const sheet = page.getByRole("complementary", { name: "Insert", exact: true });
    const cover = await settled(sheet);
    // The quote, under the sheet: where it will be dropped.
    const quote = await box(block(page, "q2"));
    const aim = { x: quote.left + quote.width / 2, y: quote.top + quote.height * 0.75 };
    expect(aim.y > cover.top && aim.y < cover.bottom, `the quote at ${aim.y}, the sheet from ${cover.top} to ${cover.bottom}`).toBe(true);
    const tile = await box(sheet.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" }));
    await page.mouse.move(tile.left + tile.width / 2, tile.top + tile.height / 2);
    await page.mouse.down();
    await page.mouse.move(tile.left + tile.width / 2 + 12, tile.top + tile.height / 2, { steps: 3 });
    await expect(sheet).toHaveCSS("opacity", "0");
    await page.mouse.move(aim.x, aim.y, { steps: 10 });
    await page.mouse.up();
    await expect(page.locator('.canvas [data-block-id="c2"] > [data-block-type="divider"]')).toHaveCount(1);
    const order = await childIds(page, "c2");
    expect([order[0], order[1], order[3]]).toEqual(["h2", "q2", "b2"]);
  });

  test("the \"+\" on the page opens its picker as a sheet on the bar, its line in view above it, a key focused and no field", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone plus", content());
    await open(page, id);
    await block(page, "h2").tap();
    await page.getByRole("button", { name: "Add a block after Heading" }).tap();
    const picker = page.locator(".picker");
    await expect(picker).toBeVisible();
    const sheet = await box(picker);
    expect([sheet.left, sheet.width, sheet.bottom]).toEqual([0, 390, (await box(bar(page))).top]);
    // Its line on the page, in view between the top bar and the sheet.
    const line = await box(page.locator(".canvas .ins-slot"));
    expect(line.top).toBeGreaterThanOrEqual((await box(page.locator(".canvas"))).top);
    expect(line.bottom).toBeLessThanOrEqual(sheet.top);
    await expect(picker.locator('[data-key-index="0"]')).toBeFocused();
    await expect(picker.locator(".picker-keys")).toBeHidden();
    // The selection's toolbar steps aside while it is open.
    await expect(page.locator(".canvas .clamp")).toBeHidden();
    await picker.locator(".pkeys").getByRole("button", { name: "Text", exact: true }).tap();
    await expect(picker).toHaveCount(0);
    await expect(page.locator('.canvas [data-block-id="c2"] > [data-block-type="text"]')).toHaveCount(1);
    // Its close key, a finger's size, in its head: it adds nothing.
    await block(page, "h2").tap();
    await page.getByRole("button", { name: "Add a block after Heading" }).tap();
    const close = picker.getByRole("button", { name: /^Close: / });
    await fingerSized([close], "the picker's close key");
    await close.tap();
    await expect(picker).toHaveCount(0);
    expect(await childIds(page, "c2")).toHaveLength(4);
  });

  test("More holds Preview, History, the device and Block edges; a device changes the page, and a press outside closes it", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone more", content());
    await open(page, id);
    await key(page, "More").tap();
    const more = page.getByRole("dialog", { name: "More" });
    await expect(more).toBeVisible();
    await expect(more.getByRole("button", { name: "History" })).toBeVisible();
    await expect(more.getByRole("button", { name: "Block edges" })).toBeVisible();
    await fingerSized(await more.getByRole("radio").all(), "the devices");
    await more.getByRole("radio", { name: /^Tablet/ }).tap();
    await expect(page.locator(".canvas .site")).toHaveCSS("width", "768px");
    await expect(page.locator(".canvas .frame")).toHaveAttribute("data-scale", /^0\.5/);
    await more.getByRole("radio", { name: /^Phone/ }).tap();
    await expect(page.locator(".canvas .frame")).not.toHaveAttribute("data-scale");
    await block(page, "h1").tap();
    await expect(more).toHaveCount(0);
    await expect(block(page, "h1")).toHaveAttribute("data-editor-selected", "true");
    // History from it, a sheet as the others.
    await key(page, "More").tap();
    await more.getByRole("button", { name: "History" }).tap();
    await expect(page.getByRole("complementary", { name: "History", exact: true })).toBeVisible();
    await expect(page.locator(".hint-keys kbd")).toHaveCount(0);
  });

  test("Undo and Redo on the bar take a change back and bring it again", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone undo", content());
    await open(page, id);
    await expect(key(page, "Undo")).toHaveAttribute("aria-disabled", "true");
    await block(page, "q2").tap();
    await page.keyboard.press("Delete");
    await expect(block(page, "q2")).toHaveCount(0);
    await key(page, "Undo").tap();
    await expect(block(page, "q2")).toHaveCount(1);
    await key(page, "Redo").tap();
    await expect(block(page, "q2")).toHaveCount(0);
  });

  test("the Outline as a sheet, every row inside it; a tap on a row selects its block", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone outline", content());
    await open(page, id);
    await block(page, "h1").tap();
    await key(page, "Outline").tap();
    const sheet = page.getByRole("complementary", { name: "Outline", exact: true });
    await expect(sheet).toBeVisible();
    expect((await box(sheet)).width).toBe(390);
    expect(await sheet.locator(".t-row").evaluateAll((rows) => rows.filter((row) => row.getBoundingClientRect().right > 390.5).length)).toBe(0);
    await fingerSized(await sheet.locator(".t-row").all(), "the rows");
    await sheet.getByRole("treeitem", { name: /^Text: Dawn swims/ }).locator(":scope > .t-row").tap();
    await expect(block(page, "t1")).toHaveAttribute("data-editor-selected", "true");
    await noSeriousFinding(page, "a phone, the Outline's sheet");
  });

  test("writing on the page closes the sheet over it, and the bar gives the keyboard its room until the writing ends", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone writing", content());
    await open(page, id);
    await block(page, "t1").tap();
    await key(page, "Settings").tap();
    const sheet = page.getByRole("complementary", { name: "Settings" });
    await sheet.getByRole("button", { name: "Edit on the page" }).tap();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('.canvas [data-block-id="t1"] .rte')).toBeFocused();
    await expect(bar(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(bar(page)).toBeVisible();
  });

  test("the top bar's windows stand inside the window, a key focused in each, no field", async ({ page, request }) => {
    const { id } = await makePage(request, "Phone windows", content());
    await open(page, id);
    const inside = async (locator: Locator, why: string) => {
      await expect(locator, why).toBeVisible();
      const b = await box(locator);
      expect([b.left >= 0, b.right <= 390], `${why}: ${b.left} to ${b.right}`).toEqual([true, true]);
      expect(await typing(page), why).toBe(false);
      await page.keyboard.press("Escape");
      await expect(locator, why).toBeHidden();
    };
    await page.getByRole("button", { name: /^Switch page\. Open:/ }).tap();
    await inside(page.locator(".pop-pages"), "the pages");
    await page.getByRole("button", { name: "More publish options" }).tap();
    await inside(page.locator(".menu-publish"), "Publish's choices");
    await page.getByRole("button", { name: "Page Builder CMS menu" }).tap();
    await inside(page.locator(".menu-app"), "the mark's menu");
    await block(page, "h2").tap();
    await page.getByRole("button", { name: "Heading: block menu" }).tap();
    // Its first item that can be chosen has the focus, and no ring: there
    // are no arrows to move with.
    await expect(page.getByRole("menu", { name: "Heading: block menu" }).locator("[role=menuitem]:focus")).toHaveCount(1);
    await expect(page.locator(".menu [data-focus-ring]")).toHaveCount(0);
    await inside(page.getByRole("menu", { name: "Heading: block menu" }), "the toolbar's block menu");
    await expect(page.locator(".menu .keys")).toHaveCount(0);
    // The mark's menu offers no keyboard shortcuts to a phone.
    await page.getByRole("button", { name: "Page Builder CMS menu" }).tap();
    await expect(page.getByRole("menuitem", { name: "Site style" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Keyboard shortcuts" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });
});

test.describe("in a tablet's window, 820 by 1180, with a finger", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test("the sidebar is a panel over the canvas, shut at first; it and the Outline open over the page, which keeps its width, one at a time", async ({ page, request }) => {
    const { id } = await makePage(request, "Tablet panels", content());
    await open(page, id);
    await expect(page.locator(".app")).toHaveAttribute("data-layout", "medium");
    await expect(page.getByRole("complementary", { name: "Settings" })).toHaveCount(0);
    const frame = page.locator(".canvas .frame");
    const before = await box(frame);
    await page.getByRole("button", { name: "Settings sidebar" }).tap();
    const side = page.getByRole("complementary", { name: "Settings" });
    await expect(side).toBeVisible();
    expect(await box(frame)).toEqual(before);
    expect((await box(side)).left).toBeLessThan(before.right);
    // One panel at a time: the Outline closes the sidebar, and the sidebar
    // the Outline.
    await page.locator('.topbar [data-drawer="outline"]').tap();
    const outline = page.getByRole("complementary", { name: "Outline", exact: true });
    await expect(outline).toBeVisible();
    await expect(side).toHaveCount(0);
    expect(await box(frame)).toEqual(before);
    await page.getByRole("button", { name: "Settings sidebar" }).tap();
    await expect(side).toBeVisible();
    await expect(outline).toHaveCount(0);
    await page.locator('.topbar [data-drawer="outline"]').tap();
    await expect(outline).toBeVisible();
    expect(await sideways(page)).toEqual({ window: 0, canvas: 0 });
    await fingerSized(await page.locator(".topbar .ibtn:visible").all(), "the top bar's keys");
    await noSeriousFinding(page, "a tablet, the Outline open");
  });

  test("the bottom line keeps the selection's path whole, and its hint never over it", async ({ page, request }) => {
    const { id } = await makePage(request, "Tablet path", content());
    await open(page, id);
    const crumbs = page.locator(".statusbar .crumbs");
    const nav = await box(crumbs);
    // Nothing selected: the page's step, and the hint after it or none.
    const first = await box(crumbs.locator(".crumb").first());
    const hint = crumbs.locator(".crumbs-hint");
    await expect(hint).toHaveText("Nothing selected. Tap a block to select it.");
    const said = await box(hint);
    if (said.top < nav.bottom) expect(said.left).toBeGreaterThanOrEqual(first.right);
    // Three steps down: every step inside the line, the last whole.
    await block(page, "h3").tap();
    const steps = crumbs.locator(".crumb");
    await expect(steps).toHaveText(["Page", "Course", "Column 2", "Heading"]);
    const line = await box(crumbs);
    for (const step of await steps.all()) {
      const b = await box(step);
      expect([b.left >= line.left, b.right <= line.right], `${await step.innerText()}: ${b.left} to ${b.right} in ${line.left} to ${line.right}`).toEqual([true, true]);
    }
    expect(await steps.last().locator(".crumb-name").evaluate((name) => name.scrollWidth <= name.clientWidth)).toBe(true);
  });
});

test.describe("in a tablet's window held sideways, 1180 by 820, with a finger", () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  test("the approved layout, the sidebar beside the canvas; the toolbar's keys and the \"+\" take a finger's press", async ({ page, request }) => {
    const { id } = await makePage(request, "Tablet sideways", content());
    await open(page, id);
    await expect(page.locator(".app")).toHaveAttribute("data-layout", "wide");
    const side = page.getByRole("complementary", { name: "Settings" });
    await expect(side).toBeVisible();
    expect((await box(side)).left).toBeGreaterThanOrEqual((await box(page.locator(".canvas"))).right);
    await block(page, "h2").tap();
    await fingerSized(await page.locator(".canvas .clamp > button").all(), "the toolbar's keys");
    // The "+" on the selection's edge takes a press beside it.
    const plus = await box(page.getByRole("button", { name: "Add a block after Heading" }));
    const beside = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[aria-label='Add a block after Heading']") !== null, [plus.right + 6, plus.top + plus.height / 2]);
    expect(beside).toBe(true);
    await fingerSized(await page.locator(".topbar .ibtn:visible").all(), "the top bar's keys");
  });
});
