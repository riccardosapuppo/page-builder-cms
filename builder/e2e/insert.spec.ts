// Adding on the page (the approved layout, design/layout/NOTES.md,
// section 2), in Chromium, against the run's CMS: the round "+" on the
// selected block's edge, on the seams between sections (the one below the
// selection's section, any one under the pointer, the page's top and
// foot among them) and large in every empty column; each opens the yellow
// line at its place and a picker beside it with only what fits there,
// which adds by one command, the new block focused, and closes with Esc,
// giving the focus back. The "+" key opens it after the selection. While
// Insert is open, its own yellow line marks where a click in it lands.
import type { Page } from "@playwright/test";
import { block, childIds } from "./helpers/canvas.ts";
import { column, draftOf, drawer, expect, heading, makePage, open, saved, section, test, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "Hero", [column("c1", [heading("h", "Swim at slack water"), widget("b", "button", { label: "Join", href: "#" })]), column("c2", [])]),
  section("s2", "Questions", [column("c3", [heading("q", "Before your first swim")])]),
];
const sectionIds = (page: Page) => page.locator(".canvas .sw-main > [data-block-id]").evaluateAll((elements) => elements.map((e) => e.getAttribute("data-block-id")));
const types = (page: Page, id: string) => page.locator(`.canvas [data-block-id="${id}"] > [data-block-id]`).evaluateAll((e) => e.map((x) => x.getAttribute("data-block-type")));
const pastSteps = (page: Page) => page.getByRole("complementary", { name: "History" }).getByRole("listitem");

test("the + on the selected block's edge opens its yellow line and the block picker beside it: widgets only, one command, saved", async ({ page, request }) => {
  const { id } = await makePage(request, "Block plus", fixture());
  await open(page, id);
  await block(page, "h").click();
  const plus = page.getByRole("button", { name: "Add a block after Heading" });
  // On the frame's bottom line, in its middle.
  const frame = (await page.locator('.canvas [data-block-id="h"] > .ov-sel').boundingBox())!;
  const drawn = (await plus.boundingBox())!;
  expect(Math.abs(drawn.x + drawn.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(1);
  expect(Math.abs(drawn.y + drawn.height / 2 - (frame.y + frame.height - 2))).toBeLessThan(1.5);
  // The gap below the heading has its dimension line, which waits while
  // the picker's line opens there, as the layout draws it.
  const dimension = page.locator('.canvas [data-block-id="h"] > .ov-dim-v');
  await expect(dimension).toBeVisible();
  await plus.click();
  // The line opens in the column, between the heading and the button,
  // pushing the button down by its own height and the column's gap.
  const slot = page.locator('.canvas [data-block-id="c1"] > .ins-slot-wrap');
  await expect(slot).toBeVisible();
  await expect(dimension).toHaveCount(0);
  const heading = (await block(page, "h").boundingBox())!;
  const line = (await slot.boundingBox())!;
  const button = (await block(page, "b").boundingBox())!;
  expect(line.y).toBeGreaterThan(heading.y + heading.height);
  expect(button.y).toBeGreaterThan(line.y + line.height);
  await expect(slot.locator(".ins-slot-label")).toHaveText("New block");
  const picker = page.getByRole("dialog", { name: "Add a block after Heading" });
  await expect(picker.getByRole("searchbox", { name: "Search blocks" })).toBeFocused();
  await expect(picker.getByRole("group", { name: "Blocks that go in a column" }).getByRole("button")).toHaveText(["Heading", "Text", "Image", "Button", "Divider", "Spacer", "Gallery", "Video", "Map", "Icon box", "Quote", "Accordion", "Form", "Logo", "Menu"]);
  await expect(picker).toContainText("Lands on the yellow line, after Heading.");
  // Beside the line, to its right, over the column beside it.
  const placed = (await picker.boundingBox())!;
  expect(placed.x).toBeGreaterThanOrEqual(line.x + line.width);
  await picker.getByRole("button", { name: "Quote" }).click();
  await expect(picker).toHaveCount(0);
  await expect(slot).toHaveCount(0);
  await expect.poll(() => types(page, "c1")).toEqual(["heading", "quote", "button"]);
  const added = page.locator('.canvas [data-block-id="c1"] > [data-block-id]').nth(1);
  await expect(added).toBeFocused();
  await expect(added).toHaveAttribute("data-editor-selected", "true");
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "button"]);
  // One step of the history.
  await drawer(page, "History");
  await expect(pastSteps(page).filter({ hasText: "Added Quote to Column 1 in Hero" })).toHaveCount(1);
});

test("the picker by the keyboard: the search narrows it, the arrows go along its rows and between them, Enter adds; Esc closes it with nothing added", async ({ page, request }) => {
  const { id } = await makePage(request, "Picker keys", fixture());
  await open(page, id);
  await block(page, "b").click();
  await page.keyboard.press("+");
  const picker = page.getByRole("dialog", { name: "Add a block after Button" });
  const search = picker.getByRole("searchbox", { name: "Search blocks" });
  await expect(search).toBeFocused();
  // Down to the first key; Right along the row; Down to the row below,
  // the same place in it; Up and Up again, back to the search.
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("button", { name: "Heading" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(picker.getByRole("button", { name: "Text" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(picker.getByRole("button", { name: "Divider" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(picker.getByRole("button", { name: "Menu" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(picker.getByRole("button", { name: "Accordion" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(search).toBeFocused();
  await page.keyboard.type("spa");
  await expect(picker.getByRole("group").getByRole("button")).toHaveText(["Spacer"]);
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect.poll(() => types(page, "c1")).toEqual(["heading", "button", "spacer"]);
  await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-type="spacer"]')).toBeFocused();
  // Nothing found says so; Esc closes, the focus back where it was.
  await page.keyboard.press("+");
  await page.keyboard.type("carousel");
  await expect(page.getByRole("dialog", { name: "Add a block after Spacer" }).getByRole("status")).toHaveText("No block is called “carousel”.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-type="spacer"]')).toBeFocused();
  expect(await childIds(page, "c1")).toHaveLength(3);
});

test("an empty column always holds a large +: it adds a block into the column, a video asking for its address first", async ({ page, request }) => {
  const { id } = await makePage(request, "Empty plus", fixture());
  await open(page, id);
  // Nothing selected, and still there.
  const empty = page.getByRole("button", { name: "Add a block to Column 2" });
  await expect(empty).toBeVisible();
  await expect(empty).toContainText("Or drag one here from Insert");
  await empty.click();
  const picker = page.getByRole("dialog", { name: "Add a block to Column 2" });
  await expect(picker).toContainText("Lands on the yellow line, in Column 2.");
  await expect(page.locator('.canvas [data-block-id="c2"] > .ins-slot-wrap')).toBeVisible();
  await picker.getByRole("button", { name: "Video" }).click();
  const asking = page.getByRole("dialog", { name: "Add a video" });
  await asking.getByLabel("Video address or id").fill("https://www.youtube.com/watch?v=abcdefghijk");
  await asking.getByRole("button", { name: "Add video" }).click();
  await expect(asking).toHaveCount(0);
  await expect(picker).toHaveCount(0);
  await expect.poll(() => types(page, "c2")).toEqual(["video"]);
  await expect(page.locator('.canvas [data-block-id="c2"] > [data-block-type="video"]')).toBeFocused();
  await expect(empty).toHaveCount(0);
  await saved(page);
  expect((await draftOf(request, id)).document.sections[0]!.children[1]!.children.map((w) => w.type)).toEqual(["video"]);
});

test("seams: none shows until the pointer finds one, the page's top and foot among them; each names its place and adds a section there", async ({ page, request }) => {
  const { id } = await makePage(request, "Seams", fixture());
  await open(page, id);
  const seams = page.locator(".canvas .ins-sec");
  await expect(seams).toHaveCount(0);
  const at = async (y: number) => {
    const first = (await block(page, "s1").boundingBox())!;
    await page.mouse.move(first.x + first.width / 2 - 140, y, { steps: 3 });
  };
  // Between Hero and Questions: the hairline, the "+" and the tip.
  const hero = (await block(page, "s1").boundingBox())!;
  await at(hero.y + hero.height + 4);
  await expect(seams).toHaveCount(1);
  await expect(page.locator(".canvas .seam-tip")).toHaveText("Add a section between Hero and Questions");
  await expect(page.locator(".canvas .seam-hair")).toBeVisible();
  // No block is outlined there.
  await expect(page.locator(".canvas .ov-hover")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Selection" })).toContainText("Point between two sections to add one there.");
  // Away from it: gone.
  await at(hero.y + hero.height / 2);
  await expect(seams).toHaveCount(0);
  // The top of the first section.
  await at(hero.y + 2);
  await expect(page.locator(".canvas .seam-tip")).toHaveText("Add a section before Hero");
  await page.locator('.canvas [data-block-id="s1"] > .ins-sec[data-edge="top"]').click();
  const picker = page.getByRole("dialog", { name: "Add a section before Hero" });
  await expect(picker).toContainText("Lands on the yellow line, before Hero.");
  await picker.getByRole("button", { name: "Three icon boxes" }).click();
  await expect.poll(async () => (await sectionIds(page)).length).toBe(3);
  const [added] = await sectionIds(page);
  expect(added).not.toBe("s1");
  await expect(block(page, added!)).toBeFocused();
  // The foot of the last.
  await page.keyboard.press("Escape");
  await page.locator(".canvas").evaluate((canvas) => canvas.scrollBy(0, 2000));
  const last = (await block(page, "s2").boundingBox())!;
  await at(last.y + last.height - 2);
  await expect(page.locator(".canvas .seam-tip")).toHaveText("Add a section after Questions");
  await page.locator('.canvas [data-block-id="s2"] > .ins-sec').click();
  await page.getByRole("dialog", { name: "Add a section after Questions" }).getByRole("button", { name: "4 columns" }).click();
  await expect.poll(async () => (await sectionIds(page)).length).toBe(4);
  await saved(page);
  const sections = (await draftOf(request, id)).document.sections;
  expect(sections.map((s) => s.children.length)).toEqual([3, 2, 1, 4]);
});

test("the + key opens after the selection: a block after a widget, a section after a section, at a column's end, a section at the page's end with nothing selected", async ({ page, request }) => {
  const { id } = await makePage(request, "Plus key", fixture());
  await open(page, id);
  // The picker takes the focus once it stands beside its line, a moment
  // after it shows, and Esc gives the focus back to the block it opened
  // from a frame after it is gone: each next key waits for the focus, or
  // on a slow machine it lands on the page's body and nothing hears it.
  const opens = async (title: string, from?: string) => {
    await page.keyboard.press("+");
    const picker = page.getByRole("dialog", { name: title });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("searchbox")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (from) await expect(block(page, from)).toBeFocused();
  };
  await block(page, "q").click();
  await opens("Add a block after Heading", "q");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(block(page, "c3")).toBeFocused();
  await opens("Add a block after Heading", "c3");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(block(page, "s2")).toBeFocused();
  await opens("Add a section after Questions", "s2");
  await page.keyboard.press("Escape");
  await expect(page.locator(".canvas [data-editor-selected=true]")).toHaveCount(0);
  await opens("Add a section after Questions");
  // Shift and "=" on this keyboard: the same key.
  await block(page, "h").click();
  await page.keyboard.press("Shift+Equal");
  await expect(page.getByRole("dialog", { name: "Add a block after Heading" })).toBeVisible();
  await page.keyboard.press("Escape");
  // An empty page lays its first section's picker out already: the key
  // goes to its first choice.
  const empty = await makePage(request, "Plus key, empty", []);
  await open(page, empty.id);
  await page.locator(".canvas").focus();
  await page.keyboard.press("+");
  await expect(page.getByRole("group", { name: "Add a section" }).getByRole("button", { name: "1 column" })).toBeFocused();
});

test("while Insert is open, the block's + waits and Insert's yellow line marks where a click lands, its words at its right end under the drawer", async ({ page, request }) => {
  const { id } = await makePage(request, "Insert line", fixture());
  await open(page, id);
  await block(page, "h").click();
  await expect(page.getByRole("button", { name: "Add a block after Heading" })).toBeVisible();
  const insert = await drawer(page, "Insert");
  await expect(page.getByRole("button", { name: "Add a block after Heading" })).toHaveCount(0);
  const point = page.locator('.canvas [data-block-id="c1"] > .ins-point');
  await expect(point).toContainText("A click in Insert lands here");
  // Between the heading and the button.
  const heading = (await block(page, "h").boundingBox())!;
  const button = (await block(page, "b").boundingBox())!;
  const line = (await point.boundingBox())!;
  expect(line.y).toBeGreaterThan(heading.y + heading.height);
  expect(line.y + line.height).toBeLessThan(button.y);
  // The drawer covers the line's left end: its words stand at the right.
  await expect(point).toHaveAttribute("data-label", "right");
  const words = (await point.locator(".ins-label").boundingBox())!;
  const covered = (await insert.boundingBox())!;
  expect(words.x).toBeGreaterThan(covered.x + covered.width);
  // A click in Insert lands there, and the line follows the new block.
  await insert.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Divider" }).click();
  await expect.poll(() => types(page, "c1")).toEqual(["heading", "divider", "button"]);
  const divider = (await page.locator('.canvas [data-block-id="c1"] > [data-block-type="divider"]').boundingBox())!;
  await expect.poll(async () => (await point.boundingBox())!.y).toBeGreaterThan(divider.y);
  // Under the last block of its column, selected (Down from the new
  // divider, which has the focus), the line's words and end caps stand
  // clear of the selection's frame and its corner marks, as the layout
  // draws them.
  await page.keyboard.press("ArrowDown");
  await expect(block(page, "b")).toHaveAttribute("data-editor-selected", "true");
  const corner = (await page.locator('.canvas [data-block-id="b"] > .ov-sel > .br-bl').boundingBox())!;
  await expect.poll(async () => (await point.locator(".ins-label").boundingBox())!.y).toBeGreaterThanOrEqual(corner.y + corner.height + 1);
  const caps = (await point.locator(".ins-line").boundingBox())!;
  expect(caps.y - 6 - 1).toBeGreaterThanOrEqual(corner.y + corner.height);
  await insert.getByRole("button", { name: "Close Insert" }).click();
  await expect(point).toHaveCount(0);
});

test("Insert before and after, from the block menu, open the picker at that place; a section's open the section picker", async ({ page, request }) => {
  const { id } = await makePage(request, "Insert before", fixture());
  await open(page, id);
  await block(page, "b").click();
  await page.getByRole("toolbar", { name: "Button tools" }).getByRole("button", { name: "Button: block menu" }).click();
  await page.getByRole("menu", { name: "Button: block menu" }).getByRole("menuitem", { name: "Insert before" }).click();
  const picker = page.getByRole("dialog", { name: "Add a block after Heading" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("searchbox", { name: "Search blocks" })).toBeFocused();
  // Esc gives the focus back to the clamp's head the menu came from.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Button: block menu" })).toBeFocused();
  // A section's Insert before, by the menu key on it.
  await page.getByRole("navigation", { name: "Selection" }).getByRole("button", { name: "Hero" }).click();
  await block(page, "s1").focus();
  await page.keyboard.press("Shift+F10");
  await page.getByRole("menu", { name: "Hero: block menu" }).getByRole("menuitem", { name: "Insert before" }).click();
  await page.getByRole("dialog", { name: "Add a section before Hero" }).getByRole("button", { name: "1 column" }).click();
  await expect.poll(async () => (await sectionIds(page)).length).toBe(3);
  expect((await sectionIds(page))[1]).toBe("s1");
  await saved(page);
  expect((await draftOf(request, id)).document.sections.map((s) => s.id).slice(1)).toEqual(["s1", "s2"]);
});
