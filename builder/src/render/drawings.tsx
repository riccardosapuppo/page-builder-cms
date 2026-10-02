// What the renderer draws besides the author's words: the icon box's icons,
// read from schema/icons.svg when the editor is built (virtual:site-icons,
// ../../build/site-icons.ts), and the theme's own drawings; and plain text
// whose line breaks become <br>. The twins of site_icon, theme_svg and
// text_with_breaks in cms/app/helpers/.
import { createElement, Fragment, type ReactNode } from "react";
import { SITE_ICONS } from "virtual:site-icons";

type Shape = readonly [element: string, attributes: Readonly<Record<string, string>>];

function shapeElements(shapes: readonly Shape[]): ReactNode[] {
  return shapes.map(([element, attributes], index) => {
    const { class: className, ...rest } = attributes;
    return createElement(element, { key: index, className, ...rest });
  });
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
// THEME_SHAPES, the ones the blocks draw.
const THEME_SHAPES = {
  // An opening quotation mark, blocks low and tails rising to the right.
  quote: ["0 0 48 36", [["path", { d: "M2 34h18V17h-8c0-5 2-8 6-9V1C7 3 2 9 2 17zM28 34h18V17h-8c0-5 2-8 6-9V1c-9 2-16 8-16 16z" }]]],
  play: ["0 0 20 20", [["path", { d: "M7 5v10l8-5z" }]]],
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
