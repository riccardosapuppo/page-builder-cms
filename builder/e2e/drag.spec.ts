// Drag and drop in Chromium, with the mouse and with the keyboard, against
// the run's own CMS: a widget reordered in its column, moved to another
// column and another section, dropped into an empty column; tiles of the
// widget panel dropped on the page; drops the page refuses; a drag
// cancelled with Esc. Each drop is one command, which the CMS keeps; a
// cancelled or refused one leaves the page and its draft as they were.
// The live region says where the block will go all along.
import type { Page } from "@playwright/test";
import { block, canvasShape, caption, grip, moveOnto, pickUp } from "./helpers/canvas.ts";
import { column, draftOf, expect, heading, makePage, open, saved, section, shape, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

// Widgets of different kinds, so each sentence names the one it means.
const fixture = () => [
  section("s1", "First", [
    column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" }), widget("c", "button", { label: "Charlie", href: "#" })]),
    column("c2", [widget("d", "divider", {})]),
  ]),
  section("s2", "Second", [column("c3", [widget("e", "spacer", { size: "m" })]), column("c4", [])]),
];
const START = [["s1", [["c1", ["a", "b", "c"]], ["c2", ["d"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]];

async function startPage(page: Page, request: Parameters<typeof makePage>[0], title: string, sections: unknown[] = fixture()) {
  const made = await makePage(request, title, sections);
  await open(page, made.id);
  return made;
}

// Selects a block by a click, which also gives it the focus.
async function select(page: Page, id: string) {
  await block(page, id).click();
  await expect(block(page, id)).toHaveAttribute("data-editor-selected", "true");
}

test.describe("with the mouse", () => {
  test("a widget moves down its column, as one command the CMS keeps", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Reorder");
    await select(page, "a");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 1 in First, after Button.");
    await page.mouse.up();

    const after = [["s1", [["c1", ["b", "c", "a"]], ["c2", ["d"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await expect(block(page, "a")).toBeFocused();
    await expect(caption(page)).toHaveText("Moved Heading in First.");
    await saved(page);
    const draft = await draftOf(request, id);
    expect(shape(draft.document.sections)).toEqual(after);
  });

  test("a widget moves to another column, then to another section", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Across");
    await select(page, "b");
    await pickUp(page, grip(page));
    // Below the divider, a thin line, in its column.
    await moveOnto(page, block(page, "c2"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Quote will move to Column 2 in First, after Divider.");
    await page.mouse.up();
    await expect.poll(() => canvasShape(page)).toEqual([["s1", [["c1", ["a", "c"]], ["c2", ["d", "b"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]]);

    await select(page, "d");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "e"), "top");
    await expect(caption(page).locator("strong")).toHaveText("Divider will move to Column 1 in Second, at the top.");
    await page.mouse.up();
    const after = [["s1", [["c1", ["a", "c"]], ["c2", ["b"]]]], ["s2", [["c3", ["d", "e"]], ["c4", []]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await expect(caption(page)).toHaveText("Moved Divider to Column 1 in Second.");
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
    // Two drops, two commands.
    await page.keyboard.press("Control+Z");
    await expect.poll(() => canvasShape(page)).toEqual([["s1", [["c1", ["a", "c"]], ["c2", ["d", "b"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]]);
  });

  test("a widget dropped into an empty column, the column framed while it is over it", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Empty");
    await select(page, "c");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c4"));
    await expect(caption(page).locator("strong")).toHaveText("Button will move to Column 2 in Second.");
    // Alone in the column: the indicator is the column's frame.
    await expect(block(page, "c")).toHaveAttribute("data-drag-slot", "frame");
    await expect(block(page, "c4").locator(":scope > .ov-drop-target")).toHaveText("Column 2");
    await page.mouse.up();
    const after = [["s1", [["c1", ["a", "b"]], ["c2", ["d"]]]], ["s2", [["c3", ["e"]], ["c4", ["c"]]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("a tile of the widget panel dropped between two widgets, and a section tile below the last section", async ({ page, request }) => {
    const { id } = await startPage(page, request, "From the panel");
    await page.getByRole("tab", { name: "Add" }).click();
    const tile = page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" });
    await expect(tile).not.toHaveCSS("outline-style", "dashed");
    await pickUp(page, tile);
    await moveOnto(page, block(page, "a"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Quote will be added to Column 1 in First, after Heading.");
    await expect(caption(page).locator("span")).toHaveText("Release to add it. Shaded areas cannot hold widgets. Esc cancels.");
    // The tile it came from leaves its dashed place in the panel.
    await expect(tile).toHaveCSS("outline-style", "dashed");
    await page.mouse.up();
    await expect.poll(async () => ((await canvasShape(page)) as Array<[string, Array<[string, string[]]>]>)[0]![1][0]![1].length).toBe(4);
    const added = page.locator('.canvas [data-block-id="c1"] > [data-block-type="quote"]').first();
    const addedId = await added.getAttribute("data-block-id");
    expect(addedId).not.toBe("b");
    await expect(added).toBeFocused();
    await expect(caption(page)).toHaveText("Added Quote to Column 1 in First.");

    await page.getByRole("tab", { name: "Add" }).click();
    await pickUp(page, page.getByRole("button", { name: "2 columns" }));
    await moveOnto(page, block(page, "s2"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("A section with 2 columns will be added to the page, after Second.");
    await page.mouse.up();
    await expect(page.locator(".canvas .sw-main > [data-block-id]")).toHaveCount(3);
    await saved(page);
    const sections = (await draftOf(request, id)).document.sections;
    expect(sections.map((s) => s.children.length)).toEqual([2, 2, 2]);
    expect(sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "quote", "button"]);
  });

  test("a widget released where widgets cannot go stays where it was, and the editor says why", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Refused");
    await select(page, "a");
    await pickUp(page, grip(page));
    // The section's own band, above its columns: hatched, no place.
    await moveOnto(page, block(page, "s2"), "top");
    await expect(caption(page).locator("strong")).toHaveText("Nowhere to drop it here. Widgets go inside a column.");
    await expect(block(page, "s2").locator(":scope > .ov-veil")).toContainText("Widgets go inside a column.");
    await page.mouse.up();
    await expect(page.locator(".notice")).toContainText("There is nowhere to drop it.");
    await expect(caption(page)).toHaveText("Heading was not moved: There is nowhere to drop it.");
    await expect.poll(() => canvasShape(page)).toEqual(START);
    await expect(block(page, "a")).toBeFocused();
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });

  test("a column refused by a section that holds four already", async ({ page, request }) => {
    const full = section("s3", "Four", [0, 1, 2, 3].map((n) => column(`k${n}`, [widget(`w${n}`, "divider", {})])));
    const { id } = await startPage(page, request, "Full", [...fixture(), full]);
    await page.getByRole("treeitem", { name: "First" }).locator(":scope > .t-row > .t-chev").click();
    await page.getByRole("treeitem", { name: "Column 2", exact: true }).first().locator(":scope > .t-row").click();
    await expect(block(page, "c2")).toHaveAttribute("data-editor-selected", "true");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "k1"), 0.5);
    await expect(caption(page).locator("strong")).toContainText("4 columns");
    await expect(block(page, "s3").locator(":scope > .ov-veil")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator(".notice")).toContainText("4 columns");
    expect(shape((await draftOf(request, id)).document.sections)).toEqual([...START, ["s3", [0, 1, 2, 3].map((n) => [`k${n}`, [`w${n}`]])]]);
  });

  test("a section dragged over a column goes between sections, never into the column", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Sections");
    await page.getByRole("treeitem", { name: "First" }).locator(":scope > .t-row").click();
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c4"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("First will move to the page, after Second.");
    await page.mouse.up();
    const after = [["s2", [["c3", ["e"]], ["c4", []]]], ["s1", [["c1", ["a", "b", "c"]], ["c2", ["d"]]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("Esc while dragging puts the block back and changes nothing", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Cancel");
    await select(page, "a");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c4"));
    await expect(block(page, "a")).toHaveAttribute("data-drag-slot", "frame");
    await page.keyboard.press("Escape");
    await expect(caption(page)).toHaveText("Cancelled: Heading is back where it was.");
    await page.mouse.up();
    await expect(block(page, "a")).not.toHaveAttribute("data-drag-slot", /.*/);
    await expect.poll(() => canvasShape(page)).toEqual(START);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });

  test("the text being typed in the panel stays when its block is dragged", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Typing");
    await select(page, "b");
    const quote = page.getByRole("textbox", { name: "Quote" });
    await quote.fill("Bravo, and cold");
    // No pause, no Tab: straight to the grip.
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c2"), "bottom");
    await page.mouse.up();
    await expect.poll(() => canvasShape(page)).toEqual([["s1", [["c1", ["a", "c"]], ["c2", ["d", "b"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]]);
    await expect(block(page, "b")).toContainText("Bravo, and cold");
    await saved(page);
    const moved = (await draftOf(request, id)).document.sections[0]!.children[1]!.children[1]!;
    expect(moved.props).toMatchObject({ text: "Bravo, and cold" });
  });

  test("the helpers never take a hidden copy of a block for the block", async ({ page, request }) => {
    await startPage(page, request, "Copies");
    await select(page, "a");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c"), "bottom");
    // A copy as a drag library leaves one: inert, hidden, the same id.
    await page.locator('.canvas [data-block-id="c1"]').evaluate((column) => {
      const copy = column.querySelector('[data-block-id="b"]')!.cloneNode(true) as HTMLElement;
      copy.setAttribute("inert", "");
      copy.setAttribute("aria-hidden", "true");
      column.append(copy);
    });
    await expect(page.locator('.canvas [data-block-id="b"]')).toHaveCount(2);
    await expect(block(page, "b")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });
});

test.describe("with the keyboard", () => {
  test("Space picks the block up, the arrows move it down its column, Space drops it", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Keys");
    await select(page, "a");
    await page.keyboard.press("Space");
    await expect(caption(page).locator("strong")).toHaveText("Heading is where it was.");
    await expect(caption(page).locator("span")).toHaveText("The arrows move it, Space drops it here, Esc puts it back.");
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 1 in First, after Quote.");
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 1 in First, after Button.");
    await page.keyboard.press("Space");
    const after = [["s1", [["c1", ["b", "c", "a"]], ["c2", ["d"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await expect(caption(page)).toHaveText("Moved Heading in First.");
    await expect(block(page, "a")).toBeFocused();
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("the side arrows take it to the next column, and down past the end into the next section", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Keys across");
    await select(page, "a");
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 2 in First, at the top.");
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 2 in First, after Divider.");
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 1 in Second, at the top.");
    await page.keyboard.press("Space");
    const after = [["s1", [["c1", ["b", "c"]], ["c2", ["d"]]]], ["s2", [["c3", ["a", "e"]], ["c4", []]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("into an empty column, framed while it is there", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Keys empty");
    await select(page, "a");
    await page.keyboard.press("Space");
    for (const _ of [1, 2, 3]) await page.keyboard.press("ArrowRight");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 2 in Second.");
    await expect(block(page, "a")).toHaveAttribute("data-drag-slot", "frame");
    await page.keyboard.press("Space");
    const after = [["s1", [["c1", ["b", "c"]], ["c2", ["d"]]]], ["s2", [["c3", ["e"]], ["c4", ["a"]]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("a column moves along its row, and the keys pass over a section that cannot take it", async ({ page, request }) => {
    const full = section("s3", "Four", [0, 1, 2, 3].map((n) => column(`k${n}`, [widget(`w${n}`, "divider", {})])));
    const { id } = await startPage(page, request, "Keys columns", [...fixture(), full]);
    await select(page, "d");
    await page.keyboard.press("Alt+ArrowUp");
    await expect(block(page, "c2")).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowLeft");
    await expect(caption(page).locator("strong")).toHaveText("Column 2 will move to First, at the top.");
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Column 2 will move to Second, at the top.");
    // Four has four columns: the key stops at Second.
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Column 2 will move to Second, at the top.");
    await page.keyboard.press("Space");
    const after = [["s1", [["c1", ["a", "b", "c"]]]], ["s2", [["c2", ["d"]], ["c3", ["e"]], ["c4", []]]], ["s3", [0, 1, 2, 3].map((n) => [`k${n}`, [`w${n}`]])]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("a section moves only between sections: no key takes it into a column", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Keys sections");
    await select(page, "a");
    await page.keyboard.press("Alt+ArrowUp");
    await page.keyboard.press("Alt+ArrowUp");
    await expect(block(page, "s1")).toBeFocused();
    await page.keyboard.press("Space");
    await expect(caption(page).locator("strong")).toHaveText("First is where it was.");
    // Across, a section has nowhere to go: the columns beside it are no place for it.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("First will move to the page, after Second.");
    // Past the last section, nothing further: not into Second's columns.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowLeft");
    await expect(caption(page).locator("strong")).toHaveText("First will move to the page, after Second.");
    await page.keyboard.press("Space");
    const after = [["s2", [["c3", ["e"]], ["c4", []]]], ["s1", [["c1", ["a", "b", "c"]], ["c2", ["d"]]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await expect(block(page, "s1")).toBeFocused();
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("Esc puts the block back, with the focus on it, and changes nothing", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Keys cancel");
    await select(page, "a");
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(caption(page)).toHaveText("Cancelled: Heading is back where it was.");
    await expect(block(page, "a")).toBeFocused();
    await expect.poll(() => canvasShape(page)).toEqual(START);
    // The selection is still the heading: Esc ended the drag, not the selection.
    await expect(block(page, "a")).toHaveAttribute("data-editor-selected", "true");
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });

  test("Enter on a tile adds the widget, which the keys then move", async ({ page, request }) => {
    await startPage(page, request, "Keys tile");
    await select(page, "c");
    await page.getByRole("tab", { name: "Add" }).click();
    await page.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" }).press("Enter");
    const added = page.locator('.canvas [data-block-id="c1"] > [data-block-type="divider"]');
    await expect(added).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(caption(page).locator("strong")).toHaveText("Divider will move to Column 1 in First, after Heading.");
    await page.keyboard.press("Space");
    await expect.poll(async () => page.locator('.canvas [data-block-id="c1"] > [data-block-id]').evaluateAll((e) => e.map((x) => x.getAttribute("data-block-type")))).toEqual(["heading", "divider", "quote", "button"]);
  });
});
