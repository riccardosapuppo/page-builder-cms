// The demo's own pages, on the editor's address: a page's draft as it
// would be published (?preview=<id>), the page as it was published in
// this browser (?published=<id>), and an entry of a collection as it was
// published here (?entry=<entry id>), drawn with its collection's
// template. A template's preview takes the entry it is drawn with
// (?preview=<template id>&entry=<entry id>, or entry=sample for values
// made up from its fields' types). With no CMS to serve a preview or a
// live page, the demo draws them itself (./PageView.tsx).
export type ViewKind = "preview" | "published" | "entry";

// What a template's preview is drawn with: an entry's draft, or the
// made-up values; absent, the first published entry.
export type EntryPick = number | "sample";

export type View =
  | { kind: "preview" | "published"; pageId: number; entry?: EntryPick }
  | { kind: "entry"; entryId: number };

export const previewAddress = (pageId: number): string => `?preview=${pageId}`;
export const publishedAddress = (pageId: number): string => `?published=${pageId}`;
export const entryAddress = (entryId: number): string => `?entry=${entryId}`;

const idOf = (raw: string): number | null => {
  const id = /^[1-9][0-9]{0,15}$/.test(raw) ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(id) ? id : null;
};

// The view an address asks for, or null for the editor. An id that is not
// a page id is the editor too, never a view of nothing.
export function readView(search: string): View | null {
  const params = new URLSearchParams(search);
  for (const kind of ["published", "preview"] as const) {
    const raw = params.get(kind);
    if (raw === null) continue;
    const pageId = idOf(raw);
    if (pageId === null) return null;
    const asked = params.get("entry");
    const entry = asked === "sample" ? "sample" : asked === null ? null : idOf(asked);
    return entry === null ? { kind, pageId } : { kind, pageId, entry };
  }
  const raw = params.get("entry");
  const entryId = raw === null ? null : idOf(raw);
  return entryId === null ? null : { kind: "entry", entryId };
}
