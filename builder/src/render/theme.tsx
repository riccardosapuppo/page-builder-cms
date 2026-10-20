// The site's header and footer around a page: the twin of site_part in
// cms/app/helpers/site_helper.rb. Each is a part of the site, a document
// made of sections like a page's (the storage's header and footer pages,
// GET /api/pages), drawn in its own element with the page's renderer; a
// part with no section draws nothing, not even its element. The canvas
// draws them locked (inert, and marked as the site's parts) around a page
// being edited, so the page is edited in its place, below the header it
// will have, and a click on one opens it. A header whose document says it
// is sticky stays at the top of the window (data-sticky, site.css), which
// holds its rows on each device (./policy.ts, stickyRows). The header's
// first section loads its picture at once, at the top of the window as the
// page's first is; the footer's wait until they near the view.
import { isObject } from "../document/json.ts";
import { PageSections } from "./blocks.tsx";
import type { RenderContext } from "./context.ts";
import { stickyRows } from "./policy.ts";

export type PartKind = "header" | "footer";

// The documents of the two parts, as the storage holds them: what the page
// root draws around the sections.
export interface SiteParts {
  header: unknown;
  footer: unknown;
}

// For the header whose document says it stays at the top, its rows on
// each device; null for any other part.
export function stickyHeader(kind: PartKind, document: unknown): string | null {
  return kind === "header" ? stickyRows(document) : null;
}

export function SitePart({ kind, document, ctx, locked = false }: { kind: PartKind; document: unknown; ctx: RenderContext; locked?: boolean }) {
  const sections = isObject(document) ? document.sections : undefined;
  if (!Array.isArray(sections) || sections.length === 0) return null;
  const Element = kind;
  return (
    <Element className={`sw-${kind}`} data-sticky={stickyHeader(kind, document) ?? undefined} inert={locked || undefined} data-theme-part={locked ? kind : undefined}>
      <PageSections document={document} ctx={ctx} eagerFirst={kind === "header"} />
    </Element>
  );
}
