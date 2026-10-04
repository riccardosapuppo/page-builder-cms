// Where the window a dropped key asks for opens (the owner's finding of 4
// October 2026: "la finestra si apre nel punto del rilascio"), in Chromium
// against the run's CMS:
// - the video window, 440 wide, stands beside the yellow line of the place
//   the key was dropped at, on the side with room, and not over it;
// - the media library, 1060 wide, which has no side to stand on, stands
//   over the line or under it, shortened to the room there, and the line
//   stays in the canvas's view;
// - the same from the "+" picker's own keys, by click as well as by drop, and
//   at a seam, where the line is a section's;
// - a window that has no such line to stand beside, opened from the menu or
//   by a click on a key of Insert, is in the middle as it always was;
// - on a laptop's window, 1366 by 768 or 1280 by 720, where the library
//   has no room over or under a line in the middle of it (the review of the
//   first fix): the page moves, back if it is at its end, or onto room the
//   canvas is given at its foot if it is too short to scroll, and that room
//   goes when the library closes.
import type { Locator, Page } from "@playwright/test";
import { block, moveOnto, pickUp } from "./helpers/canvas.ts";
import { png } from "./helpers/images.ts";
import { column, drawer, expect, heading, makePage, open, section, test, unique, widget } from "./helpers/site.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const fixture = () => [
  section("s1", "First", [column("c1", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })]), column("c2", [widget("d", "divider", {})])]),
  section("s2", "Second", [column("c3", [widget("e", "spacer", { size: "m" })]), column("c4", [])]),
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const within = (inner: Box, outer: Box) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;
const WINDOW: Box = { x: 0, y: 0, width: 1440, height: 900 };

const library = (page: Page) => page.getByRole("dialog", { name: "Media library" });
const videoWindow = (page: Page) => page.getByRole("dialog", { name: "Add a video" });
// The yellow line of a column's kept place.
const line = (page: Page, columnId: string) => page.locator(`.canvas [data-block-id="${columnId}"] > .ins-slot-wrap .ins-slot`);

async function insertKey(page: Page, group: "Basic" | "Media" | "Content", name: string): Promise<Locator> {
  const insert = await drawer(page, "Insert");
  const key = insert.getByRole("group", { name: group }).getByRole("button", { name, exact: true });
  await key.scrollIntoViewIfNeeded();
  return key;
}

// Where the window and the line are, as the browser lays them out.
async function boxes(page: Page, dialog: Locator, theLine: Locator) {
  const [at, shown, canvas] = [await theLine.boundingBox(), await dialog.boundingBox(), await page.locator(".canvas").boundingBox()];
  if (!at || !shown || !canvas) throw new Error("the line, the window or the canvas is not on screen");
  return { line: at, shown, canvas, side: await dialog.getAttribute("data-beside") };
}

// What must be true wherever the window stands: whole in the window of the
// browser, nowhere over the line, and the line itself in the canvas's view.
function expectLeavesTheLine(found: Awaited<ReturnType<typeof boxes>>, view: Box = WINDOW) {
  expect(within(found.shown, view), `the window ${JSON.stringify(found.shown)} is inside the browser's window`).toBe(true);
  expect(overlap(found.shown, found.line), `the window ${JSON.stringify(found.shown)} is over the line ${JSON.stringify(found.line)}`).toBe(false);
  expect(within(found.line, found.canvas), `the line ${JSON.stringify(found.line)} is in the canvas's view ${JSON.stringify(found.canvas)}`).toBe(true);
}

// A key of Insert dropped in a column, and the library it opens.
async function dropped(page: Page, group: "Basic" | "Media" | "Content", name: string, columnId: string, where: "top" | "bottom" | "middle") {
  await pickUp(page, await insertKey(page, group, name));
  await moveOnto(page, block(page, columnId), where);
  await page.mouse.up();
  await expect(library(page)).toBeVisible();
}

// What the browser finds at the middle of the line: the line itself, or
// the scrim that dims it, and nothing of a window.
const lineSeen = (theLine: Locator) => theLine.evaluate((element) => {
  const { left, right, top, bottom } = element.getBoundingClientRect();
  const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  return hit === null ? "nothing" : hit.closest("[role=dialog]") ? "a window" : hit === element || element.contains(hit) ? "the line" : hit.classList.contains("scrim") ? "the scrim" : hit.tagName.toLowerCase();
});

test.describe("the video window", () => {
  test("dropped from Insert into an empty column, it stands beside the yellow line, level with it, and not over it", async ({ page, request }) => {
    const { id } = await makePage(request, "Video beside", fixture());
    await open(page, id);
    await pickUp(page, await insertKey(page, "Media", "Video"));
    await moveOnto(page, block(page, "c4"));
    await page.mouse.up();
    await expect(videoWindow(page)).toBeVisible();

    const found = await boxes(page, videoWindow(page), line(page, "c4"));
    expectLeavesTheLine(found);
    expect(["left", "right"]).toContain(found.side);
    // Beside it: a gap of the line's own, and the middle of the window at
    // the line's height, as far as the window's own height lets it be.
    const gap = found.side === "left" ? found.line.x - (found.shown.x + found.shown.width) : found.shown.x - (found.line.x + found.line.width);
    expect(Math.abs(gap - 24), `the gap is ${gap}`).toBeLessThanOrEqual(1);
    expect(Math.abs(found.shown.y + found.shown.height / 2 - (found.line.y + found.line.height / 2))).toBeLessThanOrEqual(found.shown.height / 2);
    // The sentence under the window says the same, in words.
    await expect(videoWindow(page).locator(".dlg-foot-note")).toHaveText("Lands on the yellow line on the page, in Column 2.");
  });

  test("dropped in a column the page shows far from the middle, it is on the side of the line that has room", async ({ page, request }) => {
    const { id } = await makePage(request, "Video left column", fixture());
    await open(page, id);
    await pickUp(page, await insertKey(page, "Media", "Video"));
    await moveOnto(page, block(page, "c2"), "bottom");
    await page.mouse.up();
    await expect(videoWindow(page)).toBeVisible();
    const found = await boxes(page, videoWindow(page), line(page, "c2"));
    expectLeavesTheLine(found);
    expect(["left", "right"]).toContain(found.side);
  });

  test("from a click on the Video key of the + picker, it stands beside the line the picker stood beside", async ({ page, request }) => {
    const { id } = await makePage(request, "Video from the picker", fixture());
    await open(page, id);
    await block(page, "b").click();
    await page.keyboard.press("+");
    const picker = page.getByRole("dialog", { name: "Add a block after Quote" });
    const key = picker.getByRole("button", { name: "Video", exact: true });
    await key.click();
    await expect(videoWindow(page)).toBeVisible();
    expectLeavesTheLine(await boxes(page, videoWindow(page), line(page, "c1")));
  });

  test("on a narrow window, with no room on either side of the line, it stands under or over it", async ({ page, request }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    const { id } = await makePage(request, "Video narrow", fixture());
    await open(page, id);
    await block(page, "b").click();
    await page.keyboard.press("+");
    await page.getByRole("dialog", { name: "Add a block after Quote" }).getByRole("button", { name: "Video", exact: true }).click();
    await expect(videoWindow(page)).toBeVisible();
    const found = await boxes(page, videoWindow(page), line(page, "c1"));
    expect(within(found.shown, { x: 0, y: 0, width: 900, height: 900 })).toBe(true);
    expect(overlap(found.shown, found.line)).toBe(false);
    expect(within(found.line, found.canvas)).toBe(true);
  });
});

test.describe("the media library", () => {
  for (const [group, name, columnId, where] of [["Media", "Gallery", "c2", "bottom"], ["Media", "Gallery", "c4", "middle"], ["Basic", "Image", "c1", "bottom"], ["Basic", "Image", "c3", "top"]] as const) {
    test(`${name} dropped in ${columnId} from Insert: the library stands over the yellow line or under it, and the line stays in view`, async ({ page, request }) => {
      const { id } = await makePage(request, `Library for ${name} in ${columnId}`, fixture());
      await open(page, id);
      await dropped(page, group, name, columnId, where);

      const found = await boxes(page, library(page), line(page, columnId));
      expectLeavesTheLine(found);
      expect(["above", "below"]).toContain(found.side);
      expect(found.shown.width).toBeGreaterThanOrEqual(1000);
      expect(found.shown.height, "the library is shortened to the room, not made a strip").toBeGreaterThanOrEqual(400);
      await expect(library(page).locator(".dlg-foot-note")).toContainText("Lands on the yellow line on the page,");
    });
  }

  test("the line of a column near the foot of the page, where there is room under it for nothing, has the library over it", async ({ page, request }) => {
    const { id } = await makePage(request, "Library at the foot", fixture());
    await open(page, id);
    await dropped(page, "Media", "Gallery", "c4", "middle");
    const found = await boxes(page, library(page), line(page, "c4"));
    expectLeavesTheLine(found);
    expect(found.side).toBe("above");
  });

  test("the Picture beside text key of a seam's picker: the library stands under the line at the top of the page, which stays in view", async ({ page, request }) => {
    const { id } = await makePage(request, "Library at a seam", fixture());
    await open(page, id);
    const first = (await block(page, "s1").boundingBox())!;
    await page.mouse.move(first.x + first.width / 2 - 140, first.y + 2, { steps: 3 });
    await page.locator('.canvas [data-block-id="s1"] > .ins-sec[data-edge="top"]').click();
    const picker = page.getByRole("dialog", { name: "Add a section before First" });
    await picker.getByRole("button", { name: "Picture beside text" }).click();
    await expect(library(page)).toBeVisible();
    const found = await boxes(page, library(page), page.locator(".canvas .seam-line"));
    expectLeavesTheLine(found);
    expect(found.side).toBe("below");
  });

  test("opened from the menu, or by a click on Insert's Image key, with no place on the page, the library is in the middle as before", async ({ page, request }) => {
    const { id } = await makePage(request, "Library in the middle", fixture());
    await open(page, id);
    const inTheMiddle = async () => {
      await expect(library(page)).toBeVisible();
      await expect(library(page)).not.toHaveAttribute("data-beside", /.+/);
      const shown = (await library(page).boundingBox())!;
      expect(Math.abs(shown.x + shown.width / 2 - 720), "centred across").toBeLessThanOrEqual(2);
      expect(Math.abs(shown.y + shown.height / 2 - 450), "centred down").toBeLessThanOrEqual(2);
    };
    await page.getByRole("button", { name: "Page Builder CMS menu" }).click();
    await page.getByRole("menuitem", { name: "Media library" }).click();
    await inTheMiddle();
    await page.keyboard.press("Escape");
    await expect(library(page)).toHaveCount(0);

    await (await insertKey(page, "Basic", "Image")).click();
    await inTheMiddle();
  });
});

// A longer page: the drop place in its last column, near its end.
const longFixture = () => [
  ...[1, 2, 3, 4, 5].map((n) => section(`L${n}`, `Long ${n}`, [column(`L${n}c1`, [heading(`L${n}h`, `Heading ${n}`), widget(`L${n}q`, "quote", { text: `Quote ${n}` })]), column(`L${n}c2`, [widget(`L${n}d`, "divider", {})])])),
  section("s9", "Last", [column("c9", [widget("e9", "spacer", { size: "m" })]), column("c10", [])]),
];

// The blocks a column holds, by type.
const types = (page: Page, columnId: string) => page.locator(`.canvas [data-block-id="${columnId}"] > [data-block-id]`).evaluateAll((all) => all.map((one) => one.getAttribute("data-block-type")));

for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
  const view: Box = { x: 0, y: 0, ...size };

  test.describe(`on a laptop's window, ${size.width} by ${size.height}`, () => {
    test.use({ viewport: size });

    test("Image dropped in the empty last column of the review's page: the library stands over the line or under it, and not over it", async ({ page, request }) => {
      const { id } = await makePage(request, `Review's page at ${size.height}`, fixture());
      await open(page, id);
      await dropped(page, "Basic", "Image", "c4", "middle");

      const found = await boxes(page, library(page), line(page, "c4"));
      expectLeavesTheLine(found, view);
      expect(["above", "below"]).toContain(found.side);
      expect(found.shown.height, "the library is shortened to the room, not made a strip").toBeGreaterThanOrEqual(420);
      expect(["the scrim", "the line"]).toContain(await lineSeen(line(page, "c4")));
      await page.keyboard.press("Escape");
      await expect(library(page)).toHaveCount(0);
      expect(await types(page, "c4")).toEqual([]);
    });

    test("Image dropped in the last column of a long page, scrolled to its end: the page goes back, and the library stands over the line, with no room added", async ({ page, request }) => {
      const { id } = await makePage(request, `Long page at ${size.height}`, longFixture());
      await open(page, id);
      await dropped(page, "Basic", "Image", "c10", "middle");

      const found = await boxes(page, library(page), line(page, "c10"));
      expectLeavesTheLine(found, view);
      expect(found.side).toBe("above");
      expect(found.shown.height).toBeGreaterThanOrEqual(420);
      expect(found.canvas.y + found.canvas.height - (found.line.y + found.line.height), "the line is near the canvas's foot").toBeLessThanOrEqual(16);
      expect(["the scrim", "the line"]).toContain(await lineSeen(line(page, "c10")));
      await expect(page.locator(".canvas")).not.toHaveAttribute("data-room");
      await page.keyboard.press("Escape");
      await expect(library(page)).toHaveCount(0);
      expect(await types(page, "c10")).toEqual([]);
    });

    test("Video dropped in the empty last column of the review's page: its window stands beside the line", async ({ page, request }) => {
      const { id } = await makePage(request, `Video at ${size.height}`, fixture());
      await open(page, id);
      await pickUp(page, await insertKey(page, "Media", "Video"));
      await moveOnto(page, block(page, "c4"));
      await page.mouse.up();
      await expect(videoWindow(page)).toBeVisible();

      const found = await boxes(page, videoWindow(page), line(page, "c4"));
      expectLeavesTheLine(found, view);
      expect(["left", "right"]).toContain(found.side);
      expect(["the scrim", "the line"]).toContain(await lineSeen(line(page, "c4")));
    });
  });
}

// A page of one section, lower than a 720-high window's canvas, so it does
// not scroll: its empty column's line is where the library has room
// neither over it nor under it.
const shortFixture = () => [section("s1", "Only", [column("c3", [heading("a", "Alpha"), widget("b", "quote", { text: "Bravo" })]), column("c4", [])])];

test.describe("on a laptop's window, 1280 by 720, a page too short to scroll", () => {
  test.use({ viewport: { width: 1280, height: 720 } });
  const view: Box = { x: 0, y: 0, width: 1280, height: 720 };

  test("Image dropped in its empty column: the canvas is given room, the line goes near its top with the library under it, and the room goes when the library closes", async ({ page, request }) => {
    const { id } = await makePage(request, "Short page", shortFixture());
    await open(page, id);
    const canvas = page.locator(".canvas");
    // Measured with Insert open, as it stays.
    await drawer(page, "Insert");
    const before = await canvas.evaluate((element) => [element.scrollHeight, element.clientHeight]);
    await dropped(page, "Basic", "Image", "c4", "middle");

    const found = await boxes(page, library(page), line(page, "c4"));
    expectLeavesTheLine(found, view);
    expect(found.side).toBe("below");
    expect(found.shown.height, "the library is shortened to the room, not made a strip").toBeGreaterThanOrEqual(420);
    expect(Math.abs(found.line.y - (found.canvas.y + 12)), `the line ${JSON.stringify(found.line)} is 12 inside the canvas's top ${found.canvas.y}`).toBeLessThanOrEqual(1);
    expect(["the scrim", "the line"]).toContain(await lineSeen(line(page, "c4")));
    await expect(canvas).toHaveAttribute("data-room", /^[1-9]\d*$/);

    await library(page).getByRole("button", { name: "Cancel" }).click();
    await expect(library(page)).toHaveCount(0);
    await expect(canvas).not.toHaveAttribute("data-room");
    expect(await canvas.evaluate((element) => [element.style.paddingBottom, element.scrollHeight, element.clientHeight])).toEqual(["", ...before]);
    expect(await types(page, "c4")).toEqual([]);
  });

  test("the library standing under the line moved near the canvas's top adds the image at that line, and the canvas's room goes", async ({ page, request }) => {
    const { id } = await makePage(request, "Short page, image added", shortFixture());
    await open(page, id);
    await dropped(page, "Basic", "Image", "c4", "middle");
    await expect(page.locator(".canvas")).toHaveAttribute("data-room", /^[1-9]\d*$/);

    const name = `${unique("laptop")}.png`;
    await library(page).getByLabel("Images to upload").setInputFiles({ name, mimeType: "image/png", buffer: png(48, 32, (x) => (x < 24 ? [40, 90, 150] : [220, 210, 180])) });
    const tile = library(page).getByRole("radio", { name: `${name}, no alt text` });
    await expect(tile).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    await library(page).getByRole("textbox", { name: /^Alt text/ }).fill("A blue and sand test card");
    await library(page).getByRole("button", { name: "Add image" }).click();

    await expect(library(page)).toHaveCount(0);
    await expect.poll(() => types(page, "c4")).toEqual(["image"]);
    await expect(page.locator(".canvas")).not.toHaveAttribute("data-room");
    expect(await page.locator(".canvas").evaluate((element) => element.style.paddingBottom)).toBe("");
  });
});
