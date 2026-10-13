// A horizontal line: the twin of cms/app/views/blocks/_divider.html.erb.
// Its colour is the colour of the line (line-*, not fg-*).
import { BlockRoot, blockStyle } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { freeColorData, styleClasses, visibilityClasses } from "../../render/style.ts";

export function DividerRender({ block, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  return (
    <BlockRoot block={block} classes={["w", "w-divider", styleClasses(style, "color", { family: "line" }), visibilityClasses(style)]} data={freeColorData(style, "color", { family: "line" })} decoration={decoration}>
      <hr className="sw-divider" />
    </BlockRoot>
  );
}
