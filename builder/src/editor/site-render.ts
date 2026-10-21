// What the site's renderer (../render/page.tsx) draws a page with in the
// editor, the canvas (./Canvas.tsx) and the Assistant's run window's preview
// (./AssistantRun.tsx) alike: the library's images, the collections'
// published entries and the shop's settings, as the interface's store holds
// them; on the canvas, a template's entry and the editor's own marks too.
// The same object until one of them changes, so that a block is drawn again
// only then (its context's hook, useDecoration, must stay the same function).
import { useMemo } from "react";
import type { RenderContext, ShownEntry } from "../render/context.ts";
import { collectionResolver } from "./collections/content.ts";
import { useUi } from "./context.tsx";
import { mediaResolver } from "./media.ts";

export function useSiteRender(entry: ShownEntry | null = null, useDecoration?: RenderContext["useDecoration"]): RenderContext {
  const media = useUi((u) => u.media);
  const siteEntries = useUi((u) => u.siteEntries);
  const siteShop = useUi((u) => u.siteShop);
  return useMemo<RenderContext>(
    () => ({ media: mediaResolver(media), collections: collectionResolver(siteEntries), entry, shop: siteShop, ...(useDecoration ? { useDecoration } : {}) }),
    [media, siteEntries, entry, siteShop, useDecoration],
  );
}
