// Where the selected block's toolbar stands (design/layout/NOTES.md,
// section 4.2), on the page's numbers at 1440: the canvas from 52 to 848,
// a widget's frame 3 outside it, a toolbar 36 tall.
// @vitest-environment node
import { expect, test } from "vitest";
import { insideTop, placeToolbar, plusShift, PLUS_REACH, TOOLBAR_GAP, TOOLBAR_INSIDE, toolbarBox, UNDER_PLUS, WEIGHTS, type Box, type ToolbarRoom } from "./clamp-place.ts";

const view: Box = { left: 0, top: 52, right: 1126, bottom: 848 };
const room = (over: Partial<ToolbarRoom>): ToolbarRoom => ({
  frame: { left: 80, top: 300, right: 640, bottom: 420 },
  view,
  covers: [],
  words: [],
  width: 180,
  height: 36,
  ...over,
});
const apart = (a: Box, b: Box) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;

test("with room above the frame and no words there, the toolbar stands above it, from its left edge, 6 clear of it", () => {
  const place = placeToolbar(room({}));
  expect(place).toEqual({ side: "above", align: "start", x: 80, y: 300 - TOOLBAR_GAP - 36 });
  expect(apart(toolbarBox(room({}), place), room({}).frame)).toBe(true);
});

test("words above its left end send it to the frame's right end; words above all along, under the frame", () => {
  // The last line of the heading above, short: the toolbar goes right.
  const short: Box = { left: 80, top: 250, right: 400, bottom: 280 };
  expect(placeToolbar(room({ words: [short] }))).toMatchObject({ side: "above", align: "end", x: 640 - 180 });
  // A line as wide as the column: under the frame.
  const wide: Box = { left: 80, top: 250, right: 640, bottom: 280 };
  expect(placeToolbar(room({ words: [wide] }))).toMatchObject({ side: "below", align: "start", y: 420 + UNDER_PLUS });
  // Words above and under: inside the frame's corner, over its own block.
  const under: Box = { left: 80, top: 430, right: 640, bottom: 460 };
  expect(placeToolbar(room({ words: [wide, under] }))).toMatchObject({ side: "inside", x: 80 + TOOLBAR_INSIDE, y: 300 + TOOLBAR_INSIDE });
});

test("under the frame, the toolbar stands clear of a + on its foot, there or not, so it stays put as the + comes and goes", () => {
  const wide: Box = { left: 80, top: 250, right: 640, bottom: 280 };
  expect(placeToolbar(room({ words: [wide] }))).toMatchObject({ side: "below", y: 420 + UNDER_PLUS });
  // The "+" is 24 round on the frame's line: 12 below it, and 4 more.
  expect(UNDER_PLUS).toBe(12 + 4);
});

test("covering the selected block's own words weighs most, other words next, a picture or a rule little", () => {
  const above: Box = { left: 80, top: 250, right: 640, bottom: 280 };
  const under: Box = { left: 80, top: 430, right: 640, bottom: 470 };
  const own: Box = { left: 80, top: 300, right: 640, bottom: 420 };
  // Words above and under, its own inside: over the words of another block,
  // never over its own, which a click must reach.
  expect(placeToolbar(room({ words: [above, under], ownWords: [own] }))).toMatchObject({ side: "above" });
  // A picture under it and words above: over the picture's edge.
  expect(placeToolbar(room({ words: [above], blocks: [{ left: 80, top: 430, right: 640, bottom: 700 }], ownWords: [own] }))).toMatchObject({ side: "below" });
  expect(WEIGHTS.own).toBeGreaterThan(WEIGHTS.words);
  expect(WEIGHTS.words).toBeGreaterThan(WEIGHTS.blocks);
});

test("where every place covers words, the one covering the least", () => {
  const frame = { left: 80, top: 300, right: 300, bottom: 320 };
  const words: Box[] = [
    { left: 80, top: 270, right: 640, bottom: 290 },
    { left: 80, top: 322, right: 640, bottom: 340 },
    { left: 80, top: 300, right: 300, bottom: 320 },
    { left: 80, top: 258, right: 640, bottom: 270 },
  ];
  const place = placeToolbar(room({ frame, words }));
  // Above covers 20 + 12 of its 36 rows, under 18, inside the frame 12 of
  // the frame's own row and 18 under it: under the frame, from its left.
  expect(place).toMatchObject({ side: "below", align: "start" });
});

test("no room above at the canvas's top: under the frame; a block taller than the canvas, inside, at the canvas's top", () => {
  // The frame's top 20 below the canvas's top: no room for 36 and 6.
  expect(placeToolbar(room({ frame: { left: 80, top: 72, right: 640, bottom: 200 } }))).toMatchObject({ side: "below", y: 200 + UNDER_PLUS });
  // Taller than the canvas, its top scrolled away: inside, 8 from the canvas's top.
  const tall = room({ frame: { left: 80, top: -400, right: 640, bottom: 1200 } });
  expect(placeToolbar(tall)).toEqual({ side: "inside", align: "start", x: 88, y: view.top + 8 });
  // Its foot comes up: the toolbar goes up with it, never past it.
  expect(insideTop({ ...tall, frame: { ...tall.frame, bottom: 90 } })).toBe(90 - TOOLBAR_INSIDE - 36);
  // A short block keeps the corner.
  expect(insideTop({ ...tall, frame: { left: 80, top: 300, right: 640, bottom: 330 } })).toBe(308);
});

test("a section's toolbar stands inside its top left corner, in its padding; words there send it out", () => {
  const section = room({ section: true, frame: { left: 22, top: 200, right: 1104, bottom: 700 } });
  expect(placeToolbar(section)).toEqual({ side: "inside", align: "start", x: 22 + TOOLBAR_INSIDE, y: 200 + TOOLBAR_INSIDE });
  // A section with no space above its heading: above the section, from its left.
  expect(placeToolbar({ ...section, words: [{ left: 30, top: 205, right: 900, bottom: 260 }] })).toMatchObject({ side: "above", align: "start", x: 22 });
});

test("never cut by the canvas's edges, and never under the open Insert drawer: moved in, and right of it", () => {
  // A frame from the canvas's left edge: 8 in.
  expect(placeToolbar(room({ frame: { left: -4, top: 300, right: 300, bottom: 400 } })).x).toBe(8);
  // Narrower than the toolbar at the right edge: in from it.
  expect(placeToolbar(room({ frame: { left: 1060, top: 300, right: 1120, bottom: 400 } })).x).toBe(1126 - 8 - 180);
  // The Insert drawer over the canvas's left, where it floats (a tablet's
  // window): right of it.
  const drawer: Box = { left: 8, top: 60, right: 288, bottom: 848 };
  const place = placeToolbar(room({ covers: [drawer] }));
  expect(place.x).toBe(288 + 8);
  expect(apart(toolbarBox(room({}), place), drawer)).toBe(true);
});

test("a seam's + the toolbar would stand on moves along its seam, off it: to its right, or to its left where the seam ends first", () => {
  // A section's toolbar inside its corner, on a page drawn smaller, over
  // the seam's "+" above it at the middle, x 355, y 260.
  const toolbar: Box = { left: 300, top: 248, right: 480, bottom: 284 };
  const seam = { left: 19, right: 691 };
  const shift = plusShift(toolbar, { x: 355, y: 260 }, seam);
  expect(shift).toBe(480 + PLUS_REACH - 355);
  // Moved, the "+" (16 round) stands 6 clear of the toolbar.
  expect(355 + shift - 16 - toolbar.right).toBe(6);
  // The seam ends too soon on the right: to the toolbar's left.
  expect(plusShift(toolbar, { x: 355, y: 260 }, { left: 19, right: 520 })).toBe(300 - PLUS_REACH - 355);
  // A toolbar that ends above the "+", or stands beside it, leaves it alone.
  expect(plusShift({ ...toolbar, bottom: 260 - PLUS_REACH }, { x: 355, y: 260 }, seam)).toBe(0);
  expect(plusShift({ ...toolbar, left: 35, right: 215 }, { x: 355, y: 260 }, seam)).toBe(0);
});
