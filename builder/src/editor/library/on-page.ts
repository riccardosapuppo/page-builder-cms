// The library images a page shows: every mediaId of its image blocks and
// of its gallery items, the two places the schema lets one stand.
import type { Block, PageDocument } from "../../shared/document.ts";

export function mediaIdsOn(doc: PageDocument): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (block: Block) => {
    const props = block.props as Record<string, unknown>;
    if (typeof props.mediaId === "string") ids.add(props.mediaId);
    if (Array.isArray(props.items)) {
      for (const item of props.items as unknown[]) {
        const id = item !== null && typeof item === "object" ? (item as { mediaId?: unknown }).mediaId : undefined;
        if (typeof id === "string") ids.add(id);
      }
    }
    for (const child of block.children as readonly Block[]) visit(child);
  };
  for (const section of doc.sections) visit(section);
  return ids;
}
