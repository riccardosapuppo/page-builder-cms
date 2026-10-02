// Images of image blocks and gallery items: the twin of block_image,
// block_image_alt and block_img in cms/app/helpers/blocks_helper.rb.
import { isObject } from "../document/json.ts";
import type { MediaImage, MediaResolver } from "./context.ts";
import { imageSrc } from "./policy.ts";

// What to show for one image, or null when there is nothing: a library item
// the resolver does not know, or an address the URL policy refuses. A
// mediaId wins over a url, as on the server.
export function blockImage(item: unknown, media: MediaResolver): MediaImage | null {
  if (!isObject(item)) return null;
  if (typeof item.mediaId === "string") {
    return media(item.mediaId) ?? null;
  }
  const src = imageSrc(item.url);
  return src === null ? null : { src };
}

// Empty for a decorative image, which a screen reader then skips; otherwise
// the block's own.
export function blockImageAlt(item: Record<string, unknown>): string {
  if (item.decorative === true) return "";
  return typeof item.alt === "string" ? item.alt : "";
}

// The <img> of an image blockImage found.
export function BlockImg({ item, image }: { item: Record<string, unknown>; image: MediaImage }) {
  return (
    <img
      src={image.src}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      alt={blockImageAlt(item)}
      loading="lazy"
      decoding="async"
    />
  );
}

// The contract's resolver, the same rule as the server's for its goldens
// (cms/test/support/contract_media.rb): every mediaId is
// /media/<id>.png, 800 by 600, except an id starting with "missing", which
// stands for an item deleted from the library.
export const contractMedia: MediaResolver = (mediaId) =>
  mediaId.startsWith("missing") ? null : { src: `/media/${mediaId}.png`, width: 800, height: 600 };
