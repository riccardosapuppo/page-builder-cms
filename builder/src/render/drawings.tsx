// What the renderer draws besides the author's words: the icon box's icons,
// read from schema/icons.svg when the editor is built (virtual:site-icons,
// ../../build/site-icons.ts), and the theme's own drawings; and plain text
// whose line breaks become <br>. The twins of site_icon, theme_svg and
// text_with_breaks in cms/app/helpers/.
import { createElement, Fragment, type ReactNode } from "react";
import { SITE_ICONS } from "virtual:site-icons";

// One shape of an SVG drawing: an element name and its attributes as SVG
// writes them (class, stroke-dasharray).
export type Shape = readonly [element: string, attributes: Readonly<Record<string, string>>];

// The attributes under React's names, which React writes back as SVG's:
// class is className, a hyphenated presentation attribute is camel-cased
// (stroke-dasharray is strokeDasharray), aria-* and data-* stay as they are.
function reactProps(attributes: Shape[1]): Record<string, string> {
  return Object.fromEntries(Object.entries(attributes).map(([name, value]) => {
    if (name === "class") return ["className", value];
    if (name.startsWith("aria-") || name.startsWith("data-")) return [name, value];
    return [name.replace(/-([a-z])/g, (_whole, letter: string) => letter.toUpperCase()), value];
  }));
}

// The shapes as React elements: the icon box's icons and the theme's
// drawings here, and the widget panel's tiles (../widgets/icon.tsx).
export function shapeElements(shapes: readonly Shape[]): ReactNode[] {
  return shapes.map(([element, attributes], index) => createElement(element, { key: index, ...reactProps(attributes) }));
}

// Whether a name is an icon of the set. The names are own keys of the
// generated object only, so "constructor" or "__proto__" is no icon.
export function isSiteIcon(name: unknown): name is string {
  return typeof name === "string" && Object.hasOwn(SITE_ICONS, name);
}

export function SiteIcon({ name, className }: { name: string; className: string }) {
  if (!isSiteIcon(name)) return null;
  const icon = SITE_ICONS[name]!;
  return (
    <svg className={className} viewBox={icon.viewBox ?? undefined} aria-hidden="true" focusable="false">
      {shapeElements(icon.shapes)}
    </svg>
  );
}

// The drawings of the theme itself, the same on every page: BlocksHelper's
// THEME_SHAPES, the ones the blocks and the site's header and footer draw.
const THEME_SHAPES = {
  // The site's mark: a sea disc, the sun half risen, the waterline.
  mark: ["0 0 24 24", [["circle", { cx: "12", cy: "12", r: "11" }], ["path", { class: "sun", d: "M6 13.5a6 6 0 0 1 12 0z" }], ["path", { class: "line", d: "M1 13.5h22" }]]],
  // An opening quotation mark, blocks low and tails rising to the right.
  quote: ["0 0 48 36", [["path", { d: "M2 34h18V17h-8c0-5 2-8 6-9V1C7 3 2 9 2 17zM28 34h18V17h-8c0-5 2-8 6-9V1c-9 2-16 8-16 16z" }]]],
  play: ["0 0 20 20", [["path", { d: "M7 5v10l8-5z" }]]],
  menu: ["0 0 20 20", [["path", { d: "M3 5.5h14M3 10h14M3 14.5h14" }]]],
} as const satisfies Record<string, readonly [string, readonly Shape[]]>;

export function ThemeSvg({ name, className }: { name: keyof typeof THEME_SHAPES; className: string }) {
  const [viewBox, shapes] = THEME_SHAPES[name];
  return (
    <svg className={className} viewBox={viewBox} aria-hidden="true" focusable="false">
      {shapeElements(shapes)}
    </svg>
  );
}

// A plain-text field that may hold line breaks (\n only): each break
// becomes a <br>, everything else is text.
export function TextWithBreaks({ text }: { text: string }) {
  const lines = text.split("\n");
  return <>{lines.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{line}</Fragment>)}</>;
}
