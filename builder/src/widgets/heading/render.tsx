// A heading, level 1 to 4, optionally a link: the twin of
// cms/app/views/blocks/_heading.html.erb. Its size is the level's step
// unless the style names another; a level out of range is a level 2, and
// an address the URL policy refuses leaves the text without a link. On
// the canvas, while the person writes in it, its line stands in the
// heading's place (decoration.editing, ../../editor/HeadingEditor.tsx).
import { createElement } from "react";
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { linkHref } from "../../render/policy.ts";
import { freeColorData, freeTypeData, styleClasses, visibilityClasses } from "../../render/style.ts";

export const LEVEL_SIZES = { 1: "heading-1", 2: "heading-2", 3: "heading-3", 4: "large" } as const;

// The level a heading is drawn at: its own, or 2 when it is out of range.
export function headingLevel(props: Readonly<Record<string, unknown>>): 1 | 2 | 3 | 4 {
  return Number.isInteger(props.level) && (props.level as number) >= 1 && (props.level as number) <= 4 ? (props.level as 1 | 2 | 3 | 4) : 2;
}

export function HeadingRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  const level = headingLevel(props);
  const href = linkHref(props.href);
  const text = propText(props, "text");
  const drawn = createElement(`h${level}`, null, href === null ? text : <a href={href}>{text}</a>);
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-heading", styleClasses(style, "textSize", { fallback: LEVEL_SIZES[level] }), styleClasses(style, "typeface"), styleClasses(style, "color"), styleClasses(style, "align"), visibilityClasses(style)]}
      data={{ ...freeColorData(style, "color"), ...freeTypeData(style) }}
      decoration={decoration}
    >
      {decoration?.editing ? decoration.editing(drawn) : drawn}
    </BlockRoot>
  );
}
