// An image from the media library or another site: the twin of
// cms/app/views/blocks/_image.html.erb. Its size comes with it when the
// library knows it; its alt is empty when it is decorative; its crop on each
// device is a class (aspect-*, tokens.css). With nothing to show (an item
// gone from the library, a refused address) the block stays empty.
import { BlockRoot, blockProps, blockStyle } from "../../render/block-root.tsx";
import type { BlockRenderProps } from "../../render/context.ts";
import { BlockImg, blockImage } from "../../render/media.tsx";
import { styleClasses, visibilityClasses } from "../../render/style.ts";

export function ImageRender({ block, ctx, decoration }: BlockRenderProps) {
  const props = blockProps(block);
  const style = blockStyle(block);
  const image = blockImage(props, ctx.media);
  return (
    <BlockRoot
      block={block}
      classes={["w", "w-image", styleClasses(style, "aspect"), visibilityClasses(style)]}
      data={{ "media-id": typeof props.mediaId === "string" ? props.mediaId : null }}
      decoration={decoration}
    >
      {image && <figure className="sw-figure"><BlockImg item={props} image={image} /></figure>}
    </BlockRoot>
  );
}
