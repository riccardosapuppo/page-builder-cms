// The menu's tile, drawn after the approved design in its language (a
// 20-unit grid, round strokes): a row of links, and Menu, the pill they
// fold into.
import type { IconData } from "../types.ts";

export const icon: IconData = {
  viewBox: "0 0 20 20",
  shapes: [
    ["path", { d: "M2.75 6h3.5M8.25 6h3.5M13.75 6h3.5" }],
    ["rect", { x: "8.75", y: "10.25", width: "8.5", height: "6", rx: "3" }],
    ["path", { d: "M11.25 12.5h3.5M11.25 14h3.5" }],
  ],
};
