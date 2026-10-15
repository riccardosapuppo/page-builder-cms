// The collection list's tile: Lucide's layout-list
// (../../editor/lucide/layout-list.svg), entries one under another, each
// with its picture.
import type { IconData } from "../types.ts";

export const icon: IconData = {
  lucide: "layout-list",
  shapes: [
    ["rect", { width: "7", height: "7", x: "3", y: "3", rx: "1" }],
    ["rect", { width: "7", height: "7", x: "3", y: "14", rx: "1" }],
    ["path", { d: "M14 4h7" }],
    ["path", { d: "M14 9h7" }],
    ["path", { d: "M14 15h7" }],
    ["path", { d: "M14 20h7" }],
  ],
};
