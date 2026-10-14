// The image's tile: Lucide's image
// (../../editor/lucide/image.svg).
import type { IconData } from "../types.ts";

export const icon: IconData = {
  lucide: "image",
  shapes: [
    ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2" }],
    ["circle", { cx: "9", cy: "9", r: "2" }],
    ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }],
  ],
};
