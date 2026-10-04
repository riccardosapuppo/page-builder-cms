// Where the selected block's clamp stands (the approved layout, design/
// layout/NOTES.md, section 4.2): a vertical bar of the block's tools in the
// margin beside it, never over it, never over the column beside it.
//
// - The margin on the block's left: the page's margin for a first column
//   or a single one, the gutter for the others. A margin of 48 or more
//   holds the full clamp (34 wide) and the 14 between it and the block,
//   where its tie runs to the selection's frame. One of 28 to 47 holds the
//   narrow clamp, 28 wide, centred in it, with no tie: it touches the
//   selection's frame and stays clear of the column beside it.
// - Less than 28 holds no clamp: it goes out to the page's margin nearest
//   to the block, level with the block's top, with no tie.
// - Where the open Insert drawer covers that place (it floats over the
//   canvas's left), the clamp goes to the block's right side by the same
//   rules: its gutter there, else the page's right margin. A place the
//   drawer covers is never chosen while one it does not cover exists; if
//   it covers them all, the clamp stands just clear of its edge.
// - It stands level with the selection's frame, at the block's top, and
//   runs on below a short block, in the margin where nothing else sits.
//   Beside a block taller than the canvas whose top has scrolled away, it
//   stays at the canvas's top for as long as the block is there.
//
// Plain geometry in the window's pixels, so the unit tests can read it;
// ./Canvas.tsx measures the page and lays the answer on the clamp.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ClampRoom {
  // The block the clamp holds.
  block: Box;
  // Where the free room ends on each side of the block: the column beside
  // it in the same row, else the canvas's edge.
  leftLimit: number;
  rightLimit: number;
  // The page's own columns, from the first one's left to the last one's
  // right: the margins a clamp goes out to.
  contentLeft: number;
  contentRight: number;
  // The canvas's visible edges.
  view: Box;
  // What hides part of the canvas (the Insert drawer, when open).
  covers: readonly Box[];
  // The clamp's height as drawn, and the page's scale: the clamp keeps its
  // size on a page drawn smaller; the frame it is level with does not.
  height: number;
  scale: number;
  // A section's clamp sits inside it, in the page's margin, its blocks'
  // clamps on the same vertical, needing no tie.
  section?: boolean;
}

export type ClampSize = "full" | "narrow";

export interface ClampPlace {
  side: "left" | "right";
  size: ClampSize;
  // The tie to the selection's frame, and its length.
  tie: number | null;
  // The clamp's top left corner, in the window's pixels.
  x: number;
  y: number;
}

export const CLAMP_WIDTH: Readonly<Record<ClampSize, number>> = { full: 34, narrow: 28 };
// The full clamp's distance from the block: its tie runs over it.
export const CLAMP_GAP = 14;
const FULL_ROOM = CLAMP_WIDTH.full + CLAMP_GAP;
const NARROW_ROOM = CLAMP_WIDTH.narrow;
// The selection's frame stands 6 outside the block (editor.css, .ov-sel),
// in the page's pixels; a section's clamp 18 inside its top.
const FRAME_OUT = 6;
const SECTION_DOWN = 18;
// Off the canvas's top edge while the block's top is scrolled away.
const VIEW_GAP = 8;

const overlaps = (a: Box, b: Box): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// The clamp in a gutter of `room` on one side of the block, or null where
// the gutter cannot hold one.
function inGutter(room: ClampRoom, side: "left" | "right", y: number): ClampPlace | null {
  const { block } = room;
  const free = side === "left" ? block.left - room.leftLimit : room.rightLimit - block.right;
  const tie = Math.max(0, CLAMP_GAP - FRAME_OUT * room.scale);
  if (free >= FULL_ROOM) {
    const x = side === "left" ? block.left - CLAMP_GAP - CLAMP_WIDTH.full : block.right + CLAMP_GAP;
    return { side, size: "full", tie: room.section ? null : tie, x, y };
  }
  if (free >= NARROW_ROOM) {
    const x = side === "left" ? room.leftLimit + (free - NARROW_ROOM) / 2 : block.right + (free - NARROW_ROOM) / 2;
    return { side, size: "narrow", tie: null, x, y };
  }
  return null;
}

// The clamp out in the page's margin on one side, against the page's
// columns, where a gutter is too narrow for it.
function inMargin(room: ClampRoom, side: "left" | "right", y: number): ClampPlace {
  const edge = side === "left" ? room.contentLeft : room.contentRight;
  const free = side === "left" ? edge - room.view.left : room.view.right - edge;
  const size: ClampSize = free >= FULL_ROOM ? "full" : "narrow";
  const width = CLAMP_WIDTH[size];
  const off = size === "full" ? CLAMP_GAP : Math.max(0, (free - width) / 2);
  const x = side === "left" ? edge - off - width : edge + off;
  return { side, size, tie: null, x, y };
}

function covered(room: ClampRoom, place: ClampPlace): boolean {
  const box = { left: place.x, top: place.y, right: place.x + CLAMP_WIDTH[place.size], bottom: place.y + room.height };
  return room.covers.some((cover) => overlaps(cover, box));
}

// The clamp's top: level with the selection's frame (a section's, 18
// inside it), unless the block's top has scrolled out of the canvas while
// the block is still there, where it keeps to the canvas's top, never
// below the block's foot.
export function clampTop(room: ClampRoom): number {
  const { block, view, height, scale } = room;
  const top = room.section ? block.top + SECTION_DOWN * scale : block.top - FRAME_OUT * scale;
  if (top >= view.top + VIEW_GAP) return top;
  return Math.max(top, Math.min(view.top + VIEW_GAP, block.bottom - height));
}

// The clamp when the drawer covers the places beside the block on both
// sides: level with the block, just clear of the covering drawer's right
// edge (and of the canvas's), where it is seen and can be used.
function clearOfCovers(room: ClampRoom, y: number): ClampPlace {
  const width = CLAMP_WIDTH.full;
  const box = (x: number) => ({ left: x, top: y, right: x + width, bottom: y + room.height });
  let x = room.view.left;
  // A cover can push the place past another, so go through them in order
  // until the place is clear of every one.
  for (const cover of [...room.covers].sort((a, b) => a.right - b.right)) {
    if (overlaps(cover, box(x))) x = cover.right + CLAMP_GAP / 2;
  }
  return { side: "right", size: "full", tie: null, x: Math.min(x, room.view.right - width), y };
}

export function placeClamp(room: ClampRoom): ClampPlace {
  const y = clampTop(room);
  // The block's left gutter, else the page's margin nearer the block.
  const nearer: "left" | "right" = room.block.left - room.contentLeft <= room.contentRight - room.block.right ? "left" : "right";
  const first = inGutter(room, "left", y) ?? inMargin(room, nearer, y);
  if (!covered(room, first)) return first;
  // Hidden there (a drawer over the canvas's left): the right side, its
  // gutter, else the page's right margin. Never a place that is covered
  // while one that is not exists.
  const gutter = inGutter(room, "right", y);
  if (gutter && !covered(room, gutter)) return gutter;
  const margin = inMargin(room, "right", y);
  if (!covered(room, margin)) return margin;
  const other = inMargin(room, "left", y);
  if (!covered(room, other)) return other;
  return clearOfCovers(room, y);
}
