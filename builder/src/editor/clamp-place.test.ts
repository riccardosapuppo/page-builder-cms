// Where the clamp stands, by the approved layout's rules (design/layout/
// NOTES.md, section 4.2), on the page's real numbers at 1440: the page 19
// from the canvas's edge, its columns from 83, the Hero's and What we do's
// gutters 32, a section's default 48.
// @vitest-environment node
import { expect, test } from "vitest";
import { clampTop, placeClamp, type Box, type ClampRoom } from "./clamp-place.ts";

const view: Box = { left: 0, top: 52, right: 1126, bottom: 848 };
const room = (over: Partial<ClampRoom>): ClampRoom => ({
  block: { left: 83, top: 264, right: 637, bottom: 400 },
  leftLimit: view.left,
  rightLimit: 669,
  contentLeft: 83,
  contentRight: 1053,
  view,
  covers: [],
  height: 160,
  scale: 1,
  ...over,
});
const box = (place: ReturnType<typeof placeClamp>, height = 160) => ({ left: place.x, right: place.x + (place.size === "full" ? 34 : 28), top: place.y, bottom: place.y + height });
const apart = (a: Box, b: Box) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;

test("a first column's block: the full clamp in the page's margin, 14 from the block, its tie to the frame", () => {
  const place = placeClamp(room({}));
  expect(place).toEqual({ side: "left", size: "full", tie: 8, x: 35, y: 258 });
  expect(apart(box(place), room({}).block)).toBe(true);
});

test("a gutter of 48 or more holds the full clamp; 28 to 47 the narrow one, centred, clear of the column beside it", () => {
  // Beginners' course, in What we do's second column: 32 to the first.
  const column1 = { left: 83, top: 270, right: 380, bottom: 430 };
  const narrow = room({ block: { left: 412, top: 270, right: 710, bottom: 470 }, leftLimit: column1.right });
  const place = placeClamp(narrow);
  expect(place).toMatchObject({ side: "left", size: "narrow", tie: null, x: 382 });
  expect(apart(box(place), narrow.block)).toBe(true);
  expect(apart(box(place), column1)).toBe(true);
  expect(place.x - column1.right).toBe(2);
  expect(narrow.block.left - (place.x + 28)).toBe(2);
  // The theme's default gutter, 48: the full clamp.
  expect(placeClamp(room({ block: { left: 428, top: 270, right: 710, bottom: 470 }, leftLimit: 380 }))).toMatchObject({ size: "full", tie: 8, x: 380 });
  // 47: the narrow one.
  expect(placeClamp(room({ block: { left: 427, top: 270, right: 710, bottom: 470 }, leftLimit: 380 }))).toMatchObject({ size: "narrow", x: 389.5 });
});

test("a gutter under 28 holds none: the clamp goes out to the nearer page margin, level with the block's top, with no tie", () => {
  // A middle column of three, 24 apart: nearer the left margin.
  const middle = room({ block: { left: 410, top: 300, right: 700, bottom: 360 }, leftLimit: 386, rightLimit: 724 });
  expect(placeClamp(middle)).toEqual({ side: "left", size: "full", tie: null, x: 35, y: 294 });
  // The last column: nearer the right margin.
  const last = room({ block: { left: 760, top: 300, right: 1053, bottom: 360 }, leftLimit: 736, rightLimit: view.right });
  expect(placeClamp(last)).toEqual({ side: "right", size: "full", tie: null, x: 1067, y: 294 });
});

test("where an open drawer covers the left margin, the clamp goes to the block's right side by the same rules", () => {
  const drawer: Box = { left: 8, top: 60, right: 288, bottom: 848 };
  // The Hero heading: its right gutter is 32, so the narrow clamp.
  const hero = room({ covers: [drawer] });
  expect(placeClamp(hero)).toMatchObject({ side: "right", size: "narrow", tie: null, x: 639 });
  // A wide right gutter: the full clamp, its tie on its left.
  expect(placeClamp(room({ covers: [drawer], rightLimit: 720 }))).toMatchObject({ side: "right", size: "full", tie: 8, x: 651 });
  // No gutter on the right either: the page's right margin.
  expect(placeClamp(room({ covers: [drawer], rightLimit: 650 }))).toMatchObject({ side: "right", size: "full", tie: null, x: 1067 });
  // A drawer that does not reach the clamp leaves it on the left.
  expect(placeClamp(room({ covers: [{ ...drawer, right: 30 }] }))).toMatchObject({ side: "left", x: 35 });
});

test("where the drawer covers the block's right gutter as well, the clamp goes to the page's right margin, never under the drawer", () => {
  const drawer: Box = { left: 8, top: 60, right: 288, bottom: 848 };
  const under = (place: ReturnType<typeof placeClamp>, over: Box) => !apart(box(place), over);
  // The first of four columns at 1280: the block 83 to 247, the next column
  // at 295. Its right gutter is 48, but 261 to 295 runs under the drawer's
  // edge at 288, as does its left margin.
  const four = room({ block: { left: 83, top: 264, right: 247, bottom: 400 }, rightLimit: 295, covers: [drawer] });
  const place = placeClamp(four);
  expect(place).toMatchObject({ side: "right", size: "full", tie: null, x: 1067 });
  expect(under(place, drawer)).toBe(false);
  // A block wide enough that its right gutter is clear of the drawer keeps to it.
  expect(placeClamp(room({ block: { left: 83, top: 264, right: 300, bottom: 400 }, rightLimit: 348, covers: [drawer] }))).toMatchObject({ side: "right", size: "full", tie: 8, x: 314 });
  // Nothing beside the block free of the drawer: just clear of its edge.
  const edge = placeClamp(room({ block: { left: 83, top: 264, right: 247, bottom: 400 }, rightLimit: 295, covers: [drawer, { left: 1000, top: 60, right: 1126, bottom: 848 }] }));
  expect(edge).toMatchObject({ side: "right", size: "full", tie: null, x: 295 });
  expect(under(edge, drawer)).toBe(false);
});

test("every block gets the same clamp: beside a short block it runs on below it, and never flips", () => {
  const button = room({ block: { left: 83, top: 512, right: 637, bottom: 566 } });
  const place = placeClamp(button);
  expect(place).toMatchObject({ side: "left", size: "full", y: 506 });
  expect(place.y + button.height).toBeGreaterThan(button.block.bottom);
  // Near the canvas's foot too: the canvas scrolls to show it (Clamp.tsx).
  expect(placeClamp(room({ block: { left: 83, top: 820, right: 637, bottom: 846 } })).y).toBe(814);
});

test("beside a block whose top has scrolled away, the clamp keeps to the canvas's top, never past the block's foot", () => {
  const tall = (top: number, bottom: number) => room({ block: { left: 83, top, right: 637, bottom } });
  expect(clampTop(tall(-400, 700))).toBe(view.top + 8);
  // The foot comes up: the clamp goes up with it.
  expect(clampTop(tall(-800, 150))).toBe(150 - 160);
  // A short block scrolled half away stays level with its frame.
  expect(clampTop(tall(40, 90))).toBe(34);
});

test("a section's clamp sits inside it, in the page's margin, on the same vertical as its blocks' clamps, with no tie", () => {
  const join = room({ section: true, block: { left: 83, top: 167, right: 1053, bottom: 797 } });
  expect(placeClamp(join)).toEqual({ side: "left", size: "full", tie: null, x: 35, y: 185 });
});

test("on a page drawn smaller, the clamp keeps its size and its 14 from the block; the frame it ties to is nearer", () => {
  const scaled = room({ scale: 0.8, block: { left: 70, top: 200, right: 500, bottom: 300 } });
  expect(placeClamp(scaled)).toMatchObject({ size: "full", tie: 14 - 6 * 0.8, x: 70 - 48, y: 200 - 6 * 0.8 });
});
