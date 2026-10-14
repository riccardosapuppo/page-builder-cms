/*! Lucide icons (lucide.dev), from lucide-static 0.460.0, ISC License.
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as
 * part of Feather (MIT). All other copyright (c) for Lucide are held by
 * Lucide Contributors 2022.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
// The editor's icons, in its chrome and on the canvas's own keys: Lucide's
// (the owner's choice of 14 October 2026, design/layout/NOTES.md), each
// under the editor's name for what it means, with the Lucide icon it is.
// Shape for shape its file in ./lucide/, as lucide-static
// publishes it (icons.test.ts holds every one to its file): a 24-unit
// grid, drawn with the renderer's SVG drawer and stroked round, as
// Lucide draws them. The stylesheet sets the size and the stroke's
// width by class (.i and .i-xs in the chrome, .li on the canvas's keys,
// editor.css). The blocks' tiles are Lucide's too, each in its widget's
// folder (../widgets/*/icon.ts).
import { shapeElements, type Shape } from "../render/drawings.tsx";

export interface IconShapes {
  lucide: string;
  shapes: readonly Shape[];
}

export const ICONS = {
  "chevron-down": { lucide: "chevron-down", shapes: [["path", { d: "m6 9 6 6 6-6" }]] },
  "chevron-right": { lucide: "chevron-right", shapes: [["path", { d: "m9 18 6-6-6-6" }]] },
  desktop: {
    lucide: "monitor",
    shapes: [
      ["rect", { width: "20", height: "14", x: "2", y: "3", rx: "2" }], ["line", { x1: "8", x2: "16", y1: "21", y2: "21" }],
      ["line", { x1: "12", x2: "12", y1: "17", y2: "21" }],
    ],
  },
  tablet: { lucide: "tablet", shapes: [["rect", { width: "16", height: "20", x: "4", y: "2", rx: "2", ry: "2" }], ["line", { x1: "12", x2: "12.01", y1: "18", y2: "18" }]] },
  phone: { lucide: "smartphone", shapes: [["rect", { width: "14", height: "20", x: "5", y: "2", rx: "2", ry: "2" }], ["path", { d: "M12 18h.01" }]] },
  undo: { lucide: "undo-2", shapes: [["path", { d: "M9 14 4 9l5-5" }], ["path", { d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" }]] },
  redo: { lucide: "redo-2", shapes: [["path", { d: "m15 14 5-5-5-5" }], ["path", { d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" }]] },
  history: { lucide: "history", shapes: [["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }], ["path", { d: "M3 3v5h5" }], ["path", { d: "M12 7v5l4 2" }]] },
  eye: {
    lucide: "eye",
    shapes: [
      ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }],
      ["circle", { cx: "12", cy: "12", r: "3" }],
    ],
  },
  "eye-off": {
    lucide: "eye-off",
    shapes: [
      ["path", { d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }],
      ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
      ["path", { d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }], ["path", { d: "m2 2 20 20" }],
    ],
  },
  check: { lucide: "check", shapes: [["path", { d: "M20 6 9 17l-5-5" }]] },
  grip: {
    lucide: "grip-vertical",
    shapes: [
      ["circle", { cx: "9", cy: "12", r: "1" }], ["circle", { cx: "9", cy: "5", r: "1" }], ["circle", { cx: "9", cy: "19", r: "1" }],
      ["circle", { cx: "15", cy: "12", r: "1" }], ["circle", { cx: "15", cy: "5", r: "1" }], ["circle", { cx: "15", cy: "19", r: "1" }],
    ],
  },
  copy: {
    lucide: "copy",
    shapes: [
      ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
      ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
    ],
  },
  duplicate: {
    lucide: "copy-plus",
    shapes: [
      ["line", { x1: "15", x2: "15", y1: "12", y2: "18" }], ["line", { x1: "12", x2: "18", y1: "15", y2: "15" }],
      ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }],
      ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }],
    ],
  },
  trash: {
    lucide: "trash-2",
    shapes: [
      ["path", { d: "M3 6h18" }], ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" }], ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" }],
      ["line", { x1: "10", x2: "10", y1: "11", y2: "17" }], ["line", { x1: "14", x2: "14", y1: "11", y2: "17" }],
    ],
  },
  paste: {
    lucide: "clipboard-paste",
    shapes: [
      ["path", { d: "M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" }],
      ["path", { d: "M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2M16 4h2a2 2 0 0 1 2 2v2M11 14h10" }], ["path", { d: "m17 10 4 4-4 4" }],
    ],
  },
  close: { lucide: "x", shapes: [["path", { d: "M18 6 6 18" }], ["path", { d: "m6 6 12 12" }]] },
  search: { lucide: "search", shapes: [["circle", { cx: "11", cy: "11", r: "8" }], ["path", { d: "m21 21-4.3-4.3" }]] },
  plus: { lucide: "plus", shapes: [["path", { d: "M5 12h14" }], ["path", { d: "M12 5v14" }]] },
  style: {
    lucide: "palette",
    shapes: [
      ["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor" }],
      ["circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor" }], ["circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor" }],
      ["path", { d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" }],
    ],
  },
  "align-left": { lucide: "align-left", shapes: [["path", { d: "M15 12H3" }], ["path", { d: "M17 18H3" }], ["path", { d: "M21 6H3" }]] },
  "align-center": { lucide: "align-center", shapes: [["path", { d: "M17 12H7" }], ["path", { d: "M19 18H5" }], ["path", { d: "M21 6H3" }]] },
  "align-right": { lucide: "align-right", shapes: [["path", { d: "M21 12H9" }], ["path", { d: "M21 18H7" }], ["path", { d: "M21 6H3" }]] },
  "valign-top": {
    lucide: "align-start-horizontal",
    shapes: [
      ["rect", { width: "6", height: "16", x: "4", y: "6", rx: "2" }], ["rect", { width: "6", height: "9", x: "14", y: "6", rx: "2" }],
      ["path", { d: "M22 2H2" }],
    ],
  },
  "valign-middle": {
    lucide: "align-center-horizontal",
    shapes: [
      ["path", { d: "M2 12h20" }], ["path", { d: "M10 16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4" }],
      ["path", { d: "M10 8V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4" }], ["path", { d: "M20 16v1a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-1" }],
      ["path", { d: "M14 8V7c0-1.1.9-2 2-2h2a2 2 0 0 1 2 2v1" }],
    ],
  },
  "valign-bottom": {
    lucide: "align-end-horizontal",
    shapes: [
      ["rect", { width: "6", height: "16", x: "4", y: "2", rx: "2" }], ["rect", { width: "6", height: "9", x: "14", y: "9", rx: "2" }],
      ["path", { d: "M22 22H2" }],
    ],
  },
  link: {
    lucide: "link",
    shapes: [
      ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
      ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }],
    ],
  },
  calendar: {
    lucide: "calendar",
    shapes: [
      ["path", { d: "M8 2v4" }], ["path", { d: "M16 2v4" }], ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2" }],
      ["path", { d: "M3 10h18" }],
    ],
  },
  clock: { lucide: "clock", shapes: [["circle", { cx: "12", cy: "12", r: "10" }], ["polyline", { points: "12 6 12 12 16 14" }]] },
  globe: {
    lucide: "globe",
    shapes: [
      ["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" }], ["path", { d: "M2 12h20" }],
    ],
  },
  external: {
    lucide: "external-link",
    shapes: [
      ["path", { d: "M15 3h6v6" }], ["path", { d: "M10 14 21 3" }], ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
    ],
  },
  warning: {
    lucide: "triangle-alert",
    shapes: [
      ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }], ["path", { d: "M12 9v4" }],
      ["path", { d: "M12 17h.01" }],
    ],
  },
  error: {
    lucide: "circle-alert",
    shapes: [
      ["circle", { cx: "12", cy: "12", r: "10" }], ["line", { x1: "12", x2: "12", y1: "8", y2: "12" }],
      ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16" }],
    ],
  },
  info: { lucide: "info", shapes: [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M12 16v-4" }], ["path", { d: "M12 8h.01" }]] },
  key: {
    lucide: "key-round",
    shapes: [
      ["path", { d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" }],
      ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor" }],
    ],
  },
  sparkles: {
    lucide: "sparkles",
    shapes: [
      ["path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }],
      ["path", { d: "M20 3v4" }],
      ["path", { d: "M22 5h-4" }],
      ["path", { d: "M4 17v2" }],
      ["path", { d: "M5 18H3" }],
    ],
  },
  upload: {
    lucide: "upload",
    shapes: [
      ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }], ["polyline", { points: "17 8 12 3 7 8" }],
      ["line", { x1: "12", x2: "12", y1: "3", y2: "15" }],
    ],
  },
  restore: { lucide: "rotate-ccw", shapes: [["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }], ["path", { d: "M3 3v5h5" }]] },
  refresh: {
    lucide: "refresh-cw",
    shapes: [
      ["path", { d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" }], ["path", { d: "M21 3v5h-5" }],
      ["path", { d: "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" }], ["path", { d: "M8 16H3v5" }],
    ],
  },
  lock: { lucide: "lock", shapes: [["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }], ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }]] },
  keyboard: {
    lucide: "keyboard",
    shapes: [
      ["path", { d: "M10 8h.01" }], ["path", { d: "M12 12h.01" }], ["path", { d: "M14 8h.01" }], ["path", { d: "M16 12h.01" }],
      ["path", { d: "M18 8h.01" }], ["path", { d: "M6 8h.01" }], ["path", { d: "M7 16h10" }], ["path", { d: "M8 12h.01" }],
      ["rect", { width: "20", height: "16", x: "2", y: "4", rx: "2" }],
    ],
  },
  anchor: {
    lucide: "hash",
    shapes: [
      ["line", { x1: "4", x2: "20", y1: "9", y2: "9" }], ["line", { x1: "4", x2: "20", y1: "15", y2: "15" }],
      ["line", { x1: "10", x2: "8", y1: "3", y2: "21" }], ["line", { x1: "16", x2: "14", y1: "3", y2: "21" }],
    ],
  },
  code: {
    lucide: "braces",
    shapes: [
      ["path", { d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" }],
      ["path", { d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" }],
    ],
  },
  "panel-right": { lucide: "panel-right", shapes: [["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2" }], ["path", { d: "M15 3v18" }]] },
  settings: {
    lucide: "sliders-horizontal",
    shapes: [
      ["line", { x1: "21", x2: "14", y1: "4", y2: "4" }], ["line", { x1: "10", x2: "3", y1: "4", y2: "4" }], ["line", { x1: "21", x2: "12", y1: "12", y2: "12" }],
      ["line", { x1: "8", x2: "3", y1: "12", y2: "12" }], ["line", { x1: "21", x2: "16", y1: "20", y2: "20" }], ["line", { x1: "12", x2: "3", y1: "20", y2: "20" }],
      ["line", { x1: "14", x2: "14", y1: "2", y2: "6" }], ["line", { x1: "8", x2: "8", y1: "10", y2: "14" }], ["line", { x1: "16", x2: "16", y1: "18", y2: "22" }],
    ],
  },
  tree: {
    lucide: "list-tree",
    shapes: [
      ["path", { d: "M21 12h-8" }], ["path", { d: "M21 6H8" }], ["path", { d: "M21 18h-8" }], ["path", { d: "M3 6v4c0 1.1.9 2 2 2h3" }],
      ["path", { d: "M3 10v6c0 1.1.9 2 2 2h3" }],
    ],
  },
  bold: { lucide: "bold", shapes: [["path", { d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" }]] },
  italic: {
    lucide: "italic",
    shapes: [
      ["line", { x1: "19", x2: "10", y1: "4", y2: "4" }], ["line", { x1: "14", x2: "5", y1: "20", y2: "20" }],
      ["line", { x1: "15", x2: "9", y1: "4", y2: "20" }],
    ],
  },
  edges: {
    lucide: "square-dashed",
    shapes: [
      ["path", { d: "M5 3a2 2 0 0 0-2 2" }], ["path", { d: "M19 3a2 2 0 0 1 2 2" }], ["path", { d: "M21 19a2 2 0 0 1-2 2" }],
      ["path", { d: "M5 21a2 2 0 0 1-2-2" }], ["path", { d: "M9 3h1" }], ["path", { d: "M9 21h1" }], ["path", { d: "M14 3h1" }],
      ["path", { d: "M14 21h1" }], ["path", { d: "M3 9v1" }], ["path", { d: "M21 9v1" }], ["path", { d: "M3 14v1" }], ["path", { d: "M21 14v1" }],
    ],
  },
  section: { lucide: "rectangle-horizontal", shapes: [["rect", { width: "20", height: "12", x: "2", y: "6", rx: "2" }]] },
  column: { lucide: "rectangle-vertical", shapes: [["rect", { width: "12", height: "20", x: "6", y: "2", rx: "2" }]] },
  question: {
    lucide: "circle-help",
    shapes: [
      ["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" }], ["path", { d: "M12 17h.01" }],
    ],
  },
  page: { lucide: "file", shapes: [["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }], ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }]] },
  bookmark: { lucide: "bookmark", shapes: [["path", { d: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" }]] },
  play: { lucide: "play", shapes: [["polygon", { points: "6 3 20 12 6 21 6 3" }]] },
  pin: {
    lucide: "map-pin",
    shapes: [
      ["path", { d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" }],
      ["circle", { cx: "12", cy: "10", r: "3" }],
    ],
  },
  more: { lucide: "ellipsis", shapes: [["circle", { cx: "12", cy: "12", r: "1" }], ["circle", { cx: "19", cy: "12", r: "1" }], ["circle", { cx: "5", cy: "12", r: "1" }]] },
  spinner: { lucide: "loader-circle", shapes: [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }]] },
  "arrow-up": { lucide: "arrow-up", shapes: [["path", { d: "m5 12 7-7 7 7" }], ["path", { d: "M12 19V5" }]] },
  "arrow-down": { lucide: "arrow-down", shapes: [["path", { d: "M12 5v14" }], ["path", { d: "m19 12-7 7-7-7" }]] },
  "arrow-left": { lucide: "arrow-left", shapes: [["path", { d: "m12 19-7-7 7-7" }], ["path", { d: "M19 12H5" }]] },
  "arrow-right": { lucide: "arrow-right", shapes: [["path", { d: "M5 12h14" }], ["path", { d: "m12 5 7 7-7 7" }]] },
  block: { lucide: "ban", shapes: [["circle", { cx: "12", cy: "12", r: "10" }], ["path", { d: "m4.9 4.9 14.2 14.2" }]] },
} as const satisfies Record<string, IconShapes>;

export type IconName = keyof typeof ICONS;

// An icon. Decorative: the control around it carries the name.
export function Icon({ name, className = "i" }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {shapeElements(ICONS[name].shapes)}
    </svg>
  );
}

// The product's mark, design/mark.svg: two graphite brackets on a white
// keyline, and the accent's square between them, which follows --mark.
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 10V3h7M13 6v7H6" fill="none" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M3 9V3h6M13 7v6H7" fill="none" stroke="#1B1F24" strokeWidth="2" />
      <rect x="7" y="7" width="2" height="2" style={{ fill: "var(--mark)" }} />
    </svg>
  );
}
