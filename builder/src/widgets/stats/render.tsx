// Figures side by side, each a value and the label that says what it
// counts: the twin of cms/app/views/blocks/_stats.html.erb. One
// description list, each figure a div of its term (the label) and its
// definition (the value), so a screen reader reads what a number counts
// before the number; site.css draws the value above the label. The colour
// is the colour of the values. An item that is not an object is left out.
import { isObject } from "../../document/json.ts";
import { BlockRoot, blockProps, blockStyle, propText } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

export function StatsRender({ block, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  const raw = blockProps(block).items;
  const items = Array.isArray(raw) ? raw.filter((item: unknown) => isObject(item)) : [];
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-stats", "sw-stats", styleClasses(style, "color"), styleClasses(style, "align"), visibilityClasses(style)]}
      data={freeColorData(style, "color")}
      decoration={decoration}
    >
      <dl>
        {items.map((item, index) => (
          <div key={index}>
            <dt>{propText(item, "label")}</dt>
            <dd>{propText(item, "value")}</dd>
          </div>
        ))}
      </dl>
    </BlockRoot>
  );
}
