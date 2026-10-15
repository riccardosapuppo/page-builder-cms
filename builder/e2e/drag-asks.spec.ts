// Every key can be dragged onto the page, the ones whose block needs
// something first included (the owner's finding of 4 October 2026: Gallery
// and Video could only be clicked), in Chromium against the run's CMS:
// - from Insert and from the picker a "+" opens, by the mouse and by the
//   keyboard (Space where Enter would add it, the arrows, Space);
// - dropped, Gallery opens the media library and Video its address at
//   the drop place, kept on the page as the yellow line; what they return
//   is added there, as ONE command the CMS keeps;
// - Esc or Cancel adds nothing, says so, and gives the focus back to the
//   key (to the block, for a picker's key, whose picker went with it);
// - a picker's key that needs nothing goes straight where it is dropped,
//   and the picker closes.
import type { Locator, Page } from "@playwright/test";
import { block, canvasShape, caption, childIds, moveOnto, pickUp } from "./helpers/canvas.ts";
import { png } from "./helpers/images.ts";
import { column, draftOf, drawer, expect, heading, makePage, open, saved, section, shape, test, unique, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "First", [column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })]), column("c2", [widget("d", "divider", {})])]),
  section("s2", "Second", [column("c3", [widget("e", "spacer", { size: "m" })]), column("c4", [])]),
];
const START = [["s1", [["c1", ["a", "b"]], ["c2", ["d"]]]], ["s2", [["c3", ["e"]], ["c4", []]]]];

// Selects a block by a click, which also gives it the focus.
async function select(page: Page, id: string) {
  await block(page, id).click();
  await expect(block(page, id)).toHaveAttribute("data-editor-selected", "true");
}

const types = (page: Page, id: string) => page.locator(`.canvas [data-block-id="${id}"] > [data-block-id]`).evaluateAll((all) => all.map((one) => one.getAttribute("data-block-type")));
const library = (page: Page) => page.getByRole("dialog", { name: "Media library" });
const videoWindow = (page: Page) => page.getByRole("dialog", { name: "Add a video" });
// The yellow line of the place kept, in a column.
const keptLine = (page: Page, columnId: string) => page.locator(`.canvas [data-block-id="${columnId}"] > .ins-slot-wrap`);

async function insertKey(page: Page, group: "Basic" | "Media" | "Content", name: string): Promise<Locator> {
  const insert = await drawer(page, "Insert");
  const key = insert.getByRole("group", { name: group }).getByRole("button", { name, exact: true });
  await key.scrollIntoViewIfNeeded();
  return key;
}

// The library: one image uploaded, described, and the gallery added with
// it. Its name is unique, as the run's tests share one library.
async function galleryFromLibrary(page: Page): Promise<string> {
  const name = `${unique("tide")}.png`;
  await library(page).getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(48, 32, (x) => (x < 24 ? [30, 110, 90] : [230, 200, 140])) });
  const tile = library(page).getByRole("checkbox", { name: `${name}, no alt text` });
  await expect(tile).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  await library(page).getByRole("textbox", { name: /^Alt text/ }).fill("The tide coming in");
  await library(page).getByRole("button", { name: "Add gallery" }).click();
  await expect(library(page)).toHaveCount(0);
  return name;
}

test.describe("from Insert, with the mouse", () => {
  test("Gallery dropped after a divider: the library opens there, and the gallery made of what it gives is added there, as one command", async ({ page, request }) => {
    const { id } = await makePage(request, "Gallery dropped", fixture());
    await open(page, id);
    const key = await insertKey(page, "Media", "Gallery");
    await expect(key).toHaveAttribute("data-draggable", "");
    await pickUp(page, key);
    // Below the divider, a thin line, in its column.
    await moveOnto(page, block(page, "c2"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 2 in First, after Divider.");
    await expect(caption(page).locator("span")).toHaveText("Release, or press Space, to add it, then choose its images. Shaded areas cannot hold widgets. Esc cancels.");
    await page.mouse.up();

    // The library, the place kept as the yellow line, which the library
    // does not cover, and named under the library too; nothing added yet.
    await expect(library(page)).toBeVisible();
    await expect(keptLine(page, "c2")).toHaveCount(1);
    await expect(library(page).locator(".dlg-foot-note")).toHaveText("Lands on the yellow line on the page, after Divider in Column 2.");
    await expect(caption(page)).toHaveText("Gallery will be added to Column 2 in First, after Divider, once you choose its images.");
    // (The page behind the window is inert, which the shape helper skips.)
    expect(await types(page, "c2")).toEqual(["divider"]);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);

    const image = await galleryFromLibrary(page);
    await expect.poll(() => types(page, "c2")).toEqual(["divider", "gallery"]);
    const added = page.locator('.canvas [data-block-id="c2"] > [data-block-type="gallery"]');
    await expect(added).toBeFocused();
    await expect(added.getByRole("img", { name: "The tide coming in" })).toBeVisible();
    await expect(keptLine(page, "c2")).toHaveCount(0);
    await expect(caption(page)).toHaveText("Added Gallery to Column 2 in First.");
    // One step in the history.
    const steps = (await drawer(page, "History")).getByRole("list", { name: "This session" }).getByRole("button");
    await expect(steps).toHaveCount(1);
    await expect(steps.first()).toContainText(/^Added Gallery/);
    await saved(page);
    const kept = (await draftOf(request, id)).document.sections[0]!.children[1]!.children;
    expect(kept.map((w) => w.type)).toEqual(["divider", "gallery"]);
    expect(kept[1]!.props).toMatchObject({ items: [{ alt: "The tide coming in", mediaId: expect.any(String) }] });
    expect(image).toMatch(/^tide-/);
  });

  test("Video dropped into an empty column asks for its address there; Esc adds nothing and gives the focus back to the key; given one, it is added there", async ({ page, request }) => {
    const { id } = await makePage(request, "Video dropped", fixture());
    await open(page, id);
    const key = await insertKey(page, "Media", "Video");
    await pickUp(page, key);
    await moveOnto(page, block(page, "c4"));
    await expect(caption(page).locator("strong")).toHaveText("Video will be added to Column 2 in Second.");
    await page.mouse.up();
    await expect(videoWindow(page)).toBeVisible();
    await expect(keptLine(page, "c4")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(videoWindow(page)).toHaveCount(0);
    await expect(keptLine(page, "c4")).toHaveCount(0);
    await expect(key).toBeFocused();
    await expect(caption(page)).toHaveText("Cancelled: nothing was added.");
    expect(await canvasShape(page)).toEqual(START);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);

    // Again, and with an address, then Cancel the second time: nothing.
    await pickUp(page, key);
    await moveOnto(page, block(page, "c4"));
    await page.mouse.up();
    await videoWindow(page).getByRole("button", { name: "Cancel" }).click();
    await expect(key).toBeFocused();
    expect(await canvasShape(page)).toEqual(START);

    await pickUp(page, key);
    await moveOnto(page, block(page, "c4"));
    await page.mouse.up();
    await videoWindow(page).getByLabel("Video address or id").fill("https://www.youtube.com/watch?v=dawnswim-01");
    await videoWindow(page).getByLabel("Title").fill("A dawn swim");
    await videoWindow(page).getByRole("button", { name: "Add video" }).click();
    await expect(videoWindow(page)).toHaveCount(0);
    await expect.poll(() => types(page, "c4")).toEqual(["video"]);
    await expect(page.locator('.canvas [data-block-id="c4"] > [data-block-type="video"]')).toBeFocused();
    await saved(page);
    const added = (await draftOf(request, id)).document.sections[1]!.children[1]!.children;
    expect(added.map((w) => w.props)).toEqual([{ provider: "youtube", videoId: "dawnswim-01", title: "A dawn swim" }]);
  });

  test("Esc while a key is dragged with the mouse cancels the drag only: Insert stays open, nothing asked, nothing added", async ({ page, request }) => {
    const { id } = await makePage(request, "Mouse drag cancelled", fixture());
    await open(page, id);
    await pickUp(page, await insertKey(page, "Media", "Gallery"));
    await moveOnto(page, block(page, "c4"));
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 2 in Second.");
    await page.keyboard.press("Escape");
    await expect(caption(page)).toHaveText("Cancelled: nothing was added.");
    await page.mouse.up();
    await expect(page.getByRole("complementary", { name: "Insert", exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await canvasShape(page)).toEqual(START);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });

  test("dropped where widgets cannot go, Video asks for nothing and adds nothing", async ({ page, request }) => {
    const { id } = await makePage(request, "Video refused", fixture());
    await open(page, id);
    await pickUp(page, await insertKey(page, "Media", "Video"));
    // The section's own band, above its columns.
    await moveOnto(page, block(page, "s2"), "top");
    await expect(caption(page).locator("strong")).toHaveText("Nowhere to drop it here. Widgets go inside a column.");
    await page.mouse.up();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(caption(page)).toHaveText("Video was not added: There is nowhere to drop it.");
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });
});

test.describe("from Insert, with the keyboard", () => {
  test("Space on Video picks it up where Enter would add it, the arrows take it across, Space asks for its address there", async ({ page, request }) => {
    const { id } = await makePage(request, "Video by keys", fixture());
    await open(page, id);
    await select(page, "a");
    const key = await insertKey(page, "Media", "Video");
    await key.focus();
    await page.keyboard.press("Space");
    await expect(caption(page).locator("strong")).toHaveText("Video will be added to Column 1 in First, after Heading.");
    await expect(caption(page).locator("span")).toHaveText("The arrows move it, Space adds it here, then choose its video, Esc cancels.");
    // Space picked it up: it did not press the key, which would have
    // asked at once.
    await expect(videoWindow(page)).toHaveCount(0);
    await page.keyboard.press("ArrowRight");
    await expect(caption(page).locator("strong")).toHaveText("Video will be added to Column 2 in First, after Divider.");
    await page.keyboard.press("ArrowUp");
    await expect(caption(page).locator("strong")).toHaveText("Video will be added to Column 2 in First, at the top.");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(videoWindow(page)).toBeVisible();
    await expect(keptLine(page, "c2")).toHaveCount(1);
    // The window has the focus, as it has when a click opens it.
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[role=dialog]")?.getAttribute("aria-modal") ?? null)).toBe("true");
    await videoWindow(page).getByLabel("Video address or id").fill("abcdefghijk");
    await videoWindow(page).getByRole("button", { name: "Add video" }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => types(page, "c2")).toEqual(["divider", "video"]);
    await expect(page.locator('.canvas [data-block-id="c2"] > [data-block-type="video"]')).toBeFocused();
    await saved(page);
    expect((await draftOf(request, id)).document.sections[0]!.children[1]!.children.map((w) => w.type)).toEqual(["divider", "video"]);
  });

  test("Gallery picked up with Space and dropped in another section opens the library there; Esc adds nothing and the focus is back on the key", async ({ page, request }) => {
    const { id } = await makePage(request, "Gallery by keys", fixture());
    await open(page, id);
    await select(page, "b");
    const key = await insertKey(page, "Media", "Gallery");
    await expect(page.locator(".drawer-where")).toHaveText("Click to add after Quote in Column 1 of First, or drag to any column.");
    await key.focus();
    await expect(page.locator(".drawer-where")).toHaveText("Click to add after Quote in Column 1 of First, or drag to any column.");
    await page.keyboard.press("Space");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 1 in First, after Quote.");
    for (const _ of [1, 2]) await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 2 in First, after Divider.");
    await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 1 in Second, at the top.");
    await page.keyboard.press("Space");
    await expect(library(page)).toBeVisible();
    await expect(keptLine(page, "c3")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(library(page)).toHaveCount(0);
    await expect(key).toBeFocused();
    await expect(caption(page)).toHaveText("Cancelled: nothing was added.");
    expect(await canvasShape(page)).toEqual(START);

    // Again, to the same place, and the library's image chosen.
    await page.keyboard.press("Space");
    for (const _ of [1, 2, 3]) await page.keyboard.press("ArrowDown");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 1 in Second, at the top.");
    await page.keyboard.press("Space");
    await galleryFromLibrary(page);
    await expect.poll(() => types(page, "c3")).toEqual(["gallery", "spacer"]);
    await saved(page);
    expect((await draftOf(request, id)).document.sections[1]!.children[0]!.children.map((w) => w.type)).toEqual(["gallery", "spacer"]);
  });

  test("Esc while a key is moved cancels the move only: Insert stays open, the focus on the key, nothing added", async ({ page, request }) => {
    const { id } = await makePage(request, "Key move cancelled", fixture());
    await open(page, id);
    await select(page, "a");
    const key = await insertKey(page, "Basic", "Divider");
    await key.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(caption(page)).toHaveText("Cancelled: nothing was added.");
    await expect(page.getByRole("complementary", { name: "Insert", exact: true })).toBeVisible();
    await expect(key).toBeFocused();
    expect(await canvasShape(page)).toEqual(START);
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });
});

test.describe("from the picker a + opens", () => {
  test("its Video key dragged with the mouse into an empty column: the picker gives way, the address is asked there, Cancel adds nothing and the focus goes back to the block", async ({ page, request }) => {
    const { id } = await makePage(request, "Picker video", fixture());
    await open(page, id);
    await select(page, "b");
    await page.keyboard.press("+");
    const picker = page.getByRole("dialog", { name: "Add a block after Quote" });
    const key = picker.getByRole("button", { name: "Video", exact: true });
    await expect(key).toHaveAttribute("data-draggable", "");
    await pickUp(page, key);
    // The picker and its line give way to the page under them.
    await expect(picker).toHaveCSS("opacity", "0");
    await expect(keptLine(page, "c1")).toHaveCount(0);
    await moveOnto(page, block(page, "c4"));
    await expect(caption(page).locator("strong")).toHaveText("Video will be added to Column 2 in Second.");
    await page.mouse.up();
    await expect(videoWindow(page)).toBeVisible();
    await expect(keptLine(page, "c4")).toHaveCount(1);
    await expect(picker).toHaveCount(0);
    await videoWindow(page).getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(block(page, "b")).toBeFocused();
    expect(shape((await draftOf(request, id)).document.sections)).toEqual(START);
  });

  test("its Gallery key moved with the keyboard to another column: the library there, the gallery added there; a Divider key dragged elsewhere goes there at once and closes the picker", async ({ page, request }) => {
    const { id } = await makePage(request, "Picker gallery", fixture());
    await open(page, id);
    await select(page, "b");
    await page.keyboard.press("+");
    const picker = page.getByRole("dialog", { name: "Add a block after Quote" });
    await page.keyboard.type("gal");
    await page.keyboard.press("ArrowDown");
    await expect(picker.getByRole("button", { name: "Gallery", exact: true })).toBeFocused();
    // Esc while it moves puts it back: the picker comes back as it was,
    // the focus on its key, nothing added.
    await page.keyboard.press("Space");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 1 in First, after Quote.");
    await page.keyboard.press("ArrowRight");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 2 in First, after Divider.");
    await page.keyboard.press("Escape");
    await expect(caption(page)).toHaveText("Cancelled: nothing was added.");
    await expect(picker).toHaveCSS("opacity", "1");
    await expect(keptLine(page, "c1")).toHaveCount(1);
    await expect(picker.getByRole("button", { name: "Gallery", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    // It starts on the picker's own line.
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 1 in First, after Quote.");
    await expect(picker).toHaveCSS("opacity", "0");
    await page.keyboard.press("ArrowRight");
    await expect(caption(page).locator("strong")).toHaveText("Gallery will be added to Column 2 in First, after Divider.");
    // The arrows moved the block, not the picker's focus.
    await expect(picker.getByRole("button", { name: "Gallery", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(library(page)).toBeVisible();
    await expect(keptLine(page, "c2")).toHaveCount(1);
    await galleryFromLibrary(page);
    await expect.poll(() => types(page, "c2")).toEqual(["divider", "gallery"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A key that needs nothing: dropped, added at once, the picker gone.
    await select(page, "b");
    await page.keyboard.press("+");
    await pickUp(page, page.getByRole("dialog", { name: "Add a block after Quote" }).getByRole("button", { name: "Divider", exact: true }));
    // The way there from the picker's key crosses the top of e's column,
    // whose line opens there first and pushes e down: aimed again at e's
    // foot as it then stands.
    await moveOnto(page, block(page, "e"), "bottom");
    await moveOnto(page, block(page, "e"), "bottom");
    await expect(caption(page).locator("strong")).toHaveText("Divider will be added to Column 1 in Second, after Spacer.");
    await page.mouse.up();
    await expect.poll(() => types(page, "c3")).toEqual(["spacer", "divider"]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(keptLine(page, "c1")).toHaveCount(0);
    expect(await childIds(page, "c1")).toEqual(["a", "b"]);
    await saved(page);
    const sections = (await draftOf(request, id)).document.sections;
    expect(sections.map((s) => s.children.map((c) => c.children.map((w) => w.type)))).toEqual([[["heading", "quote"], ["divider", "gallery"]], [["spacer", "divider"], []]]);
  });
});
