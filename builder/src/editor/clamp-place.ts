// Where the selected block's toolbar stands (design/layout/NOTES.md,
// section 4.2): a bar of the block's tools floating by the selection's
// frame, outside the block, over none of the page's words where a place
// can be found that is.
//
// - Its places, in order: above the frame, from its left edge, then from
//   its right edge; under it, from its left, then its right (clear of a
//   "+" on the frame's foot); and last, inside the frame's top left
//   corner. The first one whole in the canvas's visible part, clear of the
//   open Insert drawer where it floats over the canvas's left (a tablet's
//   window), that covers nothing is taken; where every place covers
//   something, the one that covers least, weighed: the selected block's
//   own words most (it is what is being worked on, and a click into it
//   must land there), the other blocks' words next, other blocks with no
//   words (a picture, a rule) a little.
// - A section's toolbar tries its inside corner first, in the section's
//   padding, where its blocks' toolbars do not stand; its blocks' words
//   count as other blocks' there.
// - Inside the frame, the toolbar keeps to the canvas's top while the
//   block's top has scrolled away and the block is there, never below its
//   foot: beside a block taller than the canvas it is always in view.
// - Never cut by the canvas's edges: moved in from them, and off the
//   drawer, to its right.
// - A seam's "+" it would stand on moves along the seam, off it
//   (plusShift).
//
// Plain geometry in the window's pixels, so the unit tests can read it;
// ./Clamp.tsx measures the page and lays the answer on the toolbar.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ToolbarRoom {
  // The selection's frame, as drawn.
  frame: Box;
  // The canvas's visible edges.
  view: Box;
  // What hides part of the canvas (the Insert drawer, open over a tablet's
  // canvas).
  covers: readonly Box[];
  // What the toolbar keeps off, near the frame: the lines of the other
  // blocks' words, the selected block's own lines, and the other blocks
  // that have no words where they would be covered (a picture, a rule).
  words: readonly Box[];
  ownWords?: readonly Box[];
  blocks?: readonly Box[];
  // The toolbar's size as drawn: it keeps its size on a page drawn smaller.
  width: number;
  height: number;
  // A section's toolbar tries the inside of its frame first.
  section?: boolean;
}

export type ToolbarSide = "above" | "below" | "inside";

export interface ToolbarPlace {
  side: ToolbarSide;
  // The frame's edge it starts from.
  align: "start" | "end";
  // Its top left corner, in the window's pixels.
  x: number;
  y: number;
}

// Between the frame and a toolbar above it; a toolbar inside the frame
// stands as far in from its corner. Under the frame, clear of a "+" on
// its foot (12 below the line) by 4, whether the "+" is there or not, so
// the toolbar stays put as the "+" comes and goes. Off the canvas's edges.
export const TOOLBAR_GAP = 6;
export const TOOLBAR_INSIDE = 8;
export const UNDER_PLUS = 16;
// What a place's cover weighs, by what is covered (see above).
export const WEIGHTS = { own: 3, words: 1, blocks: 0.15 } as const;
const EDGE = 8;

const overlaps = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const area = (a: Box, b: Box): number => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

// The toolbar's box at a place.
export function toolbarBox(room: Pick<ToolbarRoom, "width" | "height">, place: Pick<ToolbarPlace, "x" | "y">): Box {
  return { left: place.x, top: place.y, right: place.x + room.width, bottom: place.y + room.height };
}

// Moved in from the canvas's sides, then right of every drawer it would be
// under, as far as the canvas allows.
function across(room: ToolbarRoom, x: number, y: number): number {
  const most = room.view.right - EDGE - room.width;
  let at = Math.max(room.view.left + EDGE, Math.min(x, most));
  for (const cover of [...room.covers].sort((a, b) => a.right - b.right)) {
    if (overlaps(cover, toolbarBox(room, { x: at, y }))) at = Math.min(cover.right + EDGE, most);
  }
  return at;
}

// The inside place's top: the frame's corner, or the canvas's top while
// the block's top has scrolled away, never below the block's foot.
export function insideTop(room: Pick<ToolbarRoom, "frame" | "view" | "height">): number {
  const { frame, view, height } = room;
  const corner = frame.top + TOOLBAR_INSIDE;
  const foot = frame.bottom - TOOLBAR_INSIDE - height;
  return Math.max(corner, Math.min(view.top + EDGE, foot));
}

export function placeToolbar(room: ToolbarRoom): ToolbarPlace {
  const { frame, view, width, height } = room;
  const above = frame.top - TOOLBAR_GAP - height;
  const below = frame.bottom + UNDER_PLUS;
  const start = frame.left;
  const end = frame.right - width;
  const outside: ToolbarPlace[] = [
    { side: "above", align: "start", x: start, y: above },
    { side: "above", align: "end", x: end, y: above },
    { side: "below", align: "start", x: start, y: below },
    { side: "below", align: "end", x: end, y: below },
  ];
  const inside: ToolbarPlace = { side: "inside", align: "start", x: frame.left + TOOLBAR_INSIDE, y: insideTop(room) };
  const places = (room.section ? [inside, ...outside] : [...outside, inside]).map((place) => ({ ...place, x: across(room, place.x, place.y) }));
  const seen = (place: ToolbarPlace) => {
    const box = toolbarBox(room, place);
    return box.top >= view.top + EDGE - 0.5 && box.bottom <= view.bottom - EDGE + 0.5 && !room.covers.some((cover) => overlaps(cover, box));
  };
  const weigh = (place: ToolbarPlace, boxes: readonly Box[] | undefined, weight: number) => (boxes ?? []).reduce((sum, box) => sum + area(toolbarBox(room, place), box), 0) * weight;
  const covering = (place: ToolbarPlace) => weigh(place, room.words, WEIGHTS.words) + weigh(place, room.ownWords, WEIGHTS.own) + weigh(place, room.blocks, WEIGHTS.blocks);
  let best: { place: ToolbarPlace; covers: number } | null = null;
  for (const place of places) {
    if (!seen(place)) continue;
    const covers = covering(place);
    if (covers === 0) return place;
    if (best === null || covers < best.covers) best = { place, covers };
  }
  // Nowhere whole in view (a canvas shorter than the toolbar's room): the
  // inside corner, held in the canvas as far as it goes.
  return best?.place ?? inside;
}

// A seam's "+" (./Canvas.tsx, Seam) stands in the middle of the page, on
// its seam, 32 round, and the seam below the section that holds the
// selection always shows it. A section's toolbar inside its corner, or a
// toolbar under a block at a section's foot, can stand on it, most of all
// on a page drawn smaller, where the toolbar keeps its size and the
// section does not. The toolbar is drawn over the "+" (canvas.css), so
// none of its keys is ever under it; and the "+" moves along its seam, off
// the toolbar, so it is not under the toolbar either: to its right, or to
// its left where the seam ends first. How far it moves, in the window's
// pixels: 0 when the toolbar leaves it clear.
// Its radius (16) and the room it keeps from the toolbar (6).
export const PLUS_REACH = 22;

export function plusShift(toolbar: Box, plus: { x: number; y: number }, seam: { left: number; right: number }): number {
  const reach = PLUS_REACH;
  if (plus.x + reach <= toolbar.left || plus.x - reach >= toolbar.right || plus.y + reach <= toolbar.top || plus.y - reach >= toolbar.bottom) return 0;
  const right = toolbar.right + reach;
  if (right + reach <= seam.right) return right - plus.x;
  return toolbar.left - reach - plus.x;
}
