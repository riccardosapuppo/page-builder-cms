// What the canvas's Collection lists and Field blocks draw from: the
// storage's collections and every entry of each, read when the editor
// starts and again when the Collections screen closes (../App.tsx), and
// handed to the renderer as the server hands it the database's
// (SiteContent, cms/app/models/site_content.rb): a list draws a
// collection's published entries, as they went live, on the canvas as on
// the site; a template is drawn with one entry's draft, the one its Page
// tab picks (../panels/EditPanel.tsx, TemplatePanel), the first published
// by default, or with values made up from its fields' types when its
// collection has no entry. Pure: no React.
import type { CollectionResolver, ListedCollection, ShownEntry } from "../../render/context.ts";
import type { CollectionDefinition, EntryValues, Field } from "../../shared/collection.ts";
import type { ListOrder } from "../../shared/document.ts";
import { orderedBy, type SortValue } from "../../shared/entry-order.ts";
import type { Collection, Entry } from "../../storage/adapter.ts";
import type { ListStart } from "../../widgets/types.ts";
import type { CollectionsStorage } from "./context.ts";

// The collections, oldest first, and the entries of each by its id.
export interface SiteEntries {
  collections: readonly Collection[];
  entries: ReadonlyMap<number, readonly Entry[]>;
}

// Every collection and all its entries, read through the storage: one
// request for the collections, then one for each one's entries.
export async function readSiteEntries(storage: Pick<CollectionsStorage, "listCollections" | "listEntries">): Promise<SiteEntries> {
  const collections = await storage.listCollections();
  const lists = await Promise.all(collections.map((collection) => storage.listEntries(collection.id)));
  return { collections, entries: new Map(collections.map((collection, at) => [collection.id, lists[at] ?? []])) };
}

// A collection as a list draws it: its published entries, as each went
// live.
export function listedCollection(collection: Pick<Collection, "id" | "prefix" | "fields">, entries: readonly Entry[]): ListedCollection {
  return {
    id: collection.id,
    prefix: collection.prefix,
    fields: collection.fields,
    entries: entries.flatMap((entry) => (entry.published
      ? [{ id: entry.id, title: entry.published.title, slug: entry.published.slug, values: entry.published.values, publishedAt: entry.published.publishedAt }]
      : [])),
  };
}

// The renderer's way to the collections the lists name.
export function collectionResolver(site: SiteEntries | null): CollectionResolver {
  const made = new Map<number, ListedCollection>();
  return (id) => {
    const collection = site?.collections.find((one) => one.id === id);
    if (!collection) return null;
    let listed = made.get(id);
    if (!listed) {
      listed = listedCollection(collection, site?.entries.get(id) ?? []);
      made.set(id, listed);
    }
    return listed;
  };
}

// How many of a collection's entries no list shows, since they are not
// published.
export const draftCount = (entries: readonly Entry[] | undefined): number => (entries ?? []).filter((entry) => entry.published === null).length;

// The value the collection's own order follows, as the API reads it
// (EntriesController#sort_value): a time, the title, a date field's text
// or a number field's number.
function sortValue(entry: Entry, by: string, fields: readonly Field[]): SortValue {
  if (by === "title") return entry.title;
  if (by === "updatedAt") return entry.updatedAt;
  if (by === "publishedAt") return entry.published?.publishedAt ?? null;
  const type = fields.find((field) => field.key === by)?.type;
  const found: unknown = entry.values[by];
  if (type === "date" && typeof found === "string") return found;
  if (type === "number" && typeof found === "number") return found;
  return null;
}

// A collection's entries in its own order, as the CMS lists them.
export function inOrder(collection: Pick<CollectionDefinition, "sort" | "fields">, entries: readonly Entry[]): Entry[] {
  return orderedBy(entries, (entry) => sortValue(entry, collection.sort.by, collection.fields), collection.sort.direction === "desc");
}

// The entry a template is drawn with by default: the first published one
// in its collection's own order, else its first, as the CMS's preview
// takes it (PreviewsController); null for a collection with none.
export function firstEntry(collection: Pick<CollectionDefinition, "sort" | "fields">, entries: readonly Entry[]): Entry | null {
  const ordered = inOrder(collection, entries);
  return ordered.find((entry) => entry.published !== null) ?? ordered[0] ?? null;
}

// An entry's draft, as its template's Field blocks draw it on the canvas
// and in the preview (or what it went live with, given that), with its id
// and its collection's, which the template's lists of that collection
// leave out.
export function shownEntry(collection: Pick<Collection, "id" | "fields">, entry: Pick<Entry, "id" | "title" | "slug" | "values">): ShownEntry {
  return { id: entry.id, collectionId: collection.id, fields: collection.fields, title: entry.title, slug: entry.slug, values: entry.values };
}

// The title of the entry made up for a collection with none.
export const SAMPLE_TITLE = "The title of an entry";

// A day as an entry keeps it, YYYY-MM-DD, in the browser's own calendar.
const dayOf = (now: Date): string =>
  `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

// A value of every field made up from its type, as the CMS's preview makes
// them (CollectionTemplate.sample): its label for a text, a line about it
// for a paragraph and a rich text, its lowest number (or its highest, or
// 12), today, its label and the top of the page for a link, a toggle on,
// its first option; no image, which no field could make up. Its
// collection's id comes with it, when known, by which a price is drawn in
// the shop's currency; it has no id of its own, being no entry, so no list
// leaves it out and no Add to cart puts it in a cart.
export function sampleEntry(collection: Pick<CollectionDefinition, "fields"> & { id?: number }, today: Date): ShownEntry {
  const values: EntryValues = {};
  for (const field of collection.fields) {
    switch (field.type) {
      case "text":
        values[field.key] = field.label;
        break;
      case "paragraph":
        values[field.key] = `${field.label}: a few lines, as each entry writes them.`;
        break;
      case "richText":
        values[field.key] = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `${field.label}: paragraphs, lists and links, as each entry writes them.` }] }] };
        break;
      case "number":
        values[field.key] = field.min ?? field.max ?? 12;
        break;
      case "date":
        values[field.key] = dayOf(today);
        break;
      case "link":
        values[field.key] = { label: field.label, href: "#" };
        break;
      case "toggle":
        values[field.key] = true;
        break;
      case "choice":
        if (field.options[0] !== undefined) values[field.key] = field.options[0];
        break;
      case "image":
        break;
    }
  }
  return { ...(collection.id === undefined ? {} : { collectionId: collection.id }), fields: collection.fields, title: SAMPLE_TITLE, slug: "sample", values };
}

// What a template's Page tab says it is drawn with, and the entry itself:
// the entry the person picked, if it is still there; else the default.
export type PreviewChoice = number | "sample";

export function previewedEntry(collection: Pick<Collection, "sort" | "fields">, entries: readonly Entry[], picked: PreviewChoice | null): Entry | null {
  if (picked === "sample") return null;
  return (picked === null ? undefined : entries.find((entry) => entry.id === picked)) ?? firstEntry(collection, entries);
}

// The entry a collection's template is drawn with on the canvas: the one
// picked, else the first published, its draft; values made up when the
// collection has none; nothing while the collections are not read yet.
export function templateEntry(site: SiteEntries | null, collectionId: number, picked: PreviewChoice | null, today: Date): ShownEntry | null {
  const collection = site?.collections.find((one) => one.id === collectionId);
  if (!site || !collection) return null;
  const entry = previewedEntry(collection, site.entries.get(collectionId) ?? [], picked);
  return entry ? shownEntry(collection, entry) : sampleEntry(collection, today);
}

// The address of a template's preview, with what it is drawn with
// (PreviewsController: /preview/<template id>?entry=<entry id>, or
// ?entry=sample for the made-up values; the demo's ?preview=<id>&entry=...),
// as the canvas draws it.
export function previewWithEntry(href: string, shown: Entry | "sample"): string {
  return `${href}${href.includes("?") ? "&" : "?"}entry=${shown === "sample" ? "sample" : shown.id}`;
}

// What a template is drawn with on the canvas, for its preview's address:
// an entry, or the made-up values; null while the collections are not
// read yet.
export function templateShown(site: SiteEntries | null, collectionId: number, picked: PreviewChoice | null): Entry | "sample" | null {
  const collection = site?.collections.find((one) => one.id === collectionId);
  if (!site || !collection) return null;
  return previewedEntry(collection, site.entries.get(collectionId) ?? [], picked) ?? "sample";
}

// The address of a page's preview, the Preview button's and the one its
// shortcut opens: a template's names what the canvas draws it with.
export function previewAddressOf(
  page: { kind: string; collection?: { id: number } | null | undefined; links: { preview: string } },
  site: SiteEntries | null,
  picked: { collectionId: number; choice: PreviewChoice } | null,
): string {
  const collectionId = page.kind === "template" ? page.collection?.id : undefined;
  const shown = collectionId === undefined ? null : templateShown(site, collectionId, picked?.collectionId === collectionId ? picked.choice : null);
  return shown === null ? page.links.preview : previewWithEntry(page.links.preview, shown);
}

// What a new Collection list starts from (../../widgets/types.ts): the
// first collection, and its own order where a list can follow it; a list
// never follows the last save, which a visitor does not see, and goes by
// when its entries went live instead.
export function listStart(site: SiteEntries | null): ListStart | null {
  const first = site?.collections[0];
  if (!first) return null;
  const order: ListOrder = first.sort.by === "updatedAt" ? { by: "publishedAt", direction: "desc" } : { by: first.sort.by, direction: first.sort.direction };
  return { collection: first.id, order };
}
