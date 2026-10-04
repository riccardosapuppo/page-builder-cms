// Where a window stands beside the yellow line of the place a key was
// dropped at: on the side of the line with room for its whole width, else
// over or under the line, shortened to the room, else nowhere (the page is
// moved, and the window goes under the line). The boxes are those of a
// 1440 by 900 window with the Video window (440 wide) and the media library
// (1060 wide).
import { expect, test } from "vitest";
import { placeBeside, type Box } from "./place-dialog.ts";

const view = { width: 1440, height: 900 };
const video = { width: 440, height: 359 };
const library = { width: 1060, height: 692 };
// The line of the owner's case: a column's, 456 wide and 40 high.
const line = (left: number, top: number, width = 456): Box => ({ left, top, right: left + width, bottom: top + 40 });

const overlap = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const boxOf = (stand: { left: number; top: number }, size: { width: number; height: number }, height: number | null = null): Box =>
  ({ left: stand.left, top: stand.top, right: stand.left + size.width, bottom: stand.top + (height ?? size.height) });

test("the video window stands on the right of a line with room for it, level with the line, and on its left otherwise", () => {
  const right = placeBeside(line(100, 554), view, video)!;
  expect(right).toMatchObject({ side: "right", left: 556 + 24, height: null });
  expect(right.top + video.height / 2).toBeCloseTo(574, 5);

  const left = placeBeside(line(587, 554), view, video)!;
  expect(left).toMatchObject({ side: "left", left: 587 - 24 - 440, height: null });
  for (const stand of [right, left]) expect(overlap(boxOf(stand, video), stand === right ? line(100, 554) : line(587, 554))).toBe(false);
});

test("a window level with a line near the top or the bottom of the view is kept inside the view", () => {
  const high = placeBeside(line(100, 20), view, video)!;
  expect(high.top).toBe(8);
  const low = placeBeside(line(100, 860), view, video)!;
  expect(low.top + video.height).toBe(900 - 8);
});

test("the media library is too wide for either side: it stands under the line when there is room under it, over it when there is room over it", () => {
  const near = line(587, 100);
  const under = placeBeside(near, view, library)!;
  expect(under).toMatchObject({ side: "below", top: 140 + 24, height: null });
  expect(under.left).toBe(Math.min((587 + 587 + 456) / 2 - 530, 1440 - 8 - 1060));
  expect(overlap(boxOf(under, library, under.height), near)).toBe(false);

  const far = line(587, 700);
  const over = placeBeside(far, view, library)!;
  expect(over.side).toBe("above");
  expect(over.top + (over.height ?? library.height)).toBe(700 - 24);
  expect(overlap(boxOf(over, library, over.height), far)).toBe(false);
});

test("the library at the owner's line, in the middle of a 900-high window, goes over it, 522 high, and leaves the line seen", () => {
  const owners = line(587, 554);
  const stand = placeBeside(owners, view, library)!;
  expect(stand).toMatchObject({ side: "above", top: 8, height: 554 - 24 - 8 });
  expect(overlap(boxOf(stand, library, stand.height), owners)).toBe(false);
});

test("it is not shortened below what it needs, and without the room there is no place: the caller moves the page", () => {
  // 308 over the line and 488 under it: 488 is room for 420, and the library is shortened to it.
  expect(placeBeside(line(300, 340), view, library)).toMatchObject({ side: "below", height: 900 - 8 - (380 + 24) });
  // A view too short for either: 328 over the line, 328 under it.
  expect(placeBeside(line(300, 360), { width: 1440, height: 760 }, library)).toBeNull();
  // The video window, which needs all its height, in a view with 348 over and under a line it cannot stand beside.
  expect(placeBeside(line(300, 380), { width: 700, height: 800 }, video)).toBeNull();
});

test("a window wider than the view has no place beside or over anything", () => {
  expect(placeBeside(line(0, 100), { width: 600, height: 900 }, library)).toBeNull();
});
