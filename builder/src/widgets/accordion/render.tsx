// Questions that open to their answers, with no script: the twin of
// cms/app/views/blocks/_accordion.html.erb. The first one starts open, as
// the approved design draws it; the colour is the colour of the lines
// between them. An item that is not an object is left out, and the first
// one that is starts open.
import { isObject } from "../../document/json.ts";
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { TextWithBreaks } from "../../render/drawings.tsx";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

export function AccordionRender({ block, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  const raw = blockProps(block).items;
  const items = Array.isArray(raw) ? raw.filter((item: unknown) => isObject(item)) : [];
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-accordion", "sw-accordion", styleClasses(style, "color", { family: "line" }), visibilityClasses(style)]}
      data={freeColorData(style, "color", { family: "line" })}
      decoration={decoration}
    >
      {items.map((item, index) => (
        <details key={index} open={index === 0}>
          <summary>{propText(item, "question")}</summary>
          <p><TextWithBreaks text={propText(item, "answer")} /></p>
        </details>
      ))}
    </BlockRoot>
  );
}
