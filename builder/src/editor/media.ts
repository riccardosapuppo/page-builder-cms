// Library images for the canvas and the panels: a page names an image by
// its mediaId, and the media library the CMS gave says where it is served
// and how large it is. An id the library does not have shows nothing, as on
// the published page.
import type { MediaResolver } from "../render/context.ts";
import type { MediaItem } from "../storage/adapter.ts";

export function mediaResolver(media: ReadonlyMap<string, MediaItem>): MediaResolver {
  return (mediaId) => {
    const item = media.get(mediaId);
    return item ? { src: item.url, width: item.width, height: item.height } : null;
  };
}
