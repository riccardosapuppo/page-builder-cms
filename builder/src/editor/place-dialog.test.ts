// Where a window stands beside the yellow line of the place a key was
// dropped at: on the side of the line with room for its whole width, else
// over or under the line, shortened to the room, else nowhere (the page is
// moved, and the window goes under the line). The boxes are those of a
// 1440 by 900 window with the Video window (440 wide) and the media library
// (1060 wide).
import { expect, test } from "vitest";
import { moveFor, placeBeside, type Box } from "./place-dialog.ts";

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

// A laptop's window, 1366 by 768: the canvas from 52 to 716, and the line
// of the review's case (an Image dropped in the last column of the page),
// 40 high at 422, with 390 over it and 274 under it, short of the 420 the
// library needs. The page moves, and the line with it.
const laptop = { width: 1366, height: 768 };
const canvas: Box = { left: 0, top: 52, right: 1062, bottom: 716 };
const laptopLine = line(550, 422, 419);
const moved = (box: Box, by: number): Box => ({ ...box, top: box.top - by, bottom: box.bottom - by });
// The canvas scrolled to `top` of the `furthest` it goes, 664 high: a page
// as high as that and the furthest.
const scrolled = (top: number, furthest: number, client = 664) => ({ top, client, content: client + furthest });

test("a line with a place where it is does not move the page", () => {
  expect(moveFor(line(587, 554), { ...canvas, bottom: 848 }, scrolled(0, 400, 796), view, library)).toMatchObject({ by: 0, room: 0, stand: { side: "above" } });
});

test("on a page that scrolls on, the line goes near the canvas's top and the library under it", () => {
  const move = moveFor(laptopLine, canvas, scrolled(0, 2000), laptop, library)!;
  expect(move).toMatchObject({ by: 422 - (52 + 12), room: 0, stand: { side: "below", top: 52 + 12 + 40 + 24 } });
  expect(overlap(boxOf(move.stand, library, move.stand.height), moved(laptopLine, move.by))).toBe(false);
});

test("at the end of a long page, which scrolls no further, the page goes back and the library stands over the line near the canvas's foot", () => {
  const move = moveFor(laptopLine, canvas, scrolled(900, 900), laptop, library)!;
  expect(move).toMatchObject({ by: 462 - (716 - 12), room: 0, stand: { side: "above", top: 8 } });
  const at = moved(laptopLine, move.by);
  expect(at.bottom).toBe(716 - 12);
  expect(move.stand.height).toBe(at.top - 24 - 8);
  expect(overlap(boxOf(move.stand, library, move.stand.height), at)).toBe(false);
});

test("on a short page, which does not scroll, the canvas is given the room at its foot, and the line goes near its top", () => {
  const move = moveFor(laptopLine, canvas, scrolled(0, 0), laptop, library)!;
  expect(move).toMatchObject({ by: 358, room: 358, stand: { side: "below", top: 128, height: 768 - 8 - 128 } });
  // A page that scrolls a little: only the room it lacks is added.
  expect(moveFor(laptopLine, canvas, scrolled(0, 100), laptop, library)).toMatchObject({ by: 358, room: 258 });
  // A page lower than the canvas: the room also fills the canvas below it.
  expect(moveFor(laptopLine, canvas, { top: 0, client: 664, content: 600 }, laptop, library)).toMatchObject({ by: 358, room: 358 + 64 });
});

test("in a window 720 high, the library is shortened to its 672 and still finds a place, under the line moved near the top", () => {
  const short = { width: 1280, height: 720 };
  const frame: Box = { left: 0, top: 52, right: 976, bottom: 668 };
  const at = line(507, 374, 376);
  const move = moveFor(at, frame, scrolled(0, 0, 616), short, { width: 1060, height: 672 })!;
  expect(move).toMatchObject({ by: 310, room: 310, stand: { side: "below", top: 128, height: 720 - 8 - 128 } });
});

test("a view too low for the library even with the line at the canvas's top has no move that helps", () => {
  expect(moveFor(line(550, 300, 419), { ...canvas, bottom: 448 }, scrolled(0, 0, 396), { width: 1366, height: 500 }, library)).toBeNull();
});
