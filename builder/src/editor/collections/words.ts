// The words of the Collections screen (./CollectionsScreen.tsx), in the
// editor's one locale, en-US. Plain functions of their arguments, so the
// tests give what they mean.
import { SORT_BUILT_INS, type Field, type FieldType, type LinkValue } from "../../shared/collection.ts";
import type { InlineNode, RichTextBlock, RichTextDoc } from "../../shared/document.ts";
import type { Collection, Entry } from "../../storage/adapter.ts";
import { explain } from "../errors.ts";

const counted = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

// The header's count: "No collections yet", "1 collection", "3 collections".
export const collectionsCount = (count: number): string => (count === 0 ? "No collections yet" : counted(count, "collection"));

// A collection's entries and how many are published: "No entries yet",
// "1 entry, not published", "5 entries, 3 published", "4 entries, all
// published".
export function entriesLine(total: number, published: number): string {
  if (total === 0) return "No entries yet";
  const all = total === 1 ? "published" : "all published";
  const none = total === 1 ? "not published" : "none published";
  return `${counted(total, "entry", "entries")}, ${published === 0 ? none : published === total ? all : `${published} published`}`;
}

// Where a collection's entries are, as the list under its name says it:
// "/news · 5 entries".
export const collectionMeta = (collection: Pick<Collection, "prefix" | "entryCount">): string =>
  `/${collection.prefix} · ${collection.entryCount === 0 ? "no entries" : counted(collection.entryCount, "entry", "entries")}`;

// ------------------------------------------------------------- an entry

export type EntryStatus = "draft" | "published" | "changed";

// Whether visitors see an entry, and all of it: a draft, published, or
// published with saves since, which visitors do not see yet.
export function entryStatus(entry: Pick<Entry, "revision" | "published">): EntryStatus {
  if (!entry.published) return "draft";
  return entry.revision > entry.published.draftRevision ? "changed" : "published";
}

export const STATUS_WORDS: Readonly<Record<EntryStatus, string>> = { draft: "Draft", published: "Published", changed: "Changed since published" };
// The top bar's dots (editor.css): a ring, a live dot, a half one.
export const STATUS_DOTS: Readonly<Record<EntryStatus, string>> = { draft: "dot-draft", published: "dot-live", changed: "dot-part" };

// An entry's address on the site: /news/first-swim.
export const entryAddress = (prefix: string, slug: string): string => `/${prefix}/${slug}`;

// The address a collection's entries take, as its settings say it. Where
// the storage serves pages; where it only keeps them (the browser demo),
// the full system's.
export function addressLine(prefix: string, livePages: boolean): string {
  const at = `/${prefix === "" ? "…" : prefix}/<slug>`;
  return livePages ? `Entries live at ${at}.` : `In the full system, entries are at ${at} once published.`;
}

// The rules of an entry's slug, as the page's address says its own
// (../session.tsx, publishWords): where visitors find it, and when.
export function slugHint(prefix: string, slug: string, livePages: boolean): string {
  const at = entryAddress(prefix, slug === "" ? "…" : slug);
  return livePages
    ? `Lowercase letters, digits and hyphens. Visitors find the entry at ${at} once it is published.`
    : `Lowercase letters, digits and hyphens. In the full system, visitors find the entry at ${at} once it is published.`;
}

// ------------------------------------------------------------- the types

export const FIELD_TYPE_NAMES: Readonly<Record<FieldType, string>> = {
  text: "Text",
  paragraph: "Paragraph",
  richText: "Rich text",
  number: "Number",
  date: "Date",
  image: "Image",
  link: "Link",
  toggle: "Toggle",
  choice: "Choice",
};

// What each type holds, in the type picker.
export const FIELD_TYPE_HINTS: Readonly<Record<FieldType, string>> = {
  text: "One line, up to 200 characters",
  paragraph: "Plain lines, up to 5000 characters",
  richText: "Paragraphs, lists, bold, italic and links",
  number: "Two decimals at most, between limits you set",
  date: "A day",
  image: "From the media library, with its alt text",
  link: "Words and the address they go to",
  toggle: "Yes or no",
  choice: "One of the options you list",
};

// A field's key from its label: lowercase letters, digits and hyphens,
// starting with a letter, as an anchor; never title or slug, which every
// entry has; and none of `taken`, a number after it if it must.
export function keyFrom(label: string, taken: readonly string[]): string {
  let stem = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "")
    .slice(0, 56)
    .replace(/-+$/, "");
  if (stem === "") stem = "field";
  const free = (key: string) => !taken.includes(key) && key !== "title" && key !== "slug";
  if (free(stem)) return stem;
  for (let n = 2; ; n += 1) if (free(`${stem}-${n}`)) return `${stem}-${n}`;
}

// ------------------------------------------------------------- the orders

// What an order may follow: the title, the last change, the publish, and
// each date or number field, by its label.
export function orderChoices(fields: readonly Field[]): Array<{ value: string; label: string }> {
  const builtIn: Readonly<Record<(typeof SORT_BUILT_INS)[number], string>> = { title: "Title", updatedAt: "Last change", publishedAt: "Publish date" };
  return [
    ...SORT_BUILT_INS.map((by) => ({ value: by, label: builtIn[by] })),
    ...fields.filter((f) => f.type === "date" || f.type === "number").map((f) => ({ value: f.key, label: f.label })),
  ];
}

// The two ways an order goes, in words that fit what it follows.
export function directionWords(by: string, fields: readonly Field[]): { asc: string; desc: string } {
  if (by === "title") return { asc: "A to Z", desc: "Z to A" };
  if (by === "updatedAt" || by === "publishedAt") return { asc: "Oldest first", desc: "Newest first" };
  const type = fields.find((f) => f.key === by)?.type;
  if (type === "number") return { asc: "Lowest first", desc: "Highest first" };
  return { asc: "Earliest first", desc: "Latest first" };
}

// ------------------------------------------------------------- values in words

// The words of a rich text, its paragraphs and items one after the other.
export function plainText(doc: RichTextDoc): string {
  const inline = (nodes: readonly InlineNode[] | undefined) => (nodes ?? []).map((node) => (node.type === "text" ? node.text : " ")).join("");
  const blocks = (list: readonly RichTextBlock[]): string[] => list.flatMap((block) => {
    if (block.type === "paragraph") return [inline(block.content)];
    return block.content.flatMap((item) => blocks(item.content));
  });
  return blocks(doc.content).join(" ").replace(/\s+/g, " ").trim();
}

// A day as the list writes it: "Oct 15, 2026". The day itself, whatever
// the zone the browser is in.
export function dayText(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(at) ? day : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(at);
}

// A number as the list writes it: "1,250.5".
export const amountWords = (value: number): string => new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);

// A field's value in words, for the list of entries: a text on one line, a
// day, a number, an image by its alt text, a link by its words, a toggle's
// yes or no, a choice's option; null for none, or for a value of another
// shape than its field's.
export function valueWords(field: Field, value: unknown): string | null {
  if (value === undefined || value === null) return null;
  switch (field.type) {
    case "text":
    case "paragraph":
    case "choice":
      return typeof value === "string" && value.trim() !== "" ? value.replace(/\s+/g, " ").trim() : null;
    case "richText": {
      const words = typeof value === "object" ? plainText(value as RichTextDoc) : "";
      return words === "" ? null : words;
    }
    case "number":
      return typeof value === "number" ? amountWords(value) : null;
    case "date":
      return typeof value === "string" && value !== "" ? dayText(value) : null;
    case "image": {
      const image = value as { alt?: unknown; decorative?: unknown };
      if (image.decorative === true) return "Decorative image";
      return typeof image.alt === "string" && image.alt.trim() !== "" ? `Image: ${image.alt.trim()}` : "Image";
    }
    case "link": {
      const link = value as Partial<LinkValue>;
      return typeof link.label === "string" && link.label.trim() !== "" ? link.label.trim() : typeof link.href === "string" && link.href !== "" ? link.href : null;
    }
    case "toggle":
      return value === true ? "Yes" : value === false ? "No" : null;
  }
}

// ------------------------------------------------------------- refusals

// What a field of each type needs when it is required and has nothing.
const NEEDED: Readonly<Record<FieldType, string>> = {
  text: "Required. Write something here.",
  paragraph: "Required. Write something here.",
  richText: "Required. Write something here.",
  number: "Required. Write a number.",
  date: "Required. Choose a day.",
  image: "Required. Choose an image.",
  link: "Required. Write its words and its address.",
  toggle: "Required.",
  choice: "Required. Choose an option.",
};

export const requiredWords = (type: FieldType): string => NEEDED[type];

// Lengths the schema gives each type of value.
const LONGEST: Partial<Readonly<Record<FieldType, number>>> = { text: 200, paragraph: 5000, choice: 60 };

// A number's bounds in a sentence: "From 1 to 10.", "At least 0.",
// "At most 99.50.".
export function boundsWords(min: number | undefined, max: number | undefined): string | null {
  if (min !== undefined && max !== undefined) return `From ${amountWords(min)} to ${amountWords(max)}.`;
  if (min !== undefined) return `At least ${amountWords(min)}.`;
  if (max !== undefined) return `At most ${amountWords(max)}.`;
  return null;
}

// The parts of a value that have a control of their own in the entry's
// form: an image's alt text, a link's words and address. A refusal inside
// one is said at that control (./refusals.ts).
export const VALUE_PARTS: Partial<Readonly<Record<FieldType, readonly string[]>>> = { image: ["/alt"], link: ["/label", "/href"] };

// The sentence for a refusal of an entry's value, by the field it is
// under: `inner` is the pointer inside the value ("" for the value itself,
// "/alt" for an image's alt text, "/href" for a link's address).
export function valueRefusal(field: Field, inner: string, keyword: string, message: string): string {
  if (inner === "") {
    switch (keyword) {
      case "required":
        return requiredWords(field.type);
      // The bound it passes, which the field's hint says with the other.
      case "minimum":
        return field.min === undefined ? "Too low." : `At least ${amountWords(field.min)}.`;
      case "maximum":
        return field.max === undefined ? "Too high." : `At most ${amountWords(field.max)}.`;
      case "decimals":
        return "Two decimals at most.";
      case "dateExists":
        return "That day does not exist.";
      case "enum":
        return "Choose one of the field’s options.";
      case "unknownField":
        return "No field takes this value: saving leaves it out.";
      case "type":
        return field.type === "number" ? "Write a number." : "This value is not one this field takes.";
      default:
        break;
    }
    if (field.type === "image") return "Add alt text, or mark the image decorative.";
    if (field.type === "date") return "Choose a day.";
    if (field.type === "link") return "Write its words and its address.";
    return explain(keyword, message, { kind: field.type === "paragraph" ? "paragraph" : "line", ...(LONGEST[field.type] === undefined ? {} : { maxLength: LONGEST[field.type]! }) });
  }
  if (field.type === "image") {
    if (inner === "/mediaId") return keyword === "mediaExists" ? "The media library no longer has this image. Choose another." : "Choose an image of the media library.";
    if (inner === "/alt") return explain(keyword, message, { kind: "line", maxLength: 300 });
    return "Add alt text, or mark the image decorative.";
  }
  if (field.type === "link") {
    if (inner === "/label") return explain(keyword, message, { kind: "line", maxLength: 80 });
    if (inner === "/href") return explain(keyword, message, { kind: "href", maxLength: 2048 });
  }
  if (field.type === "richText") return "This text is not one an entry can keep. Shorten it, or take out a list nested deep.";
  return explain(keyword, message);
}

// The sentence for a refusal of an entry's title or slug.
export function entryRefusal(member: "title" | "slug", keyword: string, message: string): string {
  if (member === "title") return explain(keyword, message, { kind: "line", maxLength: 200 });
  if (keyword === "taken") return "Another entry of this collection has this address. Choose another.";
  if (keyword === "required" || keyword === "minLength") return "Write the address, or take the one the title suggests.";
  return explain(keyword, message, { kind: "slug", maxLength: 64 });
}

// The sentence for a refusal of a collection's definition, by where it
// is: its name, its prefix, a field's member, an option, the order.
export function definitionRefusal(where: "name" | "prefix" | "key" | "label" | "options" | "option" | "bound" | "fields" | "sort", keyword: string, message: string): string {
  switch (where) {
    case "name":
      return explain(keyword, message, { kind: "line", maxLength: 60 });
    case "prefix":
      if (keyword === "reserved") return "The site answers this address itself. Choose another prefix.";
      if (keyword === "taken") return /page/.test(message) ? "A page has this address. Choose another prefix, or change the page’s." : "Another collection has this prefix. Choose another.";
      return explain(keyword, message, { kind: "slug", maxLength: 64 });
    case "key":
      if (keyword === "uniqueKey") return "Another field has this key. Choose another.";
      if (keyword === "not") return "Every entry has a title and a slug of its own: choose another key.";
      return explain(keyword, message, { kind: "anchor", maxLength: 64 });
    case "label":
      return explain(keyword, message, { kind: "line", maxLength: 60 });
    case "options":
      if (keyword === "minItems" || keyword === "required") return "List at least one option.";
      if (keyword === "maxItems") return "Up to 20 options.";
      return explain(keyword, message);
    case "option":
      if (keyword === "uniqueOption") return "This option is listed twice.";
      return explain(keyword, message, { kind: "line", maxLength: 60 });
    case "bound":
      if (keyword === "decimals") return "Two decimals at most.";
      if (keyword === "range") return "The highest is below the lowest.";
      if (keyword === "minimum" || keyword === "maximum") return "From -1,000,000,000 to 1,000,000,000.";
      return explain(keyword, message, { kind: "number" });
    case "fields":
      return keyword === "maxItems" ? "A collection holds at most 30 fields." : explain(keyword, message);
    case "sort":
      return keyword === "sortField" ? "The order followed a field that is not there any more: choose another." : explain(keyword, message);
  }
}
