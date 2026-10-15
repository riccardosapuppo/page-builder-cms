// Drag and drop in Chromium, with the mouse and with the keyboard, against
// the run's own CMS: a widget reordered in its column, moved to another
// column and another section, dropped into an empty column; blocks of the
// Insert drawer dropped on the page; drops the page refuses; a drag
// cancelled with Esc. Each drop is one command, which the CMS keeps; a
// cancelled or refused one leaves the page and its draft as they were.
// The live region, in the bottom line, says where the block will go all
// along.
import type { Page } from "@playwright/test";
import { block, canvasShape, caption, childIds, grip, moveOnto, pickUp } from "./helpers/canvas.ts";
import { column, draftOf, drawer, expect, heading, makePage, open, saved, section, shape, test, widget } from "./helpers/site.ts";

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

// The colours the browser draws in a box of the window, pixel by pixel
// (red, green, blue), read from a screenshot of it.
async function pixels(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<number[][]> {
  const shot = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
  return page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const { data: rgba } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const out: number[][] = [];
    for (let i = 0; i < rgba.length; i += 4) out.push([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
    return out;
  }, shot.toString("base64"));
}

// A CSS colour's red, green and blue; the WCAG contrast of two of them.
const rgb = (css: string): number[] => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
function contrast(a: readonly number[], b: readonly number[]): number {
  const luminance = (colour: readonly number[]) => {
    const [r, g, b2] = colour.map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b2!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((light! + 0.05) / (dark! + 0.05)) * 100) / 100;
}

// In a 1280 window the page keeps its desktop layout whole; under 1150 or
// so the canvas has less than 800 for it, and it is drawn smaller.
test.describe("on a page drawn smaller to fit a 1024 window", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("a widget moves to another column, the pointer and the page in step", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Scaled");
    await expect(page.locator(".canvas .frame")).toHaveAttribute("data-scale", /^0\.8/);
    await select(page, "b");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c2"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Quote will move to Column 2 in First, after Divider.");
    // The drag's own words on the page keep their size: the dragged block's
    // name on its line, the target column's name, the shaded section's note.
    const drawnAt = (selector: string) => page.locator(`.canvas ${selector}`).first().evaluate((element) => {
      const shown = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return [Number((shown.width / parseFloat(style.width)).toFixed(3)), Number((shown.height / parseFloat(style.height)).toFixed(3))];
    });
    for (const words of [".drop-label", ".ov-drop-target > .ov-label", ".veil-note"]) expect(await drawnAt(words), words).toEqual([1, 1]);
    await page.mouse.up();
    const after = [["s1", [["c1", ["a", "c"]], ["c2", ["d", "b"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });
});

// In a tablet's window, with a finger (src/editor/layout-mode.ts), Insert
// floats over the canvas's left, the page going on under it; on a desktop
// it pushes the page aside.
test.describe("in a tablet's window, 820 by 1180, with a finger, where Insert floats over the page", () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test("over the drawer, a key of Insert is on nothing of the page under it", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Over the drawer");
    const insert = await drawer(page, "Insert");
    // Basic's first key, which stands level with Column 1 in this window.
    const tile = insert.getByRole("group", { name: "Basic" }).getByRole("button", { name: "Heading" });
    await tile.scrollIntoViewIfNeeded();
    // Where the pointer stops once the drag starts (./helpers/canvas.ts,
    // pickUp), Column 1 runs under the drawer, well inside its edges: it
    // could take a heading, were it not hidden.
    const box = (await tile.boundingBox())!;
    const column = (await block(page, "c1").boundingBox())!;
    const at = { x: box.x + box.width / 2 + 8, y: box.y + box.height / 2 + 8 };
    expect(at.x - column.x).toBeGreaterThan(8);
    expect(at.y - column.y).toBeGreaterThan(8);
    expect(column.y + column.height - at.y).toBeGreaterThan(8);
    await pickUp(page, tile);
    await expect(caption(page).locator("strong")).toHaveText("Nowhere to drop it here. Widgets go inside a column.");
    await page.mouse.up();
    await expect(caption(page)).toHaveText("Heading was not added: There is nowhere to drop it.");
    await expect.poll(() => canvasShape(page)).toEqual(START);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });
});

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

  test("a block from Insert dropped between two widgets, and a section below the last section", async ({ page, request }) => {
    const { id } = await startPage(page, request, "From the panel");
    await drawer(page, "Insert");
    const tile = page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" });
    await expect(tile).not.toHaveCSS("outline-style", "dashed");
    await pickUp(page, tile);
    await moveOnto(page, block(page, "a"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Quote will be added to Column 1 in First, after Heading.");
    await expect(caption(page).locator("span")).toHaveText("Release, or press Space, to add it. Shaded areas cannot hold widgets. Esc cancels.");
    // The key it came from leaves its dashed place in the drawer.
    await expect(tile).toHaveCSS("outline-style", "dashed");
    await page.mouse.up();
    await expect.poll(async () => ((await canvasShape(page)) as Array<[string, Array<[string, string[]]>]>)[0]![1][0]![1].length).toBe(4);
    const added = page.locator('.canvas [data-block-id="c1"] > [data-block-type="quote"]').first();
    const addedId = await added.getAttribute("data-block-id");
    expect(addedId).not.toBe("b");
    await expect(added).toBeFocused();
    await expect(caption(page)).toHaveText("Added Quote to Column 1 in First.");

    // Insert stays open, a catalogue.
    await pickUp(page, (await drawer(page, "Insert")).getByRole("button", { name: "2 columns" }));
    await moveOnto(page, block(page, "s2"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("A section with 2 columns will be added to the page, after Second.");
    await page.mouse.up();
    await expect(page.locator(".canvas .sw-main > [data-block-id]")).toHaveCount(3);
    await saved(page);
    const sections = (await draftOf(request, id)).document.sections;
    expect(sections.map((s) => s.children.length)).toEqual([2, 2, 2]);
    expect(sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "quote", "button"]);
  });

  test("Space, with the button still held, drops the tile where the caption says, once", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Space drops");
    await drawer(page, "Insert");
    await pickUp(page, page.getByRole("group", { name: "Content" }).getByRole("button", { name: "Quote" }));
    await moveOnto(page, block(page, "a"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Quote will be added to Column 1 in First, after Heading.");
    await page.keyboard.press("Space");
    await expect(caption(page)).toHaveText("Added Quote to Column 1 in First.");
    await page.mouse.up();
    await expect.poll(() => canvasShape(page)).toEqual([["s1", [["c1", ["a", expect.any(String), "b", "c"]], ["c2", ["d"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]]);
    await saved(page);
    expect((await draftOf(request, id)).document.sections[0]!.children[0]!.children.map((w) => w.type)).toEqual(["heading", "quote", "quote", "button"]);
  });

  test("a widget released where widgets cannot go stays where it was, and the editor says why", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Refused");
    await select(page, "a");
    await pickUp(page, grip(page));
    // The section's own band, above its columns: washed grey, no place.
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

  // The owner's choice of 4 October 2026 over the mock's hatching
  // (design/layout/NOTES.md, section 9): where the block cannot go is a
  // light, flat grey, read from the pixels the browser draws; the meaning
  // never rests on that colour alone (the note, the cursor, the sentence);
  // the note and the marks of the places that can take it stand out
  // against the grey.
  test("where a widget cannot go is a flat light grey, with its note, the no-drop cursor and the sentence; the note and the open columns' marks stand out against it", async ({ page, request }) => {
    await startPage(page, request, "Wash");
    const band = async () => {
      // The band of the section the block moves in, above its columns,
      // right of its note and clear of the open column's outline, 8 out
      // from it. Nothing may scroll once the drag is on: the place under
      // a pointer that stands still would change.
      const [s, c, view] = await Promise.all([block(page, "s1").boundingBox(), block(page, "c1").boundingBox(), page.locator(".canvas").boundingBox()]);
      const top = s!.y + 4;
      expect(top, "the band is in the canvas's view").toBeGreaterThanOrEqual(view!.y);
      return { x: Math.round(s!.x + s!.width * 0.6), y: Math.round(top), width: 48, height: Math.round(Math.min(16, c!.y - 12 - top)) };
    };
    const plain = await pixels(page, await band());

    await select(page, "a");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c2"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 2 in First, after Divider.");
    // Over a column that takes it, the drag's own cursor.
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe("grabbing");
    const area = await band();
    expect(area.height, "the band above the columns is tall enough to look at").toBeGreaterThanOrEqual(8);
    const washed = await pixels(page, area);

    // Flat: every pixel of the area the same, give or take the encoder's 2
    // (with the mock's hatching put back, it varied by 77, 73 and 68).
    const spread = [0, 1, 2].map((channel) => Math.max(...washed.map((p) => p[channel]!)) - Math.min(...washed.map((p) => p[channel]!)));
    expect(spread.every((s) => s <= 2), `the wash varies by ${spread.join(", ")}`).toBe(true);
    // Light grey: the band's own white made Alloy at 85%, as --shut says.
    const before = plain[0]!;
    const grey = washed[0]!;
    expect(plain.every((p) => p.join() === before.join())).toBe(true);
    expect(grey.map((value, i) => Math.round(0.85 * [220, 224, 229][i]! + 0.15 * before[i]!) - value).every((d) => Math.abs(d) <= 2), `${grey} over ${before}`).toBe(true);
    console.log(`wash: ${before.join(",")} under, ${grey.join(",")} drawn`);

    // The theme's header and footer, and the page, the same wash.
    const washes = await page.evaluate(() => {
      const after = (element: Element | null) => (element ? getComputedStyle(element, "::after") : null);
      const parts = [...document.querySelectorAll(".canvas .site [data-theme-part]")].map((part) => `${after(part)!.backgroundImage} ${after(part)!.backgroundColor}`);
      const frame = getComputedStyle(document.querySelector(".canvas .frame")!);
      const veils = [...document.querySelectorAll(".canvas .ov-veil")].map((veil) => `${getComputedStyle(veil).backgroundImage} ${getComputedStyle(veil).backgroundColor}`);
      return { parts, frame: `${frame.backgroundImage} ${frame.backgroundColor}`, veils };
    });
    const shut = "none rgba(220, 224, 229, 0.85)";
    expect(washes).toEqual({ parts: [shut, shut], frame: shut, veils: [shut, shut] });

    // The note says the rule, and it and the marks of the open columns
    // stand out against the grey: text 4.5 to 1 at least, edges 3 to 1.
    const colours = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      const edge = (shadow: string) => /rgba?\([^)]*\)/.exec(shadow)?.[0] ?? "";
      const note = style('.canvas [data-block-id="s1"] > .ov-veil .veil-note');
      return {
        noteText: note.color, noteBack: note.backgroundColor, noteEdge: edge(note.boxShadow),
        dropLine: style(".canvas .drop-line").backgroundColor, dropKeyline: edge(style(".canvas .drop-line").boxShadow),
        labelText: style(".canvas .drop-label").color, labelBack: style(".canvas .drop-label").backgroundColor,
        openEdge: style('.canvas [data-block-id="c3"] > .ov-drop').borderTopColor,
        targetKeyline: edge(style('.canvas [data-block-id="c2"] > .ov-drop-target').boxShadow),
      };
    });
    await expect(block(page, "s1").locator(":scope > .ov-veil .veil-note")).toHaveText("Widgets go inside a column.");
    const ratios = {
      noteText: contrast(rgb(colours.noteText), rgb(colours.noteBack)),
      noteEdge: contrast(rgb(colours.noteEdge), grey),
      noteBackOnWash: contrast(rgb(colours.noteBack), grey),
      dropKeyline: contrast(rgb(colours.dropKeyline), grey),
      dropLineOnWash: contrast(rgb(colours.dropLine), grey),
      label: contrast(rgb(colours.labelText), rgb(colours.labelBack)),
      openEdge: contrast(rgb(colours.openEdge), grey),
      targetKeyline: contrast(rgb(colours.targetKeyline), grey),
      openColumnOnWash: contrast(before, grey),
    };
    console.log(`contrast against the wash, and of the words: ${JSON.stringify(ratios)}`);
    expect(ratios.noteText).toBeGreaterThanOrEqual(4.5);
    expect(ratios.label).toBeGreaterThanOrEqual(4.5);
    for (const edge of ["noteEdge", "dropKeyline", "openEdge", "targetKeyline"] as const) expect(ratios[edge], edge).toBeGreaterThanOrEqual(3);

    // Over the band itself: no place, said three ways besides the grey.
    await moveOnto(page, block(page, "s2"), "top");
    await expect(caption(page).locator("strong")).toHaveText("Nowhere to drop it here. Widgets go inside a column.");
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe("no-drop");
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).cursor)).toBe("auto");
  });

  // The owner's report of 15 October 2026: on a dark band the column a
  // widget would land in was filled white, and the band's words, white
  // too, were gone while the block moved over them.
  test("over a dark band, every column keeps the band's colour while a widget moves, the one it would land in tinted, and their words stay as legible as before the drag", async ({ page, request }) => {
    const dark = { ...section("s1", "Dark", [column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })]), column("c2", [widget("d", "divider", {})])]), style: { base: { background: "text" } } };
    await startPage(page, request, "Dark band", [dark]);
    const band = await page.evaluate(() => getComputedStyle(document.querySelector('.canvas [data-block-id="s1"]')!).backgroundColor);
    await select(page, "d");
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "b"), "bottom");
    await expect(caption(page).locator("strong")).toContainText("Divider will move to Column 1 in Dark");
    const drawn = await page.evaluate(() => {
      const target = getComputedStyle(document.querySelector('.canvas [data-block-id="c1"] > .ov-drop-target')!);
      const open = getComputedStyle(document.querySelector('.canvas [data-block-id="c2"]')!);
      return { fill: target.backgroundColor, tint: target.backgroundImage, open: open.backgroundColor, words: getComputedStyle(document.querySelector('.canvas [data-block-id="a"] h2')!).color };
    });
    expect(drawn.open, "the other column on the band's own colour").toBe(band);
    expect(drawn.fill, "the band's own colour under the target's tint").toBe(band);
    expect(drawn.tint).toContain("linear-gradient");
    expect(contrast(rgb(drawn.words), rgb(drawn.fill)), `${drawn.words} on ${drawn.fill}`).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("Escape");
    await page.mouse.up();
  });

  test("a column refused by a section that holds four already", async ({ page, request }) => {
    const full = section("s3", "Four", [0, 1, 2, 3].map((n) => column(`k${n}`, [widget(`w${n}`, "divider", {})])));
    const { id } = await startPage(page, request, "Full", [...fixture(), full]);
    await drawer(page, "Outline");
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
    await drawer(page, "Outline");
    await page.getByRole("treeitem", { name: "First" }).locator(":scope > .t-row").click();
    // The Outline stays open, beside the page: the section's grip is in reach.
    await pickUp(page, grip(page));
    await moveOnto(page, block(page, "c4"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("First will move to the page, after Second.");
    await page.mouse.up();
    const after = [["s2", [["c3", ["e"]], ["c4", []]]], ["s1", [["c1", ["a", "b", "c"]], ["c2", ["d"]]]]];
    await expect.poll(() => canvasShape(page)).toEqual(after);
    await saved(page);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(after);
  });

  test("while a widget moves, its old place keeps a dimmed copy with a Moving chip and the sidebar says what moves and waits; Esc puts everything back", async ({ page, request }) => {
    const { id } = await startPage(page, request, "Moving");
    await select(page, "b");
    const panel = page.locator(".sidebar [role=tabpanel]");
    // Before: the quote's own settings, to be edited.
    await expect(panel.getByRole("textbox", { name: "Quote" })).toBeVisible();
    const height = () => block(page, "c1").evaluate((element) => element.getBoundingClientRect().height);
    await pickUp(page, grip(page));
    await expect(panel.locator(".ed-title")).toContainText("Quote");
    await expect(panel.locator(".ed-title")).toContainText("Moving, from First, column 1");
    await expect(panel.getByText("Settings wait while you move the block. Drop it, or press Esc.")).toBeVisible();
    // Its groups closed, with their values; none a key or a field.
    await expect(panel.locator(".grp .grp-name")).toHaveText(["Quote", "Size and color", "Alignment", "Shown on", "Advanced"]);
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel.getByRole("button")).toHaveCount(0);
    // Where it stood, between the heading and the button: a dimmed copy,
    // inert, with its chip; not a block of the page. There from the
    // pick-up, the drop line beside it.
    const ghost = page.locator(".canvas [data-moving-ghost]");
    await expect(ghost).toHaveCount(1);
    await expect(block(page, "b")).toHaveAttribute("data-drag-slot", "line");
    const atStart = await height();

    await moveOnto(page, block(page, "c2"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Quote will move to Column 2 in First, after Divider.");
    await expect(ghost).toHaveCount(1);
    await expect(ghost).toContainText("Bravo");
    await expect(ghost).toHaveAttribute("inert", "");
    await expect(ghost.locator(".moving-chip")).toHaveText("Moving");
    await expect(page.locator('.canvas [data-block-id="c1"] > [data-block-id]')).toHaveCount(3);
    expect(await childIds(page, "c1")).toEqual(["a", "c"]);
    expect(await page.locator('.canvas [data-block-id="c1"] > [data-block-id]').evaluateAll((all) => all.map((one) => one.getAttribute("data-block-id")))).toEqual(["a", "b~moving", "c"]);
    // The column it left keeps its height as the pointer goes: nothing below
    // it moves under the pointer.
    expect(Math.abs((await height()) - atStart)).toBeLessThan(2);

    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(ghost).toHaveCount(0);
    await expect(panel.getByText(/Settings wait/)).toHaveCount(0);
    await expect(panel.getByRole("textbox", { name: "Quote" })).toBeVisible();
    await expect.poll(() => canvasShape(page)).toEqual(START);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });

  test("a tall widget leaves only its first 240 pixels as the copy, so the section does not stay as tall as the widget was", async ({ page, request }) => {
    const long = { type: "doc", content: Array.from({ length: 60 }, (_, n) => ({ type: "paragraph", content: [{ type: "text", text: `Paragraph ${n} of a long text` }] })) };
    await startPage(page, request, "Tall", [section("s", "Tall", [column("c1", [widget("t", "text", { doc: long }), heading("h", "After")]), column("c2", [widget("d", "divider", {})])])]);
    const heightOf = (id: string) => block(page, id).evaluate((element) => element.getBoundingClientRect().height);
    const tall = await heightOf("t");
    expect(tall).toBeGreaterThan(1000);
    await select(page, "t");
    await pickUp(page, grip(page));
    const ghost = page.locator(".canvas [data-moving-ghost]");
    await expect(ghost).toHaveCount(1);
    expect((await ghost.boundingBox())!.height).toBeLessThanOrEqual(241);
    expect(await heightOf("s")).toBeLessThan(tall / 2);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(ghost).toHaveCount(0);
    expect(Math.abs((await heightOf("t")) - tall)).toBeLessThan(2);
  });

  test("a widget picked up with the keyboard waits the same way, and its copy goes when it is dropped", async ({ page, request }) => {
    await startPage(page, request, "Waiting");
    await select(page, "a");
    await page.keyboard.press("Space");
    const panel = page.locator(".sidebar [role=tabpanel]");
    await expect(panel.locator(".ed-title")).toContainText("Moving, from First, column 1");
    await expect(panel.getByText("Settings wait while you move the block. Drop it, or press Esc.")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    const ghost = page.locator(".canvas [data-moving-ghost]");
    await expect(ghost).toHaveCount(1);
    await expect(ghost).toContainText("Alpha");
    await page.keyboard.press("Space");
    await expect(ghost).toHaveCount(0);
    await expect(panel.getByText(/Settings wait/)).toHaveCount(0);
    await expect(panel.locator(".ed-title")).toContainText("In First, column 2");
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

  // A frame put back into the page loads at once, closed disclosure or
  // not, and React puts the video back when a block lands before it in
  // the drag's preview: the canvas keeps no address in it. Any request
  // outside the run's servers fails the test (helpers/site.ts).
  test("a block moved past a video never loads the provider's player on the canvas", async ({ page, request }) => {
    const asked: string[] = [];
    page.on("request", (sent) => {
      if (!sent.url().startsWith("http://127.0.0.1")) asked.push(sent.url());
    });
    await startPage(page, request, "Past a video", [section("s", "Watch", [column("c", [widget("v", "video", { provider: "youtube", videoId: "dawn-swim01", title: "A dawn swim" }), heading("h", "Under the video")])])]);
    await expect(block(page, "v").locator("iframe")).toHaveCount(1);
    await expect(block(page, "v").locator("iframe")).not.toHaveAttribute("src");
    await select(page, "h");
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
    await expect(caption(page).locator("strong")).toHaveText("Heading will move to Column 1 in Watch, at the top.");
    await page.waitForTimeout(500);
    await page.keyboard.press("Space");
    await expect.poll(() => canvasShape(page)).toEqual([["s", [["c", ["h", "v"]]]]]);
    await page.waitForTimeout(500);
    await expect(block(page, "v").locator("iframe")).not.toHaveAttribute("src");
    expect(asked).toEqual([]);
  });

  test("Enter on a block in Insert adds the widget, which the keys then move", async ({ page, request }) => {
    await startPage(page, request, "Keys tile");
    await select(page, "c");
    await drawer(page, "Insert");
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
