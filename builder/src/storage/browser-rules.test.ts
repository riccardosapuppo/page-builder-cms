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
  AUTO_VERSION_EVERY_MS,
  BodyCheck,
  CONTENT_TYPES,
  FILENAME_MAX_LENGTH,
  MEDIA_ID,
  mediaRefs,
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
import { PART_ANCHOR, PART_FORM } from "../shared/validate.ts";
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

  test("the image types, in the order of the CMS's signatures", () => {
    const types = [...ruby("app/models/media_item.rb").matchAll(/^\s*"(image\/[a-z]+)" => ->\(head\)/gm)].map((m) => m[1]);
    expect(types).toEqual([...CONTENT_TYPES]);
  });

  test("every word the CMS writes itself is written there, its numbers put in", () => {
    const sources = [
      "app/controllers/api/body_check.rb", "app/validators/slug_validator.rb", "app/models/draft.rb", "app/models/page_version.rb",
      "app/models/media_item.rb", "app/controllers/api/direct_uploads_controller.rb", "app/models/site_style.rb", "app/controllers/api/base_controller.rb",
      "app/controllers/api/media_controller.rb", "app/models/media_usage.rb", "app/controllers/api/pages_controller.rb", "app/models/site_parts.rb",
    ].map(ruby).join("\n")
      .replaceAll("#{NAME_MAX_LENGTH}", String(VERSION_NAME_MAX_LENGTH))
      .replaceAll("#{ALT_MAX_LENGTH}", String(ALT_MAX_LENGTH))
      .replaceAll("#{MediaItem::CONTENT_TYPES.join(', ')}", CONTENT_TYPES.join(", "))
      .replaceAll("#{blob.content_type}", "image/png")
      .replaceAll("#{public_id}", "Shore01")
      .replaceAll("#{slot.tones.join(', ')}", "ink, sea");
    const written = [
      WORDS.required, WORDS.integer, WORDS.string, WORDS.boolean, WORDS.object, WORDS.nul, WORDS.form,
      WORDS.slugFormat, WORDS.reserved, WORDS.nextAddressTaken, WORDS.liveAddressTaken, WORDS.versionName, WORDS.alt,
      WORDS.contentTypes, WORDS.contentMismatch("image/png"), WORDS.paletteObject, WORDS.slotMissing, WORDS.toneOf(["ink", "sea"]),
      WORDS.notASlot, WORDS.typeScale, WORDS.invalidRequest, WORDS.invalidDocument, WORDS.conflict, WORDS.partNoAddress, WORDS.notFound, WORDS.inUse,
      WORDS.mediaMissing("Shore01"), PART_FORM, PART_ANCHOR,
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
