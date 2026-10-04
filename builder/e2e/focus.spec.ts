// Where the focus goes after each command, in Chromium: after a delete to
// the neighbour, after an insert to the new block, after an undo to the
// block the undo touched; each by the keyboard and by the mouse, on the
// canvas or on the outline, whichever the person was on. A move from the
// clamp keeps the focus on its key; a picker closed without adding gives
// it back to its "+", or to the block the "+" key opened it from.
import { block, grip, moveOnto, pickUp } from "./helpers/canvas.ts";
import { column, drawer, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

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
  // The last of its column, deleted from its clamp's More: the one before.
  await page.getByRole("toolbar", { name: "Button tools" }).getByRole("button", { name: /^More/ }).click();
  await page.getByRole("menu", { name: "Button actions" }).getByRole("menuitem", { name: /^Delete/ }).click();
  await expect(block(page, "a")).toBeFocused();
  // The only one: its column.
  await block(page, "d").click();
  await page.keyboard.press("Delete");
  await expect(block(page, "c2")).toBeFocused();
  // From the navigator, the focus stays in the tree, on the neighbour's row.
  // (The tree shows the selection's path: a's row is there once a is
  // selected.)
  await block(page, "a").click();
  await drawer(page, "Outline");
  await row(page, "a").click();
  await expect(row(page, "a")).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(row(page, "c1")).toBeFocused();
});

test("after an insert, a paste or a duplicate, the focus is on the new block", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Focus insert", fixture());
  await open(page, id);
  await block(page, "a").click();
  const insert = await drawer(page, "Insert");
  await insert.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Spacer" }).click();
  const spacer = page.locator('.canvas [data-block-id="c1"] > [data-block-type="spacer"]');
  await expect(spacer).toBeFocused();
  await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(1)).toHaveAttribute("data-block-type", "spacer");
  // Insert stays open, a catalogue. Closed from its own button, which the
  // click gave the focus, the focus goes back to where it was before
  // Insert opened, its key in the top bar; the new block stays selected.
  await insert.getByRole("button", { name: "Close Insert" }).click();
  await expect(page.locator(".topbar").getByRole("button", { name: "Insert", exact: true })).toBeFocused();
  await expect(spacer).toHaveAttribute("data-editor-selected", "true");

  await block(page, "b").click();
  await page.keyboard.press("Control+d");
  const quotes = page.locator('.canvas [data-block-id="c1"] > [data-block-type="quote"]');
  await expect(quotes).toHaveCount(2);
  await expect(quotes.nth(1)).toBeFocused();

  // A block dropped from Insert is an insert too.
  await drawer(page, "Insert");
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

test("after a move from the clamp, the focus is on its key; after an add from a +, on the new block; a picker closed gives it back", { tag: "@a11y" }, async ({ page, request }) => {
  const { id } = await makePage(request, "Focus clamp", fixture());
  await open(page, id);
  await block(page, "b").click();
  const clamp = page.getByRole("toolbar", { name: "Quote tools" });
  await clamp.getByRole("button", { name: "Move up" }).click();
  await expect.poll(async () => page.locator('.canvas [data-block-id="c1"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-id")))).toEqual(["b", "a", "c"]);
  await expect(clamp.getByRole("button", { name: "Move up" })).toBeFocused();
  await expect(clamp.getByRole("button", { name: "Move up" })).toHaveAttribute("aria-disabled", "true");
  // From the keyboard: Enter on the key, the focus still on it.
  await page.keyboard.press("ArrowDown");
  await expect(clamp.getByRole("button", { name: "Move down" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(async () => page.locator('.canvas [data-block-id="c1"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-id")))).toEqual(["a", "b", "c"]);
  await expect(clamp.getByRole("button", { name: "Move down" })).toBeFocused();

  // The "+" on its edge: Esc gives the focus back to it; a key of the
  // picker adds, the new block focused and selected.
  const plus = page.getByRole("button", { name: "Add a block after Quote" });
  await plus.click();
  const picker = page.getByRole("dialog", { name: "Add a block after Quote" });
  await expect(picker.getByRole("searchbox", { name: "Search blocks" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(plus).toBeFocused();
  await plus.click();
  await picker.getByRole("button", { name: "Spacer" }).click();
  const added = page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(2);
  await expect(added).toHaveAttribute("data-block-type", "spacer");
  await expect(added).toBeFocused();
  await expect(added).toHaveAttribute("data-editor-selected", "true");
});
