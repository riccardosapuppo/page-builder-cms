// Where a document's links lead: a button's, a heading's, a menu's, a
// text's (a link mark), read from the blocks' props as they are stored,
// for the editor to tell whether the site's header or footer links to a
// page (../editor/panels/EditPanel.tsx).
import type { PageDocument } from "../shared/document.ts";

export function linkTargets(doc: PageDocument): string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, inner] of Object.entries(value)) {
      if (key === "href" && typeof inner === "string") found.push(inner.trim());
      else walk(inner);
    }
  };
  const blocks = (list: readonly { props: unknown; children?: readonly unknown[] }[]): void => {
    for (const block of list) {
      walk(block.props);
      blocks((block.children ?? []) as readonly { props: unknown; children?: readonly unknown[] }[]);
    }
  };
  blocks(doc.sections);
  return found;
}

// Whether a link leads to the page at `path` ("/winter-series"): to the
// page itself, to one of its sections, or with a query.
export function leadsTo(href: string, path: string): boolean {
  return href === path || href === `${path}/` || href.startsWith(`${path}#`) || href.startsWith(`${path}?`);
}
