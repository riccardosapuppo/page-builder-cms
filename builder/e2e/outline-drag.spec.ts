// The Outline's rows dragged, in Chromium against the run's CMS. With the
// mouse: a widget's row taken onto another column's row, the canvas
// drawing the widget there as itself before it is dropped, then one
// command that Ctrl+Z puts back; a section's row taken above another's; a
// column's row taken onto a widget's row of another section, landing
// beside that widget's column. With the keyboard: Space on a row picks its
// block up, the arrows move it as on the canvas, Space drops it and the
// focus stays on its row; Esc puts it back.
import type { Page } from "@playwright/test";
import { block, caption, childIds } from "./helpers/canvas.ts";
import { column, draftOf, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// First: Tides and a divider in Column 1, a quote in Column 2. Second:
// Winter in Column 1, a quote of its own in Column 2.
const fixture = () => [
  section("s1", "First", [
    column("c1", [heading("h1", "Tides"), widget("d1", "divider", {})]),
    column("c2", [widget("q1", "quote", { text: "Cold, then glad.", attribution: "A member" })]),
  ]),
  section("s2", "Second", [
    column("c3", [heading("h3", "Winter")]),
    column("c4", [widget("q2", "quote", { text: "Out by eight.", attribution: "The club" })]),
  ]),
];

async function outline(page: Page) {
  await page.locator(".topbar").getByRole("button", { name: "Outline", exact: true }).click();
  await expect(page.getByRole("tree", { name: "Page structure" })).toBeVisible();
}
const row = (page: Page, id: string) => page.locator(`.tree [data-row-id="${id}"] > .t-row`);
const item = (page: Page, id: string) => page.locator(`.tree [data-row-id="${id}"]`);

// The mouse pressed on a row, past the drag's start distance, then onto a
// point of another row: a fraction of its height from its top.
async function dragRow(page: Page, from: string, to: string, fraction: number) {
  const a = (await row(page, from).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 6, a.y + a.height / 2 + 6, { steps: 3 });
  const b = (await row(page, to).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * fraction, { steps: 10 });
  await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height * fraction, { steps: 2 });
}

const sectionIds = (page: Page) => page.locator(".canvas .sw-main > [data-block-type=section]").evaluateAll((sections) => sections.map((s) => s.getAttribute("data-block-id")));

test("a widget's row onto another column's row: the canvas draws it there as itself before the drop; dropped, one command that Ctrl+Z puts back", async ({ page, request }) => {
  const { id } = await makePage(request, "Outline drag", fixture());
  await open(page, id);
  await outline(page);
  await row(page, "s1").locator(".t-chev").click();
  await row(page, "c1").locator(".t-chev").click();
  await dragRow(page, "h1", "c2", 0.5);
  await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 2 in First, after Quote.");
  // Column 2 opened for the line; the pointer, moved again on its row,
  // still says the same place.
  await expect(item(page, "c2")).toHaveAttribute("aria-expanded", "true");
  const c2 = (await row(page, "c2").boundingBox())!;
  await page.mouse.move(c2.x + c2.width / 2 - 10, c2.y + c2.height * 0.5, { steps: 3 });
  await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 2 in First, after Quote.");
  // Live: the heading itself in Column 2 on the canvas, framed and named,
  // and nothing left where it stood.
  await expect(page.locator('.canvas [data-block-id="c2"] [data-block-id="h1"][data-drag-live]')).toHaveCount(1);
  await expect(page.locator('.canvas [data-block-id="h1"][data-drag-live] .drop-label')).toHaveText("Heading");
  await expect.poll(() => childIds(page, "c1")).toEqual(["d1"]);
  // In the tree, the row dimmed where it stands, the line after the quote.
  await expect(item(page, "h1")).toHaveClass(/t-moving/);
  await expect(item(page, "q1").locator(":scope > .t-line")).toHaveAttribute("data-at", "after");
  await page.mouse.up();
  await expect(page.locator(".canvas [data-drag-live]")).toHaveCount(0);
  await expect.poll(() => childIds(page, "c2")).toEqual(["q1", "h1"]);
  await expect(item(page, "h1")).toBeFocused();
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children.map((c) => c.children.map((w) => w.id))).toEqual([["d1"], ["q1", "h1"]]);
  await page.keyboard.press("Control+z");
  await expect.poll(() => childIds(page, "c1")).toEqual(["h1", "d1"]);
  await expect.poll(() => childIds(page, "c2")).toEqual(["q1"]);
});

test("a section's row above another's moves the section; a column's row onto a widget's row of another section lands beside that widget's column", async ({ page, request }) => {
  const { id } = await makePage(request, "Outline sections", fixture());
  await open(page, id);
  await outline(page);
  await dragRow(page, "s2", "s1", 0.1);
  await expect(caption(page).locator("strong")).toHaveText("Second will move to the page, at the top.");
  await expect.poll(() => sectionIds(page)).toEqual(["s2", "s1"]);
  await page.mouse.up();
  await saved(page);
  expect((await draftOf(request, id)).document.sections.map((s) => s.id)).toEqual(["s2", "s1"]);

  // Second, now first, opened; First opened down to Tides.
  await row(page, "s2").locator(".t-chev").click();
  await row(page, "s1").locator(".t-chev").click();
  await row(page, "c1").locator(".t-chev").click();
  await dragRow(page, "c4", "h1", 0.8);
  await expect(caption(page).locator("strong")).toHaveText("Column 2 will move to First, after Column 1.");
  await page.mouse.up();
  await expect.poll(() => childIds(page, "s1")).toEqual(["c1", "c4", "c2"]);
  await expect.poll(() => childIds(page, "s2")).toEqual(["c3"]);
});

test("Space on a row picks its block up, the arrows move it, Space drops it with the focus on its row; Esc puts it back", async ({ page, request }) => {
  const { id } = await makePage(request, "Outline keys", fixture());
  await open(page, id);
  await outline(page);
  await row(page, "s1").locator(".t-chev").click();
  await row(page, "c1").locator(".t-chev").click();
  await row(page, "d1").click();
  await expect(item(page, "d1")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(caption(page).locator("strong")).toHaveText("Divider is where it was.");
  await page.keyboard.press("ArrowUp");
  await expect(caption(page).locator("strong")).toHaveText("Divider will move to Column 1 in First, at the top.");
  // The canvas draws it there as itself, while the focus stays on the row.
  await expect.poll(() => childIds(page, "c1")).toEqual(["d1", "h1"]);
  await expect(page.locator('.canvas [data-block-id="d1"][data-drag-live]')).toHaveCount(1);
  await expect(item(page, "d1")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator(".canvas [data-drag-live]")).toHaveCount(0);
  await expect(item(page, "d1")).toBeFocused();
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children.map((w) => w.id)).toEqual(["d1", "h1"]);

  // Esc: back where it was, nothing changed, the focus on its row.
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await expect(caption(page).locator("strong")).toHaveText("Divider will move to Column 1 in First, after Heading.");
  await page.keyboard.press("Escape");
  await expect(caption(page)).toHaveText("Cancelled: Divider is back where it was.");
  await expect.poll(() => childIds(page, "c1")).toEqual(["d1", "h1"]);
  await expect(item(page, "d1")).toBeFocused();
  // The tree's own arrows are back: Down goes to the next row.
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "h1")).toBeFocused();
  await expect(block(page, "h1")).toHaveAttribute("data-editor-selected", "true");
});
