// What a Collection list draws of its collection (./cards.ts), the twin of
// CollectionList (cms/app/models/collection_list.rb), which the render
// contract holds to it on the fixtures; here, its rules one by one: the
// order of every kind, a title by its letters' code points, ties by when
// the entry was made, the ones with nothing to order by last; a filter by
// a toggle (one without a value is off) or a choice, and by a field the
// collection has not, which keeps none; how many; the fields of a card,
// of the right type only, and the compact list's fewer; an address the URL
// policy refuses, and one of the demo's own.
import { expect, test } from "vitest";
import type { ListedCollection, ListedEntry, ShownEntry } from "../../render/context.ts";
import { leftOut, listCards, listColumns, listCount, listedEntries, listedId, listLayout } from "./cards.ts";

const entry = (id: number, title: string, values: Record<string, unknown>, publishedAt = `2026-0${id}-01T08:00:00.000Z`): ListedEntry => ({ id, title, slug: `entry-${id}`, values, publishedAt });
const news: ListedCollection = {
  id: 3,
  prefix: "news",
  fields: [
    { key: "summary", label: "Summary", type: "paragraph" },
    { key: "picture", label: "Picture", type: "image" },
    { key: "day", label: "Day", type: "date" },
    { key: "places", label: "Places", type: "number" },
    { key: "members-only", label: "Members only", type: "toggle" },
    { key: "level", label: "Level", type: "choice" },
  ],
  entries: [
    entry(1, "Zebra", { day: "2026-05-02", places: 12, "members-only": true, level: "Strong", summary: "Z." }),
    entry(2, "\u{1F30A} Tides", { day: "2026-11-01", places: 9.5, picture: { mediaId: "tides", alt: "The tide" } }),
    entry(3, "Ａquarium", { places: 40, "members-only": false, level: "Beginner" }),
    entry(4, "Ångström", { day: "2026-11-01", places: "many", summary: "" }),
  ],
};
const list = (props: Record<string, unknown>) => ({ collection: 3, count: 24, order: { by: "publishedAt", direction: "desc" }, layout: "grid", columns: 3, linkLabel: "", emptyText: "None.", ...props });
const ids = (props: Record<string, unknown>) => listedEntries(list(props), news).map((one) => one.id);

test("entries go in the list's order: by when they went live, by title code point by code point, by a day or a number; ties by when they were made; the ones with nothing to go by last", () => {
  expect(ids({})).toEqual([4, 3, 2, 1]);
  expect(ids({ order: { by: "publishedAt", direction: "asc" } })).toEqual([1, 2, 3, 4]);
  // Code points: Z, then Å (U+00C5), then the fullwidth A (U+FF21), then
  // the wave (U+1F30A), which UTF-16 would put before the fullwidth A.
  expect(ids({ order: { by: "title", direction: "asc" } })).toEqual([1, 4, 3, 2]);
  expect(ids({ order: { by: "day", direction: "desc" } })).toEqual([4, 2, 1, 3]);
  expect(ids({ order: { by: "day", direction: "asc" } })).toEqual([1, 2, 4, 3]);
  // "many" is no number: it goes last, as an entry with none does.
  expect(ids({ order: { by: "places", direction: "desc" } })).toEqual([3, 1, 2, 4]);
  // A key no date or number field has orders nothing: by when each was
  // made, reversed for a descending order.
  expect(ids({ order: { by: "summary", direction: "desc" } })).toEqual([4, 3, 2, 1]);
  expect(ids({ order: { by: "gone", direction: "up" } })).toEqual([4, 3, 2, 1]);
  expect(ids({ order: "newest" })).toEqual([4, 3, 2, 1]);
});

test("a filter keeps the entries whose toggle is on or off, a toggle with no value off, or whose choice is its option; by any other field, none", () => {
  expect(ids({ filter: { field: "members-only", value: true } })).toEqual([1]);
  expect(ids({ filter: { field: "members-only", value: false } })).toEqual([4, 3, 2]);
  expect(ids({ filter: { field: "level", value: "Beginner" } })).toEqual([3]);
  expect(ids({ filter: { field: "level", value: true } })).toEqual([]);
  expect(ids({ filter: { field: "summary", value: "Z." } })).toEqual([]);
  expect(ids({ filter: { field: "gone", value: true } })).toEqual([]);
  expect(ids({ filter: "members-only" })).toEqual([]);
});

test("a list shows as many as its count, three for a count the schema does not list; its layout and columns read the same way", () => {
  expect(ids({ count: 2 })).toEqual([4, 3]);
  expect([listCount({ count: 0 }), listCount({ count: 25 }), listCount({ count: "2" }), listCount({ count: 24 })]).toEqual([3, 3, 3, 24]);
  expect([listLayout({ layout: "carousel" }), listLayout({ layout: "list" }), listColumns({ columns: 1 }), listColumns({ columns: 4 })]).toEqual(["grid", "list", 3, 4]);
  expect([listedId({ collection: 3 }), listedId({ collection: "3" }), listedId({ collection: 0 }), listedId({ collection: 2 ** 53 }), listedId({})]).toEqual([3, null, null, null, null]);
});

test("a card shows the fields the list names, each of its type only: no image, no excerpt in a compact list", () => {
  const cards = listCards(list({ image: "picture", date: "day", excerpt: "summary", order: { by: "publishedAt", direction: "asc" } }), news);
  expect(cards.map((card) => [card.title, card.href, card.image, card.day, card.excerpt])).toEqual([
    ["Zebra", "/news/entry-1", null, "2026-05-02", "Z."],
    ["\u{1F30A} Tides", "/news/entry-2", { mediaId: "tides", alt: "The tide" }, "2026-11-01", null],
    ["Ａquarium", "/news/entry-3", null, null, null],
    ["Ångström", "/news/entry-4", null, "2026-11-01", null],
  ]);
  const wrong = listCards(list({ image: "summary", date: "places", excerpt: "day" }), news);
  expect(wrong.every((card) => card.image === null && card.day === null && card.excerpt === null)).toBe(true);
  const compact = listCards(list({ layout: "compact", image: "picture", date: "day", excerpt: "summary" }), news);
  expect(compact.map((card) => [card.image, card.excerpt])).toEqual([[null, null], [null, null], [null, null], [null, null]]);
  expect(compact.map((card) => card.day)).toEqual(["2026-11-01", null, "2026-11-01", "2026-05-02"]);
});

test("a card's price is a number field's value, as money while the shop sells from the collection, a number otherwise, compact lists too", () => {
  const shop = { enabled: true, currency: "GBP", productsCollectionId: 3, priceField: "places" };
  const prices = (props: Record<string, unknown>, sold: unknown = shop) => listCards(list({ order: { by: "publishedAt", direction: "asc" }, ...props }), news, undefined, null, sold as never).map((card) => card.price);
  expect(prices({ price: "places" })).toEqual(["£12.00", "£9.50", "£40.00", null]);
  expect(prices({ price: "places", layout: "compact" })).toEqual(["£12.00", "£9.50", "£40.00", null]);
  expect(prices({ price: "places" }, { ...shop, enabled: false })).toEqual(["12", "9.5", "40", null]);
  expect(prices({ price: "places" }, { ...shop, productsCollectionId: 4 })).toEqual(["12", "9.5", "40", null]);
  expect(prices({ price: "places" }, null)).toEqual(["12", "9.5", "40", null]);
  // Of the right type only, as the card's other fields.
  expect([prices({ price: "day" }), prices({ price: "gone" }), prices({})]).toEqual([[null, null, null, null], [null, null, null, null], [null, null, null, null]]);
});

test("on an entry's page a list of its collection leaves the entry out and shows as many others; made-up values and an entry of another collection leave nothing out", () => {
  const shown = (id: unknown, collectionId: unknown) => ({ id, collectionId, fields: [], title: "", slug: "", values: {} }) as unknown as ShownEntry;
  const titles = (entry: ShownEntry | null) => listCards(list({ count: 2 }), news, undefined, entry).map((card) => card.id);
  expect(titles(null)).toEqual([4, 3]);
  expect(titles(shown(4, 3))).toEqual([3, 2]);
  expect(titles(shown(2, 3))).toEqual([4, 3]);
  expect([titles(shown(4, 9)), titles(shown(null, 3)), titles(shown("4", 3)), titles(shown(undefined, undefined))]).toEqual([[4, 3], [4, 3], [4, 3], [4, 3]]);
  expect([leftOut(news, shown(4, 3)), leftOut(news, shown(4, "3")), leftOut(news, null)]).toEqual([4, null, null]);
});

test("a card links to its entry's address, or nowhere for one the URL policy refuses; the demo gives its own; an entry no list can draw is left out", () => {
  const odd: ListedCollection = { ...news, entries: [{ ...entry(1, "Odd", {}), slug: "x\"><script>" }, { id: 2, title: "No slug" } as unknown as ListedEntry, "junk" as unknown as ListedEntry] };
  expect(listCards(list({}), odd).map((card) => [card.title, card.href])).toEqual([["Odd", null]]);
  expect(listCards(list({}), news, (_collection, one) => `?entry=${one.id}`).map((card) => card.href)).toEqual(["?entry=4", "?entry=3", "?entry=2", "?entry=1"]);
  expect([listCards(list({}), null), listedEntries(list({}), undefined)]).toEqual([[], []]);
});
