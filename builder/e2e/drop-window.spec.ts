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
//   by a click on a key of Insert, is in the middle as it always was.
import type { Locator, Page } from "@playwright/test";
import { block, moveOnto, pickUp } from "./helpers/canvas.ts";
import { column, drawer, expect, heading, makePage, open, section, test, widget } from "./helpers/site.ts";

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
function expectLeavesTheLine(found: Awaited<ReturnType<typeof boxes>>) {
  expect(within(found.shown, WINDOW), `the window ${JSON.stringify(found.shown)} is inside the browser's window`).toBe(true);
  expect(overlap(found.shown, found.line), `the window ${JSON.stringify(found.shown)} is over the line ${JSON.stringify(found.line)}`).toBe(false);
  expect(within(found.line, found.canvas), `the line ${JSON.stringify(found.line)} is in the canvas's view ${JSON.stringify(found.canvas)}`).toBe(true);
}

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
  const dropped = async (page: Page, group: "Basic" | "Media" | "Content", name: string, columnId: string, where: "top" | "bottom" | "middle") => {
    await pickUp(page, await insertKey(page, group, name));
    await moveOnto(page, block(page, columnId), where);
    await page.mouse.up();
    await expect(library(page)).toBeVisible();
  };

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
