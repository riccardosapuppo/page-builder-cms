// Rich text: the twin of cms/app/views/blocks/_text.html.erb. The text is
// drawn by ../../render/rich-text.tsx and kept for as long as the block
// keeps the same document object: a change elsewhere on the page, or to
// this block's style, does not draw its text again.
import { useMemo } from "react";
import { BlockRoot, blockProps, blockStyle } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { renderRichText } from "../../render/rich-text.tsx";
import { styleClasses, visibilityClasses } from "../../render/style.ts";

export function TextRender({ block, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  const doc = blockProps(block).doc;
  const text = useMemo(() => renderRichText(doc), [doc]);
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-text", styleClasses(style, "textSize"), styleClasses(style, "color"), styleClasses(style, "align"), visibilityClasses(style)]}
      decoration={decoration}
    >
      {text}
    </BlockRoot>
  );
}
