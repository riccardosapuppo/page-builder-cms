// The CMS's checks of what it keeps, as TypeScript, for the browser's
// storage adapter (./browser.ts): the request checks of the API's
// controllers (cms/app/controllers/api/body_check.rb), the page address's
// rules (cms/app/models/slug.rb and app/validators/slug_validator.rb), the
// versions' names, the media library's (cms/app/models/media_item.rb and
// the direct upload's checks), the site style's
// (cms/app/models/site_style.rb), and the members of a change of the
// header and footer (cms/app/models/site.rb). The browser's adapter
// refuses what the CMS refuses, at the same pointers, with the same
// keywords and the same words, so the editor shows the same message in
// either mode. The page document itself, and the header and footer's
// values, are checked by the editor's own twin of the schema and the
// application rules (../shared/validate.ts).
//
// browser-rules.test.ts holds the lists, the limits and the words to the
// Ruby they follow.
import type { FieldError, ImageType } from "./adapter.ts";
import { escapePointer } from "../shared/validate.ts";
import { isObject } from "../document/json.ts";

// Draft::SAVE_ID and MediaItem::PUBLIC_ID: the alphabet of block ids.
export const SAVE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MEDIA_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Slug::FORMAT, Slug::MAX_LENGTH, and the addresses the application
// answers itself: Slug::RESERVED, then the names of the files in
// cms/public/ that answer before the router (404 for public/404.html).
export const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 64;
export const RESERVED_SLUGS: readonly string[] = ["api", "up", "assets", "rails", "preview", "400", "404", "422", "500"];

// PageVersion::NAME_MAX_LENGTH, MediaItem::ALT_MAX_LENGTH, the direct
// upload's longest filename, and Draft::AUTO_VERSION_EVERY.
export const VERSION_NAME_MAX_LENGTH = 80;
export const ALT_MAX_LENGTH = 300;
export const FILENAME_MAX_LENGTH = 255;
export const AUTO_VERSION_EVERY_MS = 10 * 60_000;

// Site::MEMBERS: what a change of the header and footer sends, beside the
// revision it was read at, each one required.
export const SITE_MEMBERS = ["name", "menu", "action", "footer"] as const;

// MediaItem::SIGNATURES, in their order: the kind of image the first
// bytes are.
export const IMAGE_SIGNATURES: ReadonlyArray<[ImageType, (head: Uint8Array) => boolean]> = [
  ["image/jpeg", (head) => startsWith(head, [0xff, 0xd8, 0xff])],
  ["image/png", (head) => startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ["image/gif", (head) => startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"))],
  ["image/webp", (head) => startsWith(head, ascii("RIFF")) && startsWith(head.subarray(8), ascii("WEBP"))],
];
// The same order, as the direct upload's refusal lists them.
export const CONTENT_TYPES: readonly ImageType[] = IMAGE_SIGNATURES.map(([type]) => type);

export function sniff(head: Uint8Array): ImageType | null {
  return IMAGE_SIGNATURES.find(([, matches]) => matches(head))?.[0] ?? null;
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.length <= bytes.length && prefix.every((byte, i) => bytes[i] === byte);
}

// The words, as the Ruby writes them, or Rails' own for the errors it
// names by a symbol alone (:blank, :too_long).
export const WORDS = {
  required: "is required",
  integer: "must be an integer",
  string: "must be a string",
  boolean: "must be true or false",
  object: "must be a JSON object",
  nul: "must not hold the character U+0000",
  form: "is not in the expected form",
  blank: "can't be blank",
  tooLong: (count: number) => `is too long (maximum is ${count} characters)`,
  slugFormat: "may hold only lowercase letters, digits and single hyphens between them",
  reserved: "is an address the application uses itself",
  nextAddressTaken: "is already the next address of another page",
  liveAddressTaken: "is already the address of another page",
  versionName: `must be one line of text with a visible character, at most ${VERSION_NAME_MAX_LENGTH} characters`,
  alt: `must be empty, or one line of text with a visible character, at most ${ALT_MAX_LENGTH} characters`,
  greaterThan: (count: number) => `must be greater than ${count}`,
  atMostSide: (count: number) => `must be less than or equal to ${count}`,
  contentTypes: `must be one of ${CONTENT_TYPES.join(", ")}`,
  contentMismatch: (type: string) => `is not the ${type} image it claims to be`,
  paletteObject: "must be an object of palette slots",
  slotMissing: "is missing",
  toneOf: (tones: readonly string[]) => `must be one of ${tones.join(", ")}`,
  notASlot: "is not a palette slot",
  typeScale: "is not one of the type-scale choices",
  // The messages of the API's error answers.
  malformedJson: "The body is not valid JSON.",
  invalidRequest: "The request is not valid.",
  invalidDocument: "The document is not valid.",
  conflict: "The draft has changed since the revision sent.",
  siteConflict: "The header and footer have changed since the revision sent.",
  notFound: "There is nothing at this address.",
  inUse: "Pages still use this image.",
  mediaMissing: (id: string) => `The media library has no item ${id}.`,
} as const;

// BlockDocument::BLOCK_POINTER: a block sits at /sections/n, a column at
// /sections/n/children/n and a widget one level further down.
const BLOCK_POINTER = /^\/sections\/\d+(?:\/children\/\d+)*(?=\/|$)/;

export function blockPointer(pointer: string): string | null {
  return BLOCK_POINTER.exec(pointer)?.[0] ?? null;
}

export function fieldError(pointer: string, keyword: string, message: string, block: string | null = null): FieldError {
  return { pointer, keyword, blockPointer: block, message };
}

// A document's error seen from a request that holds the document under
// /document, as BlockDocument::Error#under writes it.
export function underDocument(error: { pointer: string; keyword: string; message: string }): FieldError {
  const block = blockPointer(error.pointer);
  return fieldError(`/document${error.pointer}`, error.keyword, error.message, block === null ? null : `/document${block}`);
}

// A string's length as Ruby counts it: in characters, not UTF-16 units.
export const characters = (text: string): number => [...text].length;

// Api::BodyCheck: the checks of a request's members before anything is
// looked up. A member is present when the request names it; one given as
// undefined is left out, as JSON leaves it out on the way to the CMS.
export class BodyCheck {
  readonly errors: FieldError[] = [];
  private readonly body: Record<string, unknown>;
  private readonly prefix: string;

  constructor(body: Record<string, unknown>, prefix = "") {
    this.body = body;
    this.prefix = prefix;
  }

  private has(name: string): boolean {
    return Object.hasOwn(this.body, name) && this.body[name] !== undefined;
  }

  private fail(pointer: string, keyword: string, message: string): void {
    this.errors.push(fieldError(`${this.prefix}${pointer}`, keyword, message));
  }

  private present(name: string, required: boolean): boolean {
    if (!required) return this.has(name);
    return this.required(name);
  }

  required(name: string): boolean {
    if (!this.has(name)) this.fail(`/${name}`, "required", WORDS.required);
    return this.has(name);
  }

  integer(name: string, { required = false, minimum, maximum }: { required?: boolean; minimum?: number; maximum?: number } = {}): void {
    if (!this.present(name, required)) return;
    const value = this.body[name];
    if (typeof value !== "number" || !Number.isInteger(value)) this.fail(`/${name}`, "type", WORDS.integer);
    else if (minimum !== undefined && value < minimum) this.fail(`/${name}`, "minimum", `must be at least ${minimum}`);
    else if (maximum !== undefined && value > maximum) this.fail(`/${name}`, "maximum", `must be at most ${maximum}`);
  }

  string(name: string, { required = false, pattern, maxLength }: { required?: boolean; pattern?: RegExp; maxLength?: number } = {}): void {
    if (!this.present(name, required)) return;
    const value = this.body[name];
    if (typeof value !== "string") this.fail(`/${name}`, "type", WORDS.string);
    else if (value.includes("\u0000")) this.fail(`/${name}`, "pattern", WORDS.nul);
    else if (maxLength !== undefined && characters(value) > maxLength) this.fail(`/${name}`, "maxLength", `must be at most ${maxLength} characters`);
    else if (pattern && !pattern.test(value)) this.fail(`/${name}`, "pattern", WORDS.form);
  }

  boolean(name: string, { required = false }: { required?: boolean } = {}): void {
    if (!this.present(name, required)) return;
    if (typeof this.body[name] !== "boolean") this.fail(`/${name}`, "type", WORDS.boolean);
  }

  object(name: string, { required = false }: { required?: boolean } = {}): void {
    if (!this.present(name, required)) return;
    if (!isObject(this.body[name])) this.fail(`/${name}`, "type", WORDS.object);
  }

  anyOf(...names: string[]): void {
    if (names.some((name) => this.has(name))) return;
    this.fail("", "minProperties", `must name at least one of ${names.join(", ")}`);
  }
}

// SlugValidator: the first of its rules a page's address breaks, at /slug.
// Whether another page has the address is the storage's to say.
export function slugErrors(slug: unknown): FieldError[] {
  if (typeof slug !== "string" || slug === "") return [fieldError("/slug", "blank", WORDS.blank)];
  if (characters(slug) > SLUG_MAX_LENGTH) return [fieldError("/slug", "tooLong", WORDS.tooLong(SLUG_MAX_LENGTH))];
  if (!SLUG_FORMAT.test(slug)) return [fieldError("/slug", "invalid", WORDS.slugFormat)];
  if (RESERVED_SLUGS.includes(slug)) return [fieldError("/slug", "reserved", WORDS.reserved)];
  return [];
}

// MediaItem's checks of a new item's size in pixels, width first, as the
// model runs them.
export function sizeErrors(width: number, height: number, maxSide: number): FieldError[] {
  const errors: FieldError[] = [];
  for (const [name, value] of [["width", width], ["height", height]] as const) {
    if (value <= 0) errors.push(fieldError(`/${name}`, "greaterThan", WORDS.greaterThan(0)));
    else if (value > maxSide) errors.push(fieldError(`/${name}`, "lessThanOrEqualTo", WORDS.atMostSide(maxSide)));
  }
  return errors;
}

// Every place a document names a media library item, as [pointer, id],
// in the order of the pointers: BlockDocument.media_refs, which counts any
// member called mediaId so that a widget added later is found too.
export function mediaRefs(document: unknown): Array<[string, string]> {
  const refs: Array<[string, string]> = [];
  const stack: Array<[unknown, string]> = [[document, ""]];
  while (stack.length > 0) {
    const [value, pointer] = stack.pop()!;
    if (Array.isArray(value)) {
      value.forEach((child, k) => stack.push([child, `${pointer}/${k}`]));
    } else if (isObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        const at = `${pointer}/${escapePointer(key)}`;
        if (key === "mediaId" && typeof child === "string") refs.push([at, child]);
        else stack.push([child, at]);
      }
    }
  }
  // Ruby's sort of strings: byte by byte, which for these pointers (ASCII
  // keys and digits) is the order of character codes.
  return refs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// SiteStyle's checks of a whole style: every slot of the palette named,
// each with one of its tones, nothing else; and a type scale of the
// choices. At /palette/<slot> and /typeScale.
export function siteStyleErrors(palette: Record<string, unknown>, typeScale: unknown, slots: Readonly<Record<string, readonly string[]>>, typeScales: readonly string[]): FieldError[] {
  const errors: FieldError[] = [];
  for (const [slot, tones] of Object.entries(slots)) {
    if (!Object.hasOwn(palette, slot)) errors.push(fieldError(`/palette/${escapePointer(slot)}`, "blank", WORDS.slotMissing));
    else if (!tones.includes(palette[slot] as string)) errors.push(fieldError(`/palette/${escapePointer(slot)}`, "inclusion", WORDS.toneOf(tones)));
  }
  for (const name of Object.keys(palette)) {
    if (!Object.hasOwn(slots, name)) errors.push(fieldError(`/palette/${escapePointer(name)}`, "unknown", WORDS.notASlot));
  }
  if (typeof typeScale !== "string" || !typeScales.includes(typeScale)) errors.push(fieldError("/typeScale", "inclusion", WORDS.typeScale));
  return errors;
}
