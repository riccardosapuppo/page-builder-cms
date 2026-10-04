// The editor's own icons: the approved design's i-* symbols
// (design/index.html), shape for shape, drawn inline with the renderer's
// SVG drawer. One 20-unit grid; the chrome's stylesheet sets the stroke,
// the fill and the size by class (.i, .i-xs). A group's fill and stroke
// are written on each of its shapes. icons.test.ts holds every one to the
// design's symbol of the same name, or, for the few the approved layout
// adds, to the layout's.
import { shapeElements, type Shape } from "../render/drawings.tsx";

export interface IconShapes {
  viewBox: string;
  shapes: readonly Shape[];
}

const DOT = { fill: "currentColor", stroke: "none" } as const;

export const ICONS = {
  "chevron-down": { viewBox: "0 0 20 20", shapes: [["path", { d: "M6 8l4 4 4-4" }]] },
  "chevron-right": { viewBox: "0 0 20 20", shapes: [["path", { d: "M8 6l4 4-4 4" }]] },
  desktop: { viewBox: "0 0 20 20", shapes: [["rect", { x: "2.75", y: "3.75", width: "14.5", height: "10", rx: "1" }], ["path", { d: "M7 16.75h6M10 13.75v3" }]] },
  tablet: { viewBox: "0 0 20 20", shapes: [["rect", { x: "4.75", y: "2.75", width: "10.5", height: "14.5", rx: "1.5" }], ["path", { d: "M9 14.5h2" }]] },
  phone: { viewBox: "0 0 20 20", shapes: [["rect", { x: "6.25", y: "3.25", width: "7.5", height: "13.5", rx: "1.5" }], ["path", { d: "M9.25 14.25h1.5" }]] },
  undo: { viewBox: "0 0 20 20", shapes: [["path", { d: "M7 4.5L3.5 8 7 11.5" }], ["path", { d: "M3.5 8h8.25a4.25 4.25 0 0 1 0 8.5H9" }]] },
  redo: { viewBox: "0 0 20 20", shapes: [["path", { d: "M13 4.5L16.5 8 13 11.5" }], ["path", { d: "M16.5 8H8.25a4.25 4.25 0 0 0 0 8.5H11" }]] },
  history: { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.75 10a6.25 6.25 0 1 0 1.83-4.42" }], ["path", { d: "M3.75 3v3.25H7" }], ["path", { d: "M10 6.5V10l2.5 2" }]] },
  eye: { viewBox: "0 0 20 20", shapes: [["path", { d: "M2.5 10S5.25 5 10 5s7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5z" }], ["circle", { cx: "10", cy: "10", r: "2.25" }]] },
  "eye-off": { viewBox: "0 0 20 20", shapes: [["path", { d: "M2.5 10S5.25 5 10 5s7.5 5 7.5 5-2.75 5-7.5 5-7.5-5-7.5-5z" }], ["circle", { cx: "10", cy: "10", r: "2.25" }], ["path", { d: "M4 3.5l12 13" }]] },
  check: { viewBox: "0 0 20 20", shapes: [["path", { d: "M4.5 10.5l3.5 3.5 7.5-8" }]] },
  grip: {
    viewBox: "0 0 20 20",
    shapes: [
      ["circle", { ...DOT, cx: "7.5", cy: "5", r: "1.25" }], ["circle", { ...DOT, cx: "12.5", cy: "5", r: "1.25" }],
      ["circle", { ...DOT, cx: "7.5", cy: "10", r: "1.25" }], ["circle", { ...DOT, cx: "12.5", cy: "10", r: "1.25" }],
      ["circle", { ...DOT, cx: "7.5", cy: "15", r: "1.25" }], ["circle", { ...DOT, cx: "12.5", cy: "15", r: "1.25" }],
    ],
  },
  copy: { viewBox: "0 0 20 20", shapes: [["rect", { x: "7.25", y: "7.25", width: "9.5", height: "9.5", rx: "1" }], ["path", { d: "M12.75 7.25v-3a1 1 0 0 0-1-1h-7.5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1h3" }]] },
  duplicate: { viewBox: "0 0 20 20", shapes: [["rect", { x: "7.25", y: "7.25", width: "9.5", height: "9.5", rx: "1" }], ["path", { d: "M12.75 7.25v-3a1 1 0 0 0-1-1h-7.5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1h3M12 9.75v4.5M9.75 12h4.5" }]] },
  trash: { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.5 5.5h13M8 5.5v-2h4v2M5.25 5.5l.75 11h8l.75-11M8.5 8.5v5M11.5 8.5v5" }]] },
  paste: { viewBox: "0 0 20 20", shapes: [["path", { d: "M7 4.25H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-11a1 1 0 0 0-1-1h-2" }], ["rect", { x: "7", y: "2.75", width: "6", height: "3", rx: ".75" }]] },
  close: { viewBox: "0 0 20 20", shapes: [["path", { d: "M5 5l10 10M15 5L5 15" }]] },
  search: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "8.75", cy: "8.75", r: "5.25" }], ["path", { d: "M12.5 12.5L17 17" }]] },
  plus: { viewBox: "0 0 20 20", shapes: [["path", { d: "M10 4v12M4 10h12" }]] },
  style: { viewBox: "0 0 20 20", shapes: [["rect", { x: "3.25", y: "3.25", width: "5.5", height: "5.5", rx: ".75" }], ["rect", { x: "11.25", y: "3.25", width: "5.5", height: "5.5", rx: ".75" }], ["rect", { x: "3.25", y: "11.25", width: "5.5", height: "5.5", rx: ".75" }], ["circle", { cx: "14", cy: "14", r: "2.75" }]] },
  "align-left": { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.5 5h13M3.5 8.5h8M3.5 12h13M3.5 15.5h8" }]] },
  "align-center": { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.5 5h13M6 8.5h8M3.5 12h13M6 15.5h8" }]] },
  "align-right": { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.5 5h13M8.5 8.5h8M3.5 12h13M8.5 15.5h8" }]] },
  "valign-top": { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.5 3.75h13" }], ["rect", { x: "6.25", y: "6.25", width: "7.5", height: "7", rx: ".75" }]] },
  "valign-middle": { viewBox: "0 0 20 20", shapes: [["path", { d: "M3 10h3.25M13.75 10H17" }], ["rect", { x: "6.25", y: "6.25", width: "7.5", height: "7.5", rx: ".75" }]] },
  "valign-bottom": { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.5 16.25h13" }], ["rect", { x: "6.25", y: "6.75", width: "7.5", height: "7", rx: ".75" }]] },
  link: { viewBox: "0 0 20 20", shapes: [["path", { d: "M8.5 11.5l3-3" }], ["path", { d: "M9.25 5.75l1.5-1.5a3 3 0 0 1 4.25 4.25l-1.5 1.5" }], ["path", { d: "M10.75 14.25l-1.5 1.5A3 3 0 0 1 5 11.5l1.5-1.5" }]] },
  calendar: { viewBox: "0 0 20 20", shapes: [["rect", { x: "3.25", y: "4.25", width: "13.5", height: "12.5", rx: "1" }], ["path", { d: "M3.25 8.25h13.5M7 2.5V6M13 2.5V6" }]] },
  clock: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "10", cy: "10", r: "6.75" }], ["path", { d: "M10 6.25V10l2.5 2" }]] },
  globe: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "10", cy: "10", r: "6.75" }], ["ellipse", { cx: "10", cy: "10", rx: "2.75", ry: "6.75" }], ["path", { d: "M3.25 10h13.5" }]] },
  external: { viewBox: "0 0 20 20", shapes: [["path", { d: "M11.5 3.5h5v5M16.5 3.5l-7 7" }], ["path", { d: "M14 11.5v4a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" }]] },
  warning: { viewBox: "0 0 20 20", shapes: [["path", { d: "M10 3.25l7.25 13.25H2.75z" }], ["path", { d: "M10 8v4" }], ["circle", { cx: "10", cy: "14.25", r: ".9", ...DOT }]] },
  error: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "10", cy: "10", r: "6.75" }], ["path", { d: "M10 6.25v4.5" }], ["circle", { cx: "10", cy: "13.4", r: ".9", ...DOT }]] },
  info: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "10", cy: "10", r: "6.75" }], ["path", { d: "M10 9v4.75" }], ["circle", { cx: "10", cy: "6.6", r: ".9", ...DOT }]] },
  upload: { viewBox: "0 0 20 20", shapes: [["path", { d: "M10 13V3.75M6.5 7.25L10 3.75l3.5 3.5" }], ["path", { d: "M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" }]] },
  restore: { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.75 10a6.25 6.25 0 1 0 1.83-4.42" }], ["path", { d: "M3.75 3v3.25H7" }]] },
  refresh: { viewBox: "0 0 20 20", shapes: [["path", { d: "M16.25 10a6.25 6.25 0 1 1-1.83-4.42" }], ["path", { d: "M16.25 3v3.25H13" }]] },
  lock: { viewBox: "0 0 20 20", shapes: [["rect", { x: "4.25", y: "8.75", width: "11.5", height: "8", rx: "1" }], ["path", { d: "M7 8.75V6.5a3 3 0 0 1 6 0v2.25" }]] },
  keyboard: { viewBox: "0 0 20 20", shapes: [["rect", { x: "2.25", y: "5.25", width: "15.5", height: "9.5", rx: "1" }], ["path", { d: "M5 8.25h1.5M8.5 8.25H10M12 8.25h1.5M6.5 11.75h7" }]] },
  anchor: { viewBox: "0 0 20 20", shapes: [["path", { d: "M8 3.5L6.5 16.5M13.5 3.5L12 16.5M4.25 7.5h12.5M3.25 12.5h12.5" }]] },
  "panel-right": { viewBox: "0 0 20 20", shapes: [["rect", { x: "2.75", y: "3.75", width: "14.5", height: "12.5", rx: "1" }], ["path", { d: "M12.25 3.75v12.5" }]] },
  tree: { viewBox: "0 0 20 20", shapes: [["rect", { x: "2.75", y: "2.75", width: "6", height: "4", rx: ".75" }], ["path", { d: "M5.75 6.75v8.5h5M5.75 10.25h5" }], ["rect", { x: "10.75", y: "8.25", width: "6.5", height: "4", rx: ".75" }], ["rect", { x: "10.75", y: "13.25", width: "6.5", height: "4", rx: ".75" }]] },
  // The approved layout's (design/layout/index.html): the bottom line's
  // Block edges, and the clamp's bold and italic while a text is written.
  bold: { viewBox: "0 0 20 20", shapes: [["path", { d: "M6 3.75h4.5a3.13 3.13 0 0 1 0 6.25H6zM6 10h5.25a3.13 3.13 0 0 1 0 6.25H6z" }]] },
  italic: { viewBox: "0 0 20 20", shapes: [["path", { d: "M8.75 3.75h6.5M4.75 16.25h6.5M12 3.75L8 16.25" }]] },
  edges: { viewBox: "0 0 20 20", shapes: [["path", { d: "M3.25 6.5V3.25H6.5M13.5 3.25h3.25V6.5M16.75 13.5v3.25H13.5M6.5 16.75H3.25V13.5" }], ["path", { d: "M9 3.25h2M9 16.75h2M3.25 9v2M16.75 9v2" }]] },
  section: { viewBox: "0 0 20 20", shapes: [["rect", { x: "2.75", y: "5.25", width: "14.5", height: "9.5", rx: "1" }]] },
  column: { viewBox: "0 0 20 20", shapes: [["rect", { x: "6.25", y: "2.75", width: "7.5", height: "14.5", rx: "1" }]] },
  question: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "10", cy: "10", r: "6.75" }], ["path", { d: "M8 8.25a2 2 0 1 1 2.75 1.85c-.45.2-.75.6-.75 1.1v.55" }], ["circle", { cx: "10", cy: "13.6", r: ".9", ...DOT }]] },
  page: { viewBox: "0 0 20 20", shapes: [["path", { d: "M5 2.75h6.5L15 6.25v11H5z" }], ["path", { d: "M11.5 2.75v3.5H15" }]] },
  bookmark: { viewBox: "0 0 20 20", shapes: [["path", { d: "M5.5 3h9v14l-4.5-3.5L5.5 17z" }]] },
  play: { viewBox: "0 0 20 20", shapes: [["path", { d: "M7 5v10l8-5z", ...DOT }]] },
  pin: { viewBox: "0 0 20 20", shapes: [["path", { d: "M10 17.5s5.25-5 5.25-9.25a5.25 5.25 0 0 0-10.5 0C4.75 12.5 10 17.5 10 17.5z" }], ["circle", { cx: "10", cy: "8.25", r: "2" }]] },
  more: { viewBox: "0 0 20 20", shapes: [["circle", { ...DOT, cx: "5", cy: "10", r: "1.25" }], ["circle", { ...DOT, cx: "10", cy: "10", r: "1.25" }], ["circle", { ...DOT, cx: "15", cy: "10", r: "1.25" }]] },
  spinner: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "10", cy: "10", r: "6.25", "stroke-opacity": ".3" }], ["path", { d: "M10 3.75A6.25 6.25 0 0 1 16.25 10" }]] },
  "arrow-up": { viewBox: "0 0 20 20", shapes: [["path", { d: "M10 16V4.5M5.5 9L10 4.5 14.5 9" }]] },
  "arrow-down": { viewBox: "0 0 20 20", shapes: [["path", { d: "M10 4v11.5M5.5 11l4.5 4.5 4.5-4.5" }]] },
  "arrow-left": { viewBox: "0 0 20 20", shapes: [["path", { d: "M16 10H4.5M9 5.5L4.5 10 9 14.5" }]] },
  "arrow-right": { viewBox: "0 0 20 20", shapes: [["path", { d: "M4 10h11.5M11 5.5l4.5 4.5-4.5 4.5" }]] },
  block: { viewBox: "0 0 20 20", shapes: [["circle", { cx: "10", cy: "10", r: "6.75" }], ["path", { d: "M5.25 14.75l9.5-9.5" }]] },
} as const satisfies Record<string, IconShapes>;

export type IconName = keyof typeof ICONS;

// A chrome icon. Decorative: the control around it carries the name.
export function Icon({ name, className = "i" }: { name: IconName; className?: string }) {
  const icon: IconShapes = ICONS[name];
  return (
    <svg className={className} viewBox={icon.viewBox} aria-hidden="true" focusable="false">
      {shapeElements(icon.shapes)}
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
