// A quotation, in the Heading 3 step unless the style names another, with
// who said it when the block says: the twin of
// cms/app/views/blocks/_quote.html.erb.
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { TextWithBreaks, ThemeSvg } from "../../render/drawings.tsx";
import { styleClasses, visibilityClasses } from "../../render/style.ts";

export function QuoteRender({ block, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-quote", styleClasses(style, "textSize", { fallback: "heading-3" }), styleClasses(style, "color"), styleClasses(style, "align"), visibilityClasses(style)]}
      decoration={decoration}
    >
      <figure className="sw-quote">
        <ThemeSvg name="quote" className="sw-quote-mark" />
        <blockquote><p><TextWithBreaks text={propText(props, "text")} /></p></blockquote>
        {typeof props.attribution === "string" && <figcaption>{props.attribution}</figcaption>}
      </figure>
    </BlockRoot>
  );
}
