// A grid of images, three across on desktop and two below: the twin of
// cms/app/views/blocks/_gallery.html.erb. spaceBetween is the gap between
// them; an item with nothing to show is left out.
import type { ReactNode } from "react";
import { isObject } from "../../document/json.ts";
import { BlockRoot, blockProps, blockStyle, classNames } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { BlockImg, blockImage } from "../../render/media.tsx";
import { styleClasses, visibilityClasses } from "../../render/style.ts";

export function GalleryRender({ block, ctx, decoration }: BlockRenderProps) {
  const style = blockStyle(block);
  const items = blockProps(block).items;
  const images: ReactNode[] = [];
  if (Array.isArray(items)) {
    items.forEach((item: unknown, index) => {
      const image = blockImage(item, ctx.media);
      if (image && isObject(item)) images.push(<li key={index}><BlockImg item={item} image={image} /></li>);
    });
  }
  return (
    <BlockRoot block={block} classes={["w", "w-gallery", visibilityClasses(style)]} decoration={decoration}>
      <ul className={classNames("sw-gallery", styleClasses(style, "spaceBetween"))}>{images}</ul>
    </BlockRoot>
  );
}
