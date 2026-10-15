// What the canvas draws the collections with: a list's collection holds
// its published entries as they went live, never a draft's; a template is
// drawn with the entry its Page tab picks, else the first published in its
// collection's own order (as the CMS's preview takes it), else made-up
// values; a new list names the first collection and its order, never the
// last save's; a template's preview names what the canvas draws.
import { expect, test } from "vitest";
import { newsCollection, newsEntry, siteOf } from "../../../test/site-entries.ts";
import type { Field } from "../../shared/collection.ts";
import { collectionResolver, draftCount, firstEntry, listedCollection, listStart, previewAddressOf, previewWithEntry, readSiteEntries, sampleEntry, SAMPLE_TITLE, templateEntry, templateShown } from "./content.ts";

const news = newsCollection();
const dawn = newsEntry(1, "Dawn swims", "2026-05-02");
const winter = newsEntry(2, "Winter series", "2026-11-01");
const draft = newsEntry(3, "A draft", "2026-12-24", { live: false });

test("a list's collection holds its published entries as each went live, and never a draft", () => {
  const changed = { ...dawn, title: "Dawn swims, the draft", values: { day: "2026-05-02", summary: "Not live." } };
  const listed = listedCollection(news, [changed, winter, draft]);

  expect(listed).toMatchObject({ id: 3, prefix: "news", fields: news.fields });
  expect(listed.entries.map((entry) => [entry.id, entry.title, entry.slug, entry.publishedAt])).toEqual([
    [1, "Dawn swims", "dawn-swims", "2026-05-02T08:00:00.000Z"],
    [2, "Winter series", "winter-series", "2026-11-01T08:00:00.000Z"],
  ]);
  expect(listed.entries[0]?.values).toEqual({ summary: "About Dawn swims.", day: "2026-05-02" });
  expect(draftCount([changed, winter, draft])).toBe(1);
  const resolve = collectionResolver(siteOf(news, [dawn, draft]));
  expect(resolve(3)?.entries.map((entry) => entry.id)).toEqual([1]);
  expect(resolve(4)).toBeNull();
  expect(collectionResolver(null)(3)).toBeNull();
});

test("a template is drawn with the entry picked, else the first published in its collection's order, else made-up values", () => {
  const site = siteOf(news, [dawn, winter, draft]);
  const today = new Date(2026, 9, 15, 12);

  // News goes by its day, latest first: the draft of 24 December comes
  // first, and is no published entry.
  expect(firstEntry(news, [dawn, winter, draft])?.title).toBe("Winter series");
  // With its id and its collection's, which the template's lists of News
  // leave out.
  expect(templateEntry(site, 3, null, today)).toEqual({ id: 2, collectionId: 3, fields: news.fields, title: "Winter series", slug: "winter-series", values: winter.values });
  expect(templateEntry(site, 3, 3, today)?.title).toBe("A draft");
  expect(templateEntry(site, 3, 99, today)?.title).toBe("Winter series");
  expect(templateEntry(site, 3, "sample", today)?.title).toBe(SAMPLE_TITLE);
  expect(templateEntry(siteOf(news, [draft]), 3, null, today)?.title).toBe("A draft");
  expect(templateEntry(siteOf(news, []), 3, null, today)?.title).toBe(SAMPLE_TITLE);
  expect(templateEntry(null, 3, null, today)).toBeNull();

  expect(templateShown(site, 3, null)).toBe(winter);
  expect(templateShown(siteOf(news, []), 3, null)).toBe("sample");
  expect(previewWithEntry("/preview/90", winter)).toBe("/preview/90?entry=2");
  expect(previewWithEntry("?preview=90", "sample")).toBe("?preview=90&entry=sample");

  // The Preview button's address: a template's names what the canvas
  // draws; a page's, and one opened before the collections are read, not.
  const template = { kind: "template", collection: { id: 3 }, links: { preview: "/preview/90" } };
  expect(previewAddressOf(template, site, null)).toBe("/preview/90?entry=2");
  expect(previewAddressOf(template, site, { collectionId: 3, choice: "sample" })).toBe("/preview/90?entry=sample");
  expect(previewAddressOf(template, site, { collectionId: 4, choice: 1 })).toBe("/preview/90?entry=2");
  expect(previewAddressOf({ kind: "page", links: { preview: "/preview/7" } }, site, null)).toBe("/preview/7");
  expect(previewAddressOf(template, null, null)).toBe("/preview/90");
});

test("made-up values are of each field's type, and no image", () => {
  const fields: Field[] = [
    ...news.fields,
    { key: "place", label: "Place", type: "text", required: false },
    { key: "places", label: "Places", type: "number", required: false, min: 4 },
    { key: "booking", label: "Book", type: "link", required: false },
    { key: "level", label: "Level", type: "choice", required: false, options: ["Beginner", "Strong"] },
    { key: "body", label: "Body", type: "richText", required: false },
  ];
  const sample = sampleEntry({ fields }, new Date(2026, 9, 5, 12));

  expect(sample.values).toEqual({
    summary: "Summary: a few lines, as each entry writes them.",
    day: "2026-10-05",
    "members-only": true,
    place: "Place",
    places: 4,
    booking: { label: "Book", href: "#" },
    level: "Beginner",
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body: paragraphs, lists and links, as each entry writes them." }] }] },
  });
});

test("a new list names the first collection and follows its order, but by when its entries went live where the collection goes by the last save", () => {
  expect(listStart(siteOf(news, []))).toEqual({ collection: 3, order: { by: "day", direction: "desc" } });
  expect(listStart(siteOf(newsCollection({ sort: { by: "updatedAt", direction: "asc" } }), []))).toEqual({ collection: 3, order: { by: "publishedAt", direction: "desc" } });
  expect(listStart(null)).toBeNull();
  expect(listStart({ collections: [], entries: new Map() })).toBeNull();
});

test("the collections are read with every entry of each", async () => {
  const asked: string[] = [];
  const read = await readSiteEntries({
    listCollections: async () => {
      asked.push("collections");
      return [news, newsCollection({ id: 4, name: "Events", prefix: "events" })];
    },
    listEntries: async (id) => {
      asked.push(`entries ${id}`);
      return id === 3 ? [dawn] : [];
    },
  });
  expect(asked).toEqual(["collections", "entries 3", "entries 4"]);
  expect([...read.entries]).toEqual([[3, [dawn]], [4, []]]);
});
