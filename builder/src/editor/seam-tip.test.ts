// Where a seam's tip stands, on the numbers Chromium measured on the
// example site's Notices page, the seam below the Dark band hovered while
// its button is chosen: at 1440 with nothing open, at 1184 beside the
// Outline (the "+" moved off the button's clamp, to its right) and at 1024
// beside the Outline (the page drawn at 49%, the clamp right of the "+").
// @vitest-environment node
import { expect, test } from "vitest";
import type { Box } from "./clamp-place.ts";
import { placeSeamTip, TIP_EDGE, TIP_GAP, TIP_GAP_ACROSS, type TipRoom } from "./seam-tip.ts";

// "Add a section between Dark band and Lists", as drawn.
const width = 258;
const height = 26;
const room = (over: Partial<TipRoom>): TipRoom => ({
  plus: { left: 579, top: 826, right: 611, bottom: 858 },
  width,
  height,
  view: { left: 0, top: 52, right: 1126, bottom: 848 },
  obstacles: [],
  ...over,
});
const boxOf = (place: { x: number; y: number }): Box => ({ left: place.x, top: place.y, right: place.x + width, bottom: place.y + height });
const apart = (a: Box, b: Box) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
const whole = (a: Box, view: Box) => a.left >= view.left + TIP_EDGE && a.right <= view.right - TIP_EDGE && a.top >= view.top && a.bottom <= view.bottom;

test("with room, on the seam right of the \"+\", 14 from it and level with it, as the layout draws it", () => {
  const clamp: Box = { left: 539, top: 662, right: 573, bottom: 824 };
  const place = placeSeamTip(room({ obstacles: [clamp] }));
  expect(place).toEqual({ side: "right", x: 611 + TIP_GAP, y: 842 - height / 2 });
  // 30 from the "+"'s middle, as the layout's 50% + 30px.
  expect(place.x - 595).toBe(30);
});

test("a \"+\" moved right of the clamp beside the Outline at 1184: under it, whole and clear of the clamp, not cut by the canvas's edge", () => {
  const view: Box = { left: 288, top: 52, right: 870, bottom: 848 };
  const plus: Box = { left: 599, top: 731, right: 631, bottom: 763 };
  const clamp: Box = { left: 565, top: 628, right: 593, bottom: 776 };
  const place = placeSeamTip(room({ plus, view, obstacles: [clamp] }));
  expect(place).toEqual({ side: "under", x: 599, y: 763 + TIP_GAP_ACROSS });
  expect(whole(boxOf(place), view)).toBe(true);
  expect(apart(boxOf(place), clamp)).toBe(true);
  expect(apart(boxOf(place), plus)).toBe(true);
  // On the seam, right of the "+", it would run past the canvas's edge
  // (and its 4 of room) by 37; left of it, it would go under the clamp.
  expect(631 + TIP_GAP + width - (870 - TIP_EDGE)).toBe(37);
  expect(apart(boxOf({ x: 599 - TIP_GAP - width, y: 747 - height / 2 }), clamp)).toBe(false);
});

test("the clamp right of the \"+\" on a page drawn at 49%: under the \"+\", ending clear of the clamp, inside the canvas", () => {
  const view: Box = { left: 288, top: 52, right: 710, bottom: 716 };
  const plus: Box = { left: 483, top: 488, right: 515, bottom: 520 };
  const clamp: Box = { left: 673, top: 420, right: 701, bottom: 568 };
  const place = placeSeamTip(room({ plus, view, obstacles: [clamp] }));
  expect(place.side).toBe("under");
  expect(whole(boxOf(place), view)).toBe(true);
  expect(apart(boxOf(place), clamp)).toBe(true);
  expect(apart(boxOf(place), plus)).toBe(true);
});

test("no room on the right: left of the \"+\" on the seam, when that is whole and clear", () => {
  const view: Box = { left: 0, top: 52, right: 900, bottom: 848 };
  const plus: Box = { left: 700, top: 400, right: 732, bottom: 432 };
  const place = placeSeamTip(room({ plus, view }));
  expect(place).toEqual({ side: "left", x: 700 - TIP_GAP - width, y: 416 - height / 2 });
});

test("near the canvas's foot, over the \"+\" rather than under it; the Insert drawer counts as the clamp does", () => {
  const view: Box = { left: 0, top: 52, right: 900, bottom: 848 };
  const plus: Box = { left: 700, top: 820, right: 732, bottom: 852 };
  const drawer: Box = { left: 8, top: 60, right: 448, bottom: 848 };
  const place = placeSeamTip(room({ plus, view, obstacles: [drawer] }));
  expect(place.side).toBe("over");
  expect(place.y).toBe(820 - TIP_GAP_ACROSS - height);
  expect(whole(boxOf(place), view)).toBe(true);
  expect(apart(boxOf(place), drawer)).toBe(true);
});

test("no place has it whole: the one that hides least of it", () => {
  const view: Box = { left: 0, top: 52, right: 300, bottom: 848 };
  const plus: Box = { left: 140, top: 100, right: 172, bottom: 132 };
  const place = placeSeamTip(room({ plus, view, width: 320 }));
  // Right of the "+" 210 would be cut, left of it 198; under it, from the
  // canvas's edge, 28.
  expect(place).toEqual({ side: "under", x: TIP_EDGE, y: 132 + TIP_GAP_ACROSS });
});
