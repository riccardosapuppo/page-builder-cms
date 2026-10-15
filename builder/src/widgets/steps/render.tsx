// Numbered steps in order, each a title and what it means: the twin of
// cms/app/views/blocks/_steps.html.erb. One ordered list, each step an item
// of its title, a heading of level 3, then its text with its line breaks.
// The number is no text of the page: site.css draws it before each item, a
// counter in a disc, and the ordered list gives a screen reader the order.
// The colour is the colour of the discs, kept as an accordion keeps the
// colour of its lines, so the titles and the texts keep the band's. An
// item that is not an object is left out.
import { isObject } from "../../document/json.ts";
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { TextWithBreaks } from "../../render/drawings.tsx";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

export function StepsRender({ block, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  const raw = blockProps(block).items;
  const items = Array.isArray(raw) ? raw.filter((item: unknown) => isObject(item)) : [];
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-steps", "sw-steps", styleClasses(style, "color", { family: "line" }), visibilityClasses(style)]}
      data={freeColorData(style, "color", { family: "line" })}
      decoration={decoration}
    >
      <ol>
        {items.map((item, index) => (
          <li key={index}>
            <h3>{propText(item, "title")}</h3>
            <p><TextWithBreaks text={propText(item, "text")} /></p>
          </li>
        ))}
      </ol>
    </BlockRoot>
  );
}
