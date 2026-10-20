// The library images a page shows: every mediaId of its blocks' props,
// wherever it stands (an image block's, a gallery item's, a section's
// picture's), as the CMS and the browser's storage count a use of an item
// (BlockDocument.media_refs, ../../storage/browser-rules.ts): any member
// called mediaId, so a place added later is found too.
import type { Block, PageDocument } from "../../shared/document.ts";

export function mediaIdsOn(doc: PageDocument): ReadonlySet<string> {
  const ids = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "mediaId" && typeof child === "string") ids.add(child);
      else walk(child);
    }
  };
  const visit = (block: Block) => {
    walk(block.props);
    for (const child of block.children as readonly Block[]) visit(child);
  };
  for (const section of doc.sections) visit(section);
  return ids;
}
