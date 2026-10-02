// Empty space of one spacing step, which screen readers skip: the twin of
// cms/app/views/blocks/_spacer.html.erb. A size the schema does not list
// gives no height class and no data-size.
import { BlockRoot, blockProps, blockStyle } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { isSpaceToken, visibilityClasses } from "../../render/style.ts";

export function SpacerRender({ block, decoration }: BlockRenderProps) {
  const size = blockProps(block).size;
  const step = isSpaceToken(size) ? size : null;
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-spacer", step && `spacer-${step}`, visibilityClasses(blockStyle(block))]}
      attributes={{ "aria-hidden": "true" }}
      data={{ size: step }}
      decoration={decoration}
    />
  );
}
