// The Collections screen's words: counts, an entry's status, a field's
// value in the list, a key from a label, the orders, and each refusal as a
// sentence about the field that holds it.
import { expect, test } from "vitest";
import type { Field } from "../../shared/collection.ts";
import { collectionMeta, collectionsCount, definitionRefusal, directionWords, entriesLine, entryRefusal, entryStatus, keyFrom, orderChoices, plainText, valueRefusal, valueWords } from "./words.ts";

const number: Field = { key: "temperature", label: "Water temperature", type: "number", required: true, min: 0, max: 30 };
const date: Field = { key: "date", label: "Date", type: "date", required: false };

test("counts: of collections, of entries and how many are published", () => {
  expect([0, 1, 3].map(collectionsCount)).toEqual(["No collections yet", "1 collection", "3 collections"]);
  expect([entriesLine(0, 0), entriesLine(1, 0), entriesLine(1, 1), entriesLine(5, 0), entriesLine(5, 3), entriesLine(4, 4)]).toEqual([
    "No entries yet", "1 entry, not published", "1 entry, published", "5 entries, none published", "5 entries, 3 published", "4 entries, all published",
  ]);
  expect(collectionMeta({ prefix: "news", entryCount: 0 })).toBe("/news · no entries");
  expect(collectionMeta({ prefix: "news", entryCount: 12 })).toBe("/news · 12 entries");
});

test("an entry is a draft, published, or changed since its publish", () => {
  const live = { title: "A", slug: "a", values: {}, draftRevision: 3, publishedAt: "2026-10-01T09:00:00.000Z" };
  expect(entryStatus({ revision: 3, published: null })).toBe("draft");
  expect(entryStatus({ revision: 3, published: live })).toBe("published");
  expect(entryStatus({ revision: 4, published: live })).toBe("changed");
});

test("a value in words, by its field's type; none for none, or for a value of another shape", () => {
  const field = (type: Field["type"]): Field => ({ key: "k", label: "K", type, required: false } as Field);
  expect(valueWords(field("text"), "  Cold\nwater  ")).toBe("Cold water");
  expect(valueWords(field("text"), "")).toBeNull();
  expect(valueWords(field("richText"), { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bring" }, { type: "hardBreak" }, { type: "text", text: "a towel", marks: [{ type: "bold" }] }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Hat" }] }] }] }] })).toBe("Bring a towel Hat");
  expect(valueWords(number, 1250.5)).toBe("1,250.5");
  expect(valueWords(number, "12")).toBeNull();
  expect(valueWords(date, "2026-10-15")).toBe("Oct 15, 2026");
  expect(valueWords(field("image"), { mediaId: "m1", alt: "The bay" })).toBe("Image: The bay");
  expect(valueWords(field("image"), { mediaId: "m1", decorative: true })).toBe("Decorative image");
  expect(valueWords(field("link"), { label: "Join us", href: "/join" })).toBe("Join us");
  expect(valueWords(field("toggle"), false)).toBe("No");
  expect(valueWords(field("choice"), "Strong")).toBe("Strong");
  expect(plainText({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
});

test("a key from a label: lowercase letters, digits and hyphens from a letter; never title, slug or a key taken", () => {
  expect(keyFrom("Water temperature", [])).toBe("water-temperature");
  expect(keyFrom("Café crème", [])).toBe("cafe-creme");
  expect(keyFrom("2nd place", [])).toBe("nd-place");
  expect(keyFrom("!!!", [])).toBe("field");
  expect(keyFrom("Title", [])).toBe("title-2");
  expect(keyFrom("Date", ["date", "date-2"])).toBe("date-3");
  expect(keyFrom("x".repeat(80), []).length).toBeLessThanOrEqual(64);
});

test("the orders: the built-in ones and the date and number fields, each way in its own words", () => {
  const text: Field = { key: "place", label: "Place", type: "text", required: false };
  expect(orderChoices([text, number, date]).map((c) => c.value)).toEqual(["title", "updatedAt", "publishedAt", "temperature", "date"]);
  expect(directionWords("title", [])).toEqual({ asc: "A to Z", desc: "Z to A" });
  expect(directionWords("publishedAt", [])).toEqual({ asc: "Oldest first", desc: "Newest first" });
  expect(directionWords("temperature", [number])).toEqual({ asc: "Lowest first", desc: "Highest first" });
  expect(directionWords("date", [date])).toEqual({ asc: "Earliest first", desc: "Latest first" });
});

test("a refused value as a sentence about its field", () => {
  expect(valueRefusal(number, "", "required", "is required")).toBe("Required. Write a number.");
  expect(valueRefusal(number, "", "maximum", "must be at most 30")).toBe("At most 30.");
  expect(valueRefusal(number, "", "minimum", "must be at least 0")).toBe("At least 0.");
  expect(valueRefusal(number, "", "decimals", "Two decimals at most.")).toBe("Two decimals at most.");
  expect(valueRefusal(date, "", "dateExists", "is not a day that exists")).toBe("That day does not exist.");
  const image: Field = { key: "hero", label: "Image", type: "image", required: false };
  expect(valueRefusal(image, "/mediaId", "mediaExists", "The media library has no item m9.")).toBe("The media library no longer has this image. Choose another.");
  expect(valueRefusal(image, "/alt", "maxLength", "must NOT have more than 300 characters")).toBe("Up to 300 characters.");
  const link: Field = { key: "more", label: "Read more", type: "link", required: false };
  expect(valueRefusal(link, "/href", "pattern", "must match pattern")).toBe("Use a full address (https://…), a path on this site (/…), #anchor, mailto: or tel:.");
  expect(entryRefusal("slug", "taken", "is already the next address of another entry")).toBe("Another entry of this collection has this address. Choose another.");
  expect(entryRefusal("slug", "pattern", "must match pattern")).toBe("Lowercase letters, digits and hyphens.");
  expect(entryRefusal("title", "maxLength", "must NOT have more than 200 characters")).toBe("Up to 200 characters.");
});

test("a refused definition as a sentence about its control", () => {
  expect(definitionRefusal("prefix", "taken", "is already the address of a page")).toBe("A page has this address. Choose another prefix, or change the page’s.");
  expect(definitionRefusal("prefix", "taken", "is already the prefix of another collection")).toBe("Another collection has this prefix. Choose another.");
  expect(definitionRefusal("prefix", "reserved", "is an address the application uses itself")).toBe("The site answers this address itself. Choose another prefix.");
  expect(definitionRefusal("key", "uniqueKey", "The key \"date\" is already another field's.")).toBe("Another field has this key. Choose another.");
  expect(definitionRefusal("key", "not", "must NOT be valid")).toBe("Every entry has a title and a slug of its own: choose another key.");
  expect(definitionRefusal("bound", "range", "The highest value is below the lowest.")).toBe("The highest is below the lowest.");
  expect(definitionRefusal("sort", "sortField", "The collection has no date or number field \"date\".")).toBe("The order followed a field that is not there any more: choose another.");
});
