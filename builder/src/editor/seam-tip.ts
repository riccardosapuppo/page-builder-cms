// Where a seam's tip stands (./Canvas.tsx, Seam): the words naming where a
// section would go, shown while the pointer is over the seam. The layout
// draws them on the seam, right of its "+" (design/layout/, seam-hover).
// A "+" moved along its seam off the selected block's clamp
// (./clamp-place.ts, plusShift), a long section name or a page drawn
// smaller can leave no room there, and the tip was cut by the canvas's
// edge or drawn under the clamp. So it stands, in this order, wherever it
// is whole inside the canvas's visible part and clear of the clamp and of
// the Insert drawer over the canvas:
// - on the seam, right of the "+", 14 from it, as the layout draws it;
// - on the seam, left of the "+";
// - under the "+", 6 below it, from the "+"'s left, else ending at its
//   right, else beside the clamp, kept inside the canvas;
// - over the "+", the same way.
// Where no place has it whole, it takes the one that hides least of it.
// On the seam, it is level with the "+", which may itself be cut by the
// canvas's top or foot: only its width counts there.
//
// Plain geometry in the window's pixels, so the unit tests can read it.
import type { Box } from "./clamp-place.ts";

export type TipSide = "right" | "left" | "under" | "over";

export interface TipRoom {
  // The seam's "+", as drawn.
  plus: Box;
  // The tip's size, as drawn.
  width: number;
  height: number;
  // The canvas's visible part, inside its scrollbar.
  view: Box;
  // What the tip must not be drawn under or over: the selected block's
  // clamp, the open Insert drawer.
  obstacles: readonly Box[];
}

export interface TipPlace {
  side: TipSide;
  x: number;
  y: number;
}

// Between the "+" and the tip, along the seam (the layout's: the tip
// starts 30 from the "+"'s middle) and across it; and the room the tip
// keeps from the canvas's edges.
export const TIP_GAP = 14;
export const TIP_GAP_ACROSS = 6;
export const TIP_EDGE = 4;

// How far two boxes overlap along the seam; 0 when they do not meet.
const overlap = (a: Box, b: Box): number => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * (Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) ? 1 : 0);

export function placeSeamTip(room: TipRoom): TipPlace {
  const { plus, width, height, view, obstacles } = room;
  const level = (plus.top + plus.bottom) / 2 - height / 2;
  const inside = (x: number) => Math.max(view.left + TIP_EDGE, Math.min(x, view.right - TIP_EDGE - width));
  const tries: Array<TipPlace & { onSeam: boolean }> = [
    { side: "right", x: plus.right + TIP_GAP, y: level, onSeam: true },
    { side: "left", x: plus.left - TIP_GAP - width, y: level, onSeam: true },
  ];
  for (const [side, y] of [["under", plus.bottom + TIP_GAP_ACROSS], ["over", plus.top - TIP_GAP_ACROSS - height]] as const) {
    const xs = [plus.left, plus.right - width, ...obstacles.flatMap((o) => [o.right + TIP_GAP, o.left - TIP_GAP - width])];
    for (const x of xs) tries.push({ side, x: inside(x), y, onSeam: false });
  }
  // How much of the tip a place hides: cut by the canvas's edges, or
  // under (or over) the clamp or the drawer.
  const hidden = ({ x, y, onSeam }: (typeof tries)[number]): number => {
    const box: Box = { left: x, top: y, right: x + width, bottom: y + height };
    const cutAlong = Math.max(0, view.left + TIP_EDGE - box.left) + Math.max(0, box.right - (view.right - TIP_EDGE));
    const cutAcross = onSeam ? 0 : Math.max(0, view.top - box.top) + Math.max(0, box.bottom - view.bottom);
    return cutAlong + cutAcross + obstacles.reduce((sum, o) => sum + overlap(box, o), 0);
  };
  let best = tries[0]!;
  let least = hidden(best);
  for (const one of tries) {
    if (least === 0) break;
    const h = hidden(one);
    if (h < least) {
      best = one;
      least = h;
    }
  }
  return { side: best.side, x: best.x, y: best.y };
}
