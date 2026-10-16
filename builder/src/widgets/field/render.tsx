// A value of the entry a collection's template is drawn with: the twin of
// cms/app/views/blocks/_field.html.erb. It draws as the widget its value's
// type draws as (./drawing.ts), with that widget's classes and settings, in
// a root of its own (w-field, data-field): a heading, a text, an image or a
// button, each with the markup of the widget's own renderer. A value the
// entry has not, and a field on a page that is no template, leave the root
// empty and hidden, so it takes no room in its column; the canvas shows it
// all the same, faintly, saying so (../../editor/Canvas.tsx).
import { createElement, type ReactNode } from "react";
import { BlockRoot, blockProps, blockStyle, classNames } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { TextWithBreaks } from "../../render/drawings.tsx";
import { BlockImg, blockImage } from "../../render/media.tsx";
import { linkHref } from "../../render/policy.ts";
import { renderRichText } from "../../render/rich-text.tsx";
import { freeColorData, freeTypeData, styleClasses, visibilityClasses } from "../../render/style.ts";
import { LEVEL_SIZES } from "../heading/render.tsx";
import { fieldDrawing } from "./drawing.ts";

// data-<name> attributes for an element that is not a BlockRoot.
function dataAttributes(data: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(data).map(([name, value]) => [`data-${name}`, value]));
}

export function FieldRender({ block, ctx, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  const drawing = fieldDrawing(props, ctx.entry, ctx.shop);
  const field = { field: typeof props.field === "string" ? props.field : null };
  if (drawing === null) return <BlockRoot block={block} classes={["w", "w-field"]} data={field} attributes={{ hidden: true }} decoration={decoration} />;
  const text = (content: ReactNode) => (
    <BlockRoot
      block={block}
      classes={["w", "w-field", "w-text", styleClasses(style, "textSize"), styleClasses(style, "typeface"), styleClasses(style, "color"), styleClasses(style, "align"), visibilityClasses(style)]}
      data={{ ...field, ...freeColorData(style, "color"), ...freeTypeData(style) }}
      decoration={decoration}
    >
      {content}
    </BlockRoot>
  );
  switch (drawing.shape) {
    case "heading":
      return (
        <BlockRoot
          block={block}
          classes={["w", "w-field", "w-heading", styleClasses(style, "textSize", { fallback: LEVEL_SIZES[drawing.level] }), styleClasses(style, "typeface"), styleClasses(style, "color"), styleClasses(style, "align"), visibilityClasses(style)]}
          data={{ ...field, ...freeColorData(style, "color"), ...freeTypeData(style) }}
          decoration={decoration}
        >
          {createElement(`h${drawing.level}`, null, drawing.text)}
        </BlockRoot>
      );
    case "text":
      if ("doc" in drawing) return text(renderRichText(drawing.doc));
      if ("day" in drawing) return text(<p><time dateTime={drawing.day}>{drawing.words}</time></p>);
      return text(drawing.paragraphs.map((paragraph, index) => <p key={index}><TextWithBreaks text={paragraph} /></p>));
    case "image": {
      const image = blockImage(drawing.item, ctx.media);
      return (
        <BlockRoot block={block} classes={["w", "w-field", "w-image", styleClasses(style, "aspect"), visibilityClasses(style)]} data={{ ...field, "media-id": drawing.item.mediaId as string }} decoration={decoration}>
          {image && <figure className="sw-figure"><BlockImg item={drawing.item} image={image} /></figure>}
        </BlockRoot>
      );
    }
    case "button":
      return (
        <BlockRoot block={block} classes={["w", "w-field", "w-button", styleClasses(style, "align"), visibilityClasses(style)]} data={field} decoration={decoration}>
          <a className={classNames("sw-btn", styleClasses(style, "background"), styleClasses(style, "color"))} href={linkHref(drawing.href) ?? undefined} {...dataAttributes({ ...freeColorData(style, "background"), ...freeColorData(style, "color") })}>
            {drawing.label}
          </a>
        </BlockRoot>
      );
  }
}
