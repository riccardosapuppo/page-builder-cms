// The logo's tile, drawn after the approved design in its language (a
// 20-unit grid, round strokes): the mark's disc and its waterline, and the
// name beside it.
import type { IconData } from "../types.ts";

export const icon: IconData = {
  viewBox: "0 0 20 20",
  shapes: [
    ["circle", { cx: "6.5", cy: "10", r: "3.75" }],
    ["path", { d: "M2.75 10.75h7.5M12.75 10h4.5" }],
  ],
};
