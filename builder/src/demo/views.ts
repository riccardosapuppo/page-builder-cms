// The demo's own pages, on the editor's address: a page's draft as it
// would be published (?preview=<id>), and the page as it was published in
// this browser (?published=<id>). With no CMS to serve a preview or a live
// page, the demo draws them itself (./PageView.tsx).
export type ViewKind = "preview" | "published";

export interface View {
  kind: ViewKind;
  pageId: number;
}

export const previewAddress = (pageId: number): string => `?preview=${pageId}`;
export const publishedAddress = (pageId: number): string => `?published=${pageId}`;

// The view an address asks for, or null for the editor. An id that is not
// a page id is the editor too, never a view of nothing.
export function readView(search: string): View | null {
  const params = new URLSearchParams(search);
  for (const kind of ["published", "preview"] as const) {
    const raw = params.get(kind);
    if (raw === null) continue;
    const pageId = /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : Number.NaN;
    return Number.isSafeInteger(pageId) ? { kind, pageId } : null;
  }
  return null;
}
