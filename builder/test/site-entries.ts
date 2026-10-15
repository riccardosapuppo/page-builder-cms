// Collections and entries as the storage gives them, for the tests of what
// the canvas draws from them (../src/editor/collections/content.ts): News,
// with a summary, a picture, a day and a toggle, its template a page of id
// 90; and entries of it, published or not, by their days.
import type { SiteEntries } from "../src/editor/collections/content.ts";
import type { Field } from "../src/shared/collection.ts";
import type { Collection, Entry, PageSummary } from "../src/storage/adapter.ts";

export const NEWS_FIELDS: readonly Field[] = [
  { key: "summary", label: "Summary", type: "paragraph", required: false },
  { key: "picture", label: "Picture", type: "image", required: false },
  { key: "day", label: "Day", type: "date", required: false },
  { key: "members-only", label: "Members only", type: "toggle", required: false },
];

export function templateOf(id: number, title: string): PageSummary {
  return {
    id, kind: "template", title, slug: null, home: false, revision: 1, updatedAt: "2026-10-01T09:00:00.000Z", published: null, scheduled: null,
    links: { self: `/api/pages/${id}`, draft: "", versions: "", publish: "", schedules: "", preview: `/preview/${id}`, live: null },
  };
}

export function newsCollection(changes: Partial<Collection> = {}): Collection {
  return {
    id: 3, name: "News", prefix: "news", fields: [...NEWS_FIELDS], sort: { by: "day", direction: "desc" },
    publishedRevision: 2, entryCount: 0, publishedCount: 0, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-01T09:00:00.000Z",
    template: templateOf(90, "News"), ...changes,
  };
}

// An entry of News: its draft, and what is live, the draft itself when
// `live` (published on publishedAt), else nothing.
export function newsEntry(id: number, title: string, day: string, options: { live?: boolean; publishedAt?: string; values?: Record<string, unknown>; slug?: string } = {}): Entry {
  const slug = options.slug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const values = { summary: `About ${title}.`, day, ...options.values } as Entry["values"];
  return {
    id, collectionId: 3, title, slug, values, revision: 1, lastSaveId: null, createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-02T09:00:00.000Z",
    published: options.live === false ? null : { title, slug, values, draftRevision: 1, publishedAt: options.publishedAt ?? `${day}T08:00:00.000Z` },
  };
}

export function siteOf(collection: Collection, entries: readonly Entry[]): SiteEntries {
  return { collections: [collection], entries: new Map([[collection.id, entries]]) };
}
