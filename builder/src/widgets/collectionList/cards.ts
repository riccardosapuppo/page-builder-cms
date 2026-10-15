// What a Collection list draws, read from its props and its collection:
// which entries (the published ones the storage gave, those its filter
// keeps, in its order, as many as it shows) and each one's card. The twin
// of CollectionList (cms/app/models/collection_list.rb), held to it by the
// render contract.
//
// A list reads its collection's fields by their keys, never trusting a
// key to hold what it held when the list was made: a field renamed,
// deleted or given another type since is no field of the kind the list
// wants, and draws nothing; a filter by it keeps no entry, rather than
// let every entry through a list meant to show a few.
//
// On an entry's page (its collection's template, drawn with it), a list
// of that collection leaves the entry out: "More from the club" never
// lists the story above it.
import { isObject } from "../../document/json.ts";
import type { ListedCollection, ListedEntry, ShownEntry } from "../../render/context.ts";
import { dayOf, fieldOf, valueOf } from "../../render/entry-words.ts";
import { linkHref } from "../../render/policy.ts";
import { LIST_COLUMNS, LIST_LAYOUTS, type ListLayout } from "../../shared/document.ts";
import { orderedBy, type SortValue } from "../../shared/entry-order.ts";

// What a new list holds, and what a value the schema does not list is
// read as.
export const LIST_DEFAULTS = { count: 3, layout: "grid", columns: 3 } as const;
export const MOST_ENTRIES = 24;

export function listLayout(props: Readonly<Record<string, unknown>>): ListLayout {
  return typeof props.layout === "string" && (LIST_LAYOUTS as readonly string[]).includes(props.layout) ? (props.layout as ListLayout) : LIST_DEFAULTS.layout;
}

export function listColumns(props: Readonly<Record<string, unknown>>): number {
  return (LIST_COLUMNS as readonly unknown[]).includes(props.columns) ? (props.columns as number) : LIST_DEFAULTS.columns;
}

export function listCount(props: Readonly<Record<string, unknown>>): number {
  const count = props.count;
  return Number.isInteger(count) && (count as number) >= 1 && (count as number) <= MOST_ENTRIES ? (count as number) : LIST_DEFAULTS.count;
}

// The collection a list names, by its id, as an integer the storage could
// have; null for none.
export function listedId(props: Readonly<Record<string, unknown>>): number | null {
  return Number.isSafeInteger(props.collection) && (props.collection as number) >= 1 ? (props.collection as number) : null;
}

// An entry a list can draw: one with its id, its title, its slug and when
// it went live. The storage gives no other kind.
function isListed(entry: unknown): entry is ListedEntry {
  return isObject(entry) && Number.isInteger(entry.id) && typeof entry.title === "string" && typeof entry.slug === "string" && typeof entry.publishedAt === "string";
}

// Whether the list's filter keeps an entry: every entry without one; with
// one, those whose toggle is on or off as it says (a toggle with no value
// is off, as the entry's form holds it), or whose choice is its option.
// Any other filter, or one by a field of another type, keeps none.
function filterOf(props: Readonly<Record<string, unknown>>, collection: ListedCollection): (entry: ListedEntry) => boolean {
  if (!Object.hasOwn(props, "filter")) return () => true;
  const filter = props.filter;
  if (!isObject(filter)) return () => false;
  const field = fieldOf(collection.fields, filter.field);
  const wanted = filter.value;
  if (field?.type === "toggle" && typeof wanted === "boolean") return (entry) => (valueOf(entry.values, field.key) === true) === wanted;
  if (field?.type === "choice" && typeof wanted === "string") return (entry) => valueOf(entry.values, field.key) === wanted;
  return () => false;
}

// The value the list orders an entry by: when it went live, its title, or
// its value of a date field (its text) or of a number field; none for a
// key no such field has.
function sortValueOf(props: Readonly<Record<string, unknown>>, collection: ListedCollection): { value: (entry: ListedEntry) => SortValue; descending: boolean } {
  const order = isObject(props.order) ? props.order : {};
  const by = typeof order.by === "string" ? order.by : "publishedAt";
  const descending = order.direction !== "asc";
  if (by === "publishedAt") return { value: (entry) => entry.publishedAt, descending };
  if (by === "title") return { value: (entry) => entry.title, descending };
  const field = fieldOf(collection.fields, by);
  return {
    value: (entry) => {
      const found = field === null ? undefined : valueOf(entry.values, field.key);
      if (field?.type === "date" && typeof found === "string") return found;
      if (field?.type === "number" && typeof found === "number") return found;
      return null;
    },
    descending,
  };
}

// The id of the entry a page is drawn with, when it is one of this
// collection's: the one entry its lists leave out. None for made-up
// values, an entry of another collection, and a page with no entry.
export function leftOut(collection: ListedCollection, entry: ShownEntry | null | undefined): number | null {
  if (!isObject(entry) || !Number.isSafeInteger(entry.id) || entry.collectionId !== collection.id) return null;
  return entry.id as number;
}

// The entries the list shows, in its order: none without a collection,
// and never the entry the page is drawn with (`leave`).
export function listedEntries(props: Readonly<Record<string, unknown>>, collection: ListedCollection | null | undefined, leave: number | null = null): ListedEntry[] {
  if (!collection) return [];
  const entries: ListedEntry[] = (Array.isArray(collection.entries) ? (collection.entries as readonly unknown[]) : []).filter(isListed).filter((entry) => entry.id !== leave);
  const order = sortValueOf(props, collection);
  return orderedBy(entries.filter(filterOf(props, collection)), order.value, order.descending).slice(0, listCount(props));
}

// One card: where it links (none for an address the URL policy refuses),
// its title, and what its fields give it, each null when the list names
// no such field or the entry has no such value: an image (as an image
// block's own props, its alt text or decorative), a day, an excerpt.
export interface Card {
  id: number;
  href: string | null;
  title: string;
  image: Record<string, unknown> | null;
  day: string | null;
  excerpt: string | null;
}

// A library image of an entry, as an image block's props hold one: an
// image from another site is no entry's.
function imageItem(value: unknown): Record<string, unknown> | null {
  if (!isObject(value) || typeof value.mediaId !== "string") return null;
  return value.decorative === true ? { mediaId: value.mediaId, decorative: true } : { mediaId: value.mediaId, alt: typeof value.alt === "string" ? value.alt : "" };
}

// An entry's address on the site: /<prefix>/<slug>.
export const entryPath = (collection: ListedCollection, entry: ListedEntry): string =>
  `/${typeof collection.prefix === "string" ? collection.prefix : ""}/${entry.slug}`;

export function listCards(
  props: Readonly<Record<string, unknown>>,
  collection: ListedCollection | null | undefined,
  href: (collection: ListedCollection, entry: ListedEntry) => string = entryPath,
  shown: ShownEntry | null = null,
): Card[] {
  if (!collection) return [];
  const compact = listLayout(props) === "compact";
  const ofType = (key: unknown, types: readonly string[]) => {
    const field = fieldOf(collection.fields, key);
    return field !== null && types.includes(field.type) ? field : null;
  };
  const image = compact ? null : ofType(props.image, ["image"]);
  const date = ofType(props.date, ["date"]);
  const excerpt = compact ? null : ofType(props.excerpt, ["text", "paragraph"]);
  return listedEntries(props, collection, leftOut(collection, shown)).map((entry) => {
    const words = excerpt === null ? undefined : valueOf(entry.values, excerpt.key);
    return {
      id: entry.id,
      href: linkHref(href(collection, entry)),
      title: entry.title,
      image: image === null ? null : imageItem(valueOf(entry.values, image.key)),
      day: date === null ? null : dayOf(valueOf(entry.values, date.key)),
      excerpt: typeof words === "string" && words !== "" ? words : null,
    };
  });
}
