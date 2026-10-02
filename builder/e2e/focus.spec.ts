// Where the focus goes after each command, in Chromium: after a delete to
// the neighbour, after an insert to the new block, after an undo to the
// block the undo touched; each by the keyboard and by the mouse, on the
// canvas or on the navigator, whichever the person was on.
import { block, grip, moveOnto, pickUp } from "./helpers/canvas.ts";
import { column, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "First", [
    column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" }), widget("c", "button", { label: "Charlie", href: "#" })]),
    column("c2", [widget("d", "divider", {})]),
  ]),
];

const row = (page: Parameters<typeof block>[0], id: string) => page.locator(`.tree [data-row-id="${id}"]`);

test("after a delete, the focus is on the block now in its place, else the one before, else the column", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Focus delete", fixture());
  await open(page, id);
  await block(page, "b").click();
  await page.keyboard.press("Delete");
  await expect(block(page, "b")).toHaveCount(0);
  await expect(block(page, "c")).toBeFocused();
  await expect(block(page, "c")).toHaveAttribute("data-editor-selected", "true");
  // The last of its column: the one before.
  await page.getByRole("button", { name: "Delete Button" }).click();
  await expect(block(page, "a")).toBeFocused();
  // The only one: its column.
  await block(page, "d").click();
  await page.keyboard.press("Delete");
  await expect(block(page, "c2")).toBeFocused();
  // From the navigator, the focus stays in the tree, on the neighbour's row.
  await row(page, "a").click();
  await expect(row(page, "a")).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(row(page, "c1")).toBeFocused();
});

test("after an insert, a paste or a duplicate, the focus is on the new block", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Focus insert", fixture());
  await open(page, id);
  await block(page, "a").click();
  await page.getByRole("tab", { name: "Add" }).click();
  await page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Spacer" }).click();
  const spacer = page.locator('.canvas [data-block-id="c1"] > [data-block-type="spacer"]');
  await expect(spacer).toBeFocused();
  await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(1)).toHaveAttribute("data-block-type", "spacer");

  await block(page, "b").click();
  await page.keyboard.press("Control+d");
  const quotes = page.locator('.canvas [data-block-id="c1"] > [data-block-type="quote"]');
  await expect(quotes).toHaveCount(2);
  await expect(quotes.nth(1)).toBeFocused();

  // A dropped tile is an insert too.
  await page.getByRole("tab", { name: "Add" }).click();
  await pickUp(page, page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" }));
  await moveOnto(page, block(page, "c2"), "bottom");
  await page.mouse.up();
  const dividers = page.locator('.canvas [data-block-id="c2"] > [data-block-type="divider"]');
  await expect(dividers).toHaveCount(2);
  await expect(dividers.nth(1)).toBeFocused();
});

test("after an undo, the focus is on the block the undo touched", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Focus undo", fixture());
  await open(page, id);
  await block(page, "b").click();
  await page.keyboard.press("Delete");
  await expect(block(page, "c")).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(block(page, "b")).toBeFocused();
  await expect(block(page, "b")).toHaveAttribute("data-editor-selected", "true");

  // A move undone: the block, back where it was.
  await block(page, "a").click();
  await pickUp(page, grip(page));
  await moveOnto(page, block(page, "c2"), "bottom");
  await page.mouse.up();
  await expect(page.locator('.canvas [data-block-id="c2"] > [data-block-id="a"]')).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-id]').first()).toHaveAttribute("data-block-id", "a");
  await expect(block(page, "a")).toBeFocused();

  // A duplicate undone: the block in its place.
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Control+z");
  await expect(block(page, "b")).toBeFocused();
  // Redo puts the copy back, and the focus on it.
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(1)).toBeFocused();
});
