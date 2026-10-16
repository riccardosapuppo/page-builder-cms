// The browser storage's twins of the CMS's checks (./browser-rules.ts),
// held to the Ruby they follow: the lists, the limits and the words are
// read out of the CMS's own files, so a change there fails here until the
// twin follows. Then each check on its own cases.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ALT_MAX_LENGTH,
  asciiLower,
  AUTO_VERSION_EVERY_MS,
  BodyCheck,
  BUILT_IN_ORDERS,
  compareCodePoints,
  CONTENT_TYPES,
  ENTRY_ORDER,
  ENTRY_QUERY,
  FILENAME_MAX_LENGTH,
  MEDIA_ID,
  mediaRefs,
  orderedBy,
  prefixReserved,
  RESERVED_PREFIXES,
  RESERVED_SLUGS,
  SAVE_ID,
  siteStyleErrors,
  sizeErrors,
  SLUG_FORMAT,
  SLUG_MAX_LENGTH,
  slugErrors,
  sniff,
  underDocument,
  VERSION_NAME_MAX_LENGTH,
  WORDS,
} from "./browser-rules.ts";
import { COLLECTION_WORDS } from "../../../schema/tools/collection-rules.ts";
import { PART_ANCHOR, PART_FORM, TEMPLATE_FORM } from "../shared/validate.ts";
import { PNG_BYTES } from "./contract.ts";

const cms = fileURLToPath(new URL("../../../cms/", import.meta.url));
const ruby = (path: string): string => readFileSync(join(cms, path), "utf8");

// A Ruby constant's value as the file writes it.
function constant(source: string, name: string): string {
  const found = new RegExp(`^\\s*${name} = (.+)$`, "m").exec(source);
  if (!found) throw new Error(`no ${name} in the Ruby given`);
  return found[1]!.trim();
}

const rubyRegexp = (written: string): string => written.replace(/^\/\\A/, "^").replace(/\\z\/$/, "$");

describe("held to the CMS's Ruby", () => {
  test("the page address: its form, its length, and every address the application answers itself", () => {
    const slug = ruby("app/models/slug.rb");
    expect(rubyRegexp(constant(slug, "FORMAT"))).toBe(SLUG_FORMAT.source);
    expect(Number(constant(slug, "MAX_LENGTH"))).toBe(SLUG_MAX_LENGTH);
    const words = /%w\[([^\]]*)\]/.exec(constant(slug, "RESERVED"))![1]!.trim().split(/\s+/);
    // A file of public/ answers before the router: its name is taken too.
    const files = readdirSync(join(cms, "public")).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -".html".length));
    expect(files.length).toBeGreaterThan(0);
    expect([...RESERVED_SLUGS].sort()).toEqual([...words, ...files].sort());
  });

  test("the ids, the limits and the automatic versions' spacing", () => {
    expect(rubyRegexp(constant(ruby("app/models/draft.rb"), "SAVE_ID"))).toBe(SAVE_ID.source);
    const media = ruby("app/models/media_item.rb");
    expect(rubyRegexp(constant(media, "PUBLIC_ID"))).toBe(MEDIA_ID.source);
    expect(Number(constant(media, "ALT_MAX_LENGTH"))).toBe(ALT_MAX_LENGTH);
    expect(Number(constant(ruby("app/models/page_version.rb"), "NAME_MAX_LENGTH"))).toBe(VERSION_NAME_MAX_LENGTH);
    expect(ruby("app/controllers/api/direct_uploads_controller.rb")).toContain(`check.string("filename", required: true, max_length: ${FILENAME_MAX_LENGTH})`);
    expect(constant(ruby("app/models/draft.rb"), "AUTO_VERSION_EVERY")).toBe(`${AUTO_VERSION_EVERY_MS / 60_000}.minutes`);
  });

  test("a collection's prefixes the application answers below, and a list of entries' query and orders", () => {
    const collection = ruby("app/models/collection.rb");
    expect(/%w\[([^\]]*)\]/.exec(constant(collection, "RESERVED_PREFIXES"))![1]!.trim().split(/\s+/)).toEqual([...RESERVED_PREFIXES]);
    const entries = ruby("app/controllers/api/entries_controller.rb");
    // The words: the Ruby's pattern is the one ENTRY_QUERY.q checks by
    // code point; the order: the same pattern.
    const written = (name: string) => new RegExp(`^\\s*"${name}" => (/.+/),?$`, "m").exec(entries)?.[1];
    expect(written("q")).toBe("/\\A[^\\u0000-\\u001f\\u007f]{0,200}\\z/");
    expect(rubyRegexp(written("order")!)).toBe(ENTRY_ORDER.source);
    expect(Object.keys(ENTRY_QUERY)).toEqual([...entries.matchAll(/^\s*"([a-z]+)" => \//gm)].map((m) => m[1]));
    expect(/%w\[([^\]]*)\]/.exec(constant(entries, "BUILT_IN_ORDERS"))![1]!.trim().split(/\s+/)).toEqual([...BUILT_IN_ORDERS]);
  });

  test("the collection rules' words, the TypeScript twin's and the Ruby's", () => {
    const rules = ruby("lib/collection_document/rules.rb").replaceAll('\\"', '"')
      .replaceAll("#{key}", "summary").replaceAll("#{option}", "Beginner").replaceAll("#{by}", "day")
      .replaceAll("#{field['min']}", "0").replaceAll("#{field['max']}", "40");
    const written = [
      COLLECTION_WORDS.uniqueKey("summary"), COLLECTION_WORDS.uniqueOption("Beginner"), COLLECTION_WORDS.decimals, COLLECTION_WORDS.range,
      COLLECTION_WORDS.sortField("day"), COLLECTION_WORDS.unknownField("summary"), COLLECTION_WORDS.required, COLLECTION_WORDS.minimum(0),
      COLLECTION_WORDS.maximum(40), COLLECTION_WORDS.dateExists, COLLECTION_WORDS.enum,
    ];
    expect(written.filter((words) => !rules.includes(words))).toEqual([]);
  });

  test("the image types, in the order of the CMS's signatures", () => {
    const types = [...ruby("app/models/media_item.rb").matchAll(/^\s*"(image\/[a-z]+)" => ->\(head\)/gm)].map((m) => m[1]);
    expect(types).toEqual([...CONTENT_TYPES]);
  });

  test("every word the CMS writes itself is written there, its numbers put in", () => {
    const sources = [
      "app/controllers/api/body_check.rb", "app/validators/slug_validator.rb", "app/models/draft.rb", "app/models/page_version.rb",
      "app/models/media_item.rb", "app/controllers/api/direct_uploads_controller.rb", "app/models/site_style.rb", "app/controllers/api/base_controller.rb",
      "app/controllers/api/media_controller.rb", "app/models/media_usage.rb", "app/controllers/api/pages_controller.rb", "app/models/site_parts.rb",
      "app/models/collection.rb", "app/models/entry.rb", "app/models/collection_template.rb", "app/controllers/api/entries_controller.rb",
      "app/controllers/cart_controller.rb",
    ].map(ruby).join("\n")
      .replaceAll("#{NAME_MAX_LENGTH}", String(VERSION_NAME_MAX_LENGTH))
      .replaceAll("#{ALT_MAX_LENGTH}", String(ALT_MAX_LENGTH))
      .replaceAll("#{MediaItem::CONTENT_TYPES.join(', ')}", CONTENT_TYPES.join(", "))
      .replaceAll("#{blob.content_type}", "image/png")
      .replaceAll("#{public_id}", "Shore01")
      .replaceAll("#{slot.tones.join(', ')}", "ink, sea")
      .replaceAll("#{name}", "order")
      .replaceAll("#{key}", "summary")
      .replaceAll("\\\"#{shop.price_field}\\\"", "\"price\"");
    const written = [
      WORDS.required, WORDS.integer, WORDS.string, WORDS.boolean, WORDS.object, WORDS.nul, WORDS.form,
      WORDS.slugFormat, WORDS.reserved, WORDS.nextAddressTaken, WORDS.liveAddressTaken, WORDS.versionName, WORDS.alt,
      WORDS.contentTypes, WORDS.contentMismatch("image/png"), WORDS.paletteObject, WORDS.slotMissing, WORDS.toneOf(["ink", "sea"]),
      WORDS.notASlot, WORDS.typeScale, WORDS.invalidRequest, WORDS.invalidDocument, WORDS.conflict, WORDS.partNoAddress, WORDS.notFound, WORDS.inUse,
      WORDS.mediaMissing("Shore01"), PART_FORM, PART_ANCHOR,
      WORDS.prefixTaken, WORDS.entryNextAddressTaken, WORDS.entryAddressTaken, WORDS.entryConflict,
      WORDS.templateNoAddress, WORDS.queryParameters, WORDS.queryForm("order"), WORDS.noSortField("summary"), TEMPLATE_FORM,
      WORDS.collectionInShop, WORDS.shopPrice("price"), WORDS.nothingToCheckOut,
    ];
    expect(written.filter((words) => !sources.includes(words))).toEqual([]);
  });
});

describe("the checks", () => {
  test("a request's members, each refused at its own pointer with the first rule it breaks", () => {
    const check = new BodyCheck({ revision: -1, saveId: "has space", name: "a\u0000b", home: "yes", palette: [], width: 2.5 });
    check.integer("revision", { required: true, minimum: 0 });
    check.string("saveId", { required: true, pattern: SAVE_ID });
    check.required("document");
    check.string("name");
    check.boolean("home");
    check.object("palette");
    check.integer("width");
    expect(check.errors.map((e) => [e.pointer, e.keyword])).toEqual([
      ["/revision", "minimum"], ["/saveId", "pattern"], ["/document", "required"], ["/name", "pattern"], ["/home", "type"], ["/palette", "type"], ["/width", "type"],
    ]);
    const none = new BodyCheck({ slug: undefined });
    none.anyOf("slug", "home");
    expect(none.errors).toEqual([{ pointer: "", keyword: "minProperties", blockPointer: null, message: "must name at least one of slug, home" }]);
    // A length is counted in characters, as Ruby counts it.
    const emoji = new BodyCheck({ filename: "🌊".repeat(255) }, "/file");
    emoji.string("filename", { maxLength: FILENAME_MAX_LENGTH });
    expect(emoji.errors).toEqual([]);
  });

  test("a page's address: empty, too long, malformed, reserved, or fine", () => {
    expect(["", "x".repeat(65), "Not An Address", "a--b", "api", "404", "tide-times"].map((slug) => slugErrors(slug).map((e) => e.keyword))).toEqual([
      ["blank"], ["tooLong"], ["invalid"], ["invalid"], ["reserved"], ["reserved"], [],
    ]);
    expect(slugErrors("x".repeat(65))[0]).toMatchObject({ pointer: "/slug", message: "is too long (maximum is 64 characters)" });
  });

  test("a list of entries' words to look for: at most 200 characters by code point, none a control character; and its orders", () => {
    const control = (code: number) => `a${String.fromCodePoint(code)}b`;
    const q = ENTRY_QUERY.q!;
    expect(["", "x".repeat(200), String.fromCodePoint(0x1f30a).repeat(200), "Éclipse at dawn"].map(q)).toEqual([true, true, true, true]);
    expect(["x".repeat(201), control(0), control(0x1f), control(0x7f), control(0x0a)].map(q)).toEqual([false, false, false, false, false]);
    expect(["title", "-day", "createdAt", "Title", "-", "day-of-week", "--day"].map(ENTRY_QUERY.order!)).toEqual([true, true, true, false, false, true, false]);
  });

  test("a prefix the application answers itself is refused at the prefix, a page's reserved addresses among them", () => {
    expect(["api", "404", "sent", "news"].map((prefix) => prefixReserved(prefix).map((e) => `${e.pointer} ${e.keyword}`))).toEqual([
      ["/prefix reserved"], ["/prefix reserved"], ["/prefix reserved"], [],
    ]);
  });

  test("entries ordered as the CMS orders them: by code point, the ones without a value last, each run of one value by id, all reversed but those for a descending order", () => {
    // A letter past U+FFFF comes after U+E000, by code point, where
    // JavaScript's own order of UTF-16 units puts it before.
    expect(compareCodePoints("\u{1F30A}", "\uE000")).toBe(1);
    expect(["\uE000", "\u{1F30A}"].sort()).toEqual(["\u{1F30A}", "\uE000"]);
    expect([compareCodePoints("Dawn", "Dawn"), compareCodePoints("Dawn", "Dawns"), compareCodePoints("Éclipse", "Winter")]).toEqual([0, -1, 1]);
    const items = [{ id: 1, at: "b" }, { id: 2, at: null }, { id: 3, at: "a" }, { id: 4, at: "b" }, { id: 5, at: null }];
    const value = (item: (typeof items)[number]) => item.at;
    expect(orderedBy(items, value, false).map((item) => item.id)).toEqual([3, 1, 4, 2, 5]);
    expect(orderedBy(items, value, true).map((item) => item.id)).toEqual([4, 1, 3, 5, 2]);
    expect(orderedBy([{ id: 1, n: 10 }, { id: 2, n: 9.5 }, { id: 3, n: -2 }], (item) => item.n, false).map((item) => item.id)).toEqual([3, 2, 1]);
    expect(asciiLower("Éclipse AT Dawn")).toBe("Éclipse at dawn");
  });

  test("an image's kind is read from its first bytes, never from its name", () => {
    const bytes = (...values: number[]) => Uint8Array.from(values);
    const text = (value: string) => new TextEncoder().encode(value);
    expect(sniff(PNG_BYTES)).toBe("image/png");
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniff(text("GIF89a...."))).toBe("image/gif");
    expect(sniff(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(sniff(text("RIFF\u0000\u0000\u0000\u0000WAVEfmt "))).toBe(null);
    expect(sniff(text("plain text, not a picture"))).toBe(null);
    expect(sniff(bytes())).toBe(null);
  });

  test("an image's size in pixels: above zero, at most the largest side", () => {
    expect(sizeErrors(0, 10_001, 10_000).map((e) => [e.pointer, e.keyword, e.message])).toEqual([
      ["/width", "greaterThan", "must be greater than 0"],
      ["/height", "lessThanOrEqualTo", "must be less than or equal to 10000"],
    ]);
    expect(sizeErrors(3, 2, 10_000)).toEqual([]);
  });

  test("the media a document names, every mediaId wherever it is, in the order of their pointers", () => {
    const document = {
      sections: [
        { children: [{ children: [{ type: "gallery", props: { items: [{ mediaId: "b" }, { mediaId: "a" }] } }, { type: "image", props: { mediaId: "c", url: "x" } }] }] },
      ],
      "odd/key": { mediaId: "d" },
    };
    expect(mediaRefs(document)).toEqual([
      ["/odd~1key/mediaId", "d"],
      ["/sections/0/children/0/children/0/props/items/0/mediaId", "b"],
      ["/sections/0/children/0/children/0/props/items/1/mediaId", "a"],
      ["/sections/0/children/0/children/1/props/mediaId", "c"],
    ]);
  });

  test("a document's error under /document keeps the block that holds the value", () => {
    expect(underDocument({ pointer: "/sections/0/children/1/children/2/props/mediaId", keyword: "mediaExists", message: "m" })).toEqual({
      pointer: "/document/sections/0/children/1/children/2/props/mediaId", keyword: "mediaExists", blockPointer: "/document/sections/0/children/1/children/2", message: "m",
    });
    expect(underDocument({ pointer: "/title", keyword: "minLength", message: "m" }).blockPointer).toBe(null);
  });

  test("the site style: a letter width of the choices, when the change names one", () => {
    const slots = { text: ["ink"] };
    expect(siteStyleErrors({ text: "ink" }, "balanced", slots, ["balanced"])).toEqual([]);
    expect(siteStyleErrors({ text: "ink" }, "balanced", slots, ["balanced"], "wide", ["normal", "wide"])).toEqual([]);
    expect(siteStyleErrors({ text: "ink" }, "balanced", slots, ["balanced"], "125%", ["normal", "wide"]).map((e) => [e.pointer, e.keyword, e.message])).toEqual([
      ["/letterWidth", "inclusion", "is not one of the letter-width choices"],
    ]);
  });

  test("the site style: custom CSS that keeps to the site, when the change names it, as the CMS checks it", () => {
    const slots = { text: ["ink"] };
    expect(siteStyleErrors({ text: "ink" }, "balanced", slots, ["balanced"], undefined, [], ".a { color: red; }")).toEqual([]);
    expect(siteStyleErrors({ text: "ink" }, "balanced", slots, ["balanced"], undefined, [], "")).toEqual([]);
    expect(siteStyleErrors({ text: "ink" }, "balanced", slots, ["balanced"], undefined, [], "@import url(/x.css);").map((e) => [e.pointer, e.keyword, e.message])).toEqual([
      ["/customCss", "invalid", "line 1: @import is not allowed: the page loads only its own stylesheets."],
    ]);
  });

  test("the site style: every slot with one of its tones, no other slot, a type scale of the choices", () => {
    const slots = { text: ["ink"], primary: ["sea", "harbour"] };
    expect(siteStyleErrors({ text: "ink", primary: "sea" }, "balanced", slots, ["gentle", "balanced"])).toEqual([]);
    expect(siteStyleErrors({ primary: "coral", "x/y": "ink" }, "loud", slots, ["gentle", "balanced"]).map((e) => [e.pointer, e.keyword, e.message])).toEqual([
      ["/palette/text", "blank", "is missing"],
      ["/palette/primary", "inclusion", "must be one of sea, harbour"],
      ["/palette/x~1y", "unknown", "is not a palette slot"],
      ["/typeScale", "inclusion", "is not one of the type-scale choices"],
    ]);
  });
});
