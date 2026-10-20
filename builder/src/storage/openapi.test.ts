// The storage adapter's types and routes against cms/openapi.yaml, the
// contract between the editor and any server that stands in for the CMS.
//
// The types in adapter.ts are written by hand from what the CMS sends; the
// CMS's request tests hold its real answers to openapi.yaml. Here each
// type's shape (every key, whether it is required, its JSON type, whether
// it may be null) is written out once more, as a table the compiler holds
// to the type, and the test holds the same table to the schema the API
// gives for it. A key added, dropped, made optional or nullable on either
// side fails until the other follows. The route table of rails.ts is held
// to the API's operations the same way, in both directions.
import type { DirectUploadBlob } from "@rails/activestorage";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";
import {
  IMAGE_TYPES, KEPT_CHANGES, MAX_IMAGE_SIDE, MAX_UPLOAD_BYTES, ORDER_STATUSES, PAGE_KINDS, RESPONSES_PER_PART, SCHEDULE_STATES, VERSION_REASONS,
  type Order, type Shop, type ShopCheckout,
  type Collection, type CollectionChanges, type Entry, type EntryPublished, type EntryQuery, type EntrySave,
  type Conflict, type Draft, type DraftSave, type DraftSaved, type FieldError, type FormResponse, type FormResponseCount, type InUse, type Invalid,
  type KeptField, type KeptStyle, type MediaItem, type MediaUse, type NewPage, type NewVersion, type Page, type PageChanges, type PageInfo, type PageLinks, type PageSummary,
  type NotPending, type Published, type PublishRequest, type PublishResult, type ResponseExcerpt, type ResponseList, type ResponseQuery, type ResponseSummary,
  type RestoreResult, type Schedule, type ScheduleRequest, type ScheduleResult,
  type Site, type SiteStyle, type SiteStyleChange,
  type LetterWidthChoice, type ToneChoice, type TypeScaleChoice, type Version, type VersionWithDocument,
} from "./adapter.ts";
import type { CollectionDefinition, EntryContent } from "../shared/collection.ts";
import { CURRENCIES, MOST_LINES, MOST_QUANTITY, type OrderLine, type ShopSettings } from "../shared/shop.ts";
import { FORM_FIELD_KINDS } from "../shared/document.ts";
import { RAILS_ROUTES, type MediaAltChange, type MediaCreate, type OperationId, type PageList } from "./rails.ts";

// ------------------------------------------------- shapes, held by tsc

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type JsonType<V> = [V] extends [string] ? "string" : [V] extends [number] ? "number" : [V] extends [boolean] ? "boolean" : [V] extends [readonly unknown[]] ? "array" : "object";
type Field<T, K extends keyof T> = {
  type: JsonType<Exclude<T[K], null | undefined>>;
  nullable: null extends T[K] ? true : false;
  required: K extends RequiredKeys<T> ? true : false;
};
// Every key of T, each with its JSON type, nullability and requiredness:
// a key left out, one too many, or one described wrongly does not compile.
type Shape<T> = { readonly [K in keyof T]-?: Field<T, K> };

const str = { type: "string", nullable: false, required: true } as const;
const num = { type: "number", nullable: false, required: true } as const;
const bool = { type: "boolean", nullable: false, required: true } as const;
const obj = { type: "object", nullable: false, required: true } as const;
const arr = { type: "array", nullable: false, required: true } as const;
const orNull = <F extends { nullable: false }>(field: F) => ({ ...field, nullable: true }) as Omit<F, "nullable"> & { nullable: true };
const optional = <F extends { required: true }>(field: F) => ({ ...field, required: false }) as Omit<F, "required"> & { required: false };

const PAGE_LINKS = { self: str, draft: str, versions: str, publish: str, schedules: str, preview: str, live: orNull(str) } as const satisfies Shape<PageLinks>;
const PUBLISHED = { slug: orNull(str), versionNumber: num, draftRevision: num, publishedAt: str } as const satisfies Shape<Published>;
const PAGE_SUMMARY = {
  id: num, kind: str, title: str, slug: orNull(str), home: bool, revision: num, updatedAt: str, published: orNull(obj), scheduled: orNull(obj), links: obj,
} as const satisfies Shape<PageSummary>;
const PAGE_LIST = { pages: arr, parts: arr } as const satisfies Shape<PageList>;
const PAGE_INFO = { id: num, kind: str, title: str, slug: orNull(str), home: bool, createdAt: str } as const satisfies Shape<PageInfo>;
const PAGE = { page: obj, draft: obj, published: orNull(obj), scheduled: orNull(obj), links: obj } as const satisfies Shape<Page>;
const DRAFT_SAVED = { revision: num, lastSaveId: orNull(str), updatedAt: str } as const satisfies Shape<DraftSaved>;
const DRAFT = { ...DRAFT_SAVED, document: obj } as const satisfies Shape<Draft>;
const VERSION = {
  number: num, reason: str, name: orNull(str), restoredFrom: orNull(num), createdAt: str, published: bool,
} as const satisfies Shape<Version>;
const VERSION_WITH_DOCUMENT = { ...VERSION, document: obj } as const satisfies Shape<VersionWithDocument>;
const PUBLISH_RESULT = { published: obj, version: obj, links: obj } as const satisfies Shape<PublishResult>;
const RESTORE_RESULT = { draft: obj, version: obj, kept: orNull(obj) } as const satisfies Shape<RestoreResult>;
const MEDIA_ITEM = {
  id: str, alt: str, width: num, height: num, contentType: str, byteSize: num, filename: str, url: str, createdAt: str,
} as const satisfies Shape<MediaItem>;
const MEDIA_USE = { pages: arr, versions: arr, entries: arr } as const satisfies Shape<MediaUse>;
const MEDIA_USE_PAGE = { id: num, title: str, slug: orNull(str) } as const satisfies Shape<MediaUse["pages"][number]>;
const MEDIA_USE_VERSION = { pageId: num, number: num } as const satisfies Shape<MediaUse["versions"][number]>;
const MEDIA_USE_ENTRY = { collectionId: num, id: num, title: str } as const satisfies Shape<MediaUse["entries"][number]>;
const COLLECTION = {
  id: num, name: str, prefix: str, fields: arr, sort: obj, publishedRevision: num, entryCount: num, publishedCount: num, createdAt: str, updatedAt: str, template: obj,
} as const satisfies Shape<Collection>;
const COLLECTION_LIST = { collections: arr } as const satisfies Shape<{ collections: Collection[] }>;
const ENTRY_PUBLISHED = { title: str, slug: str, values: obj, draftRevision: num, publishedAt: str } as const satisfies Shape<EntryPublished>;
const ENTRY = {
  id: num, collectionId: num, title: str, slug: str, values: obj, revision: num, lastSaveId: orNull(str), createdAt: str, updatedAt: str, published: orNull(obj),
} as const satisfies Shape<Entry>;
const ENTRY_LIST = { entries: arr } as const satisfies Shape<{ entries: Entry[] }>;
const SITE_STYLE = { palette: obj, typeScale: str, letterWidth: str, customCss: str, updatedAt: orNull(str), kept: orNull(obj), choices: obj } as const satisfies Shape<SiteStyle>;
const KEPT_STYLE = { palette: obj, typeScale: str, letterWidth: str, keptAt: str } as const satisfies Shape<KeptStyle>;
const SITE_STYLE_CHOICES = { palette: obj, typeScales: arr, letterWidths: arr } as const satisfies Shape<SiteStyle["choices"]>;
const TONE_CHOICE = { color: str, label: str, hex: str } as const satisfies Shape<ToneChoice>;
const TYPE_SCALE_CHOICE = { name: str, label: str } as const satisfies Shape<TypeScaleChoice>;
const LETTER_WIDTH_CHOICE = { name: str, label: str } as const satisfies Shape<LetterWidthChoice>;
const SITE = { timeZone: str } as const satisfies Shape<Site>;
const SHOP = {
  enabled: bool, currency: str, productsCollectionId: orNull(num), priceField: orNull(str), updatedAt: orNull(str), checkout: obj,
} as const satisfies Shape<Shop>;
const SHOP_CHECKOUT = { ready: bool, reason: orNull(str) } as const satisfies Shape<ShopCheckout>;
const ORDER_LINE = { entryId: num, title: str, unitAmount: num, quantity: num } as const satisfies Shape<OrderLine>;
const ORDER = {
  id: num, status: str, currency: str, lines: arr, total: num, stripeSessionId: orNull(str), email: orNull(str), paidAt: orNull(str), createdAt: str, updatedAt: str,
} as const satisfies Shape<Order>;
const ORDER_LIST = { orders: arr } as const satisfies Shape<{ orders: Order[] }>;
const FIELD_ERROR = { pointer: str, keyword: str, blockPointer: orNull(str), message: str } as const satisfies Shape<FieldError>;
// The refusals, less the member each side names its kind with: the API's
// `error` code, the interface's `kind`.
const CONFLICT = { message: str, currentRevision: num, lastSaveId: orNull(str) } as const satisfies Shape<Omit<Conflict, "kind">>;
const INVALID = { message: str, errors: arr } as const satisfies Shape<Omit<Invalid, "kind" | "code">>;
const IN_USE = { message: str, usedBy: obj } as const satisfies Shape<Omit<InUse, "kind">>;
const NOT_PENDING = { message: str, schedule: obj } as const satisfies Shape<Omit<NotPending, "kind">>;
const SCHEDULE = {
  id: num, at: str, revision: num, versionNumber: num, state: str, createdAt: str, settledAt: orNull(str), publishedVersionNumber: orNull(num),
} as const satisfies Shape<Schedule>;
const SCHEDULE_RESULT = { schedule: obj, version: obj, replaced: orNull(obj) } as const satisfies Shape<ScheduleResult>;
const KEPT_FIELD = { name: str, kind: str, label: str, required: bool, maxLength: optional(num) } as const satisfies Shape<KeptField>;
const RESPONSE_EXCERPT = { label: str, text: str, truncated: bool } as const satisfies Shape<ResponseExcerpt>;
const RESPONSE_SUMMARY = { id: num, formId: str, versionNumber: num, submittedAt: str, excerpt: orNull(obj) } as const satisfies Shape<ResponseSummary>;
const FORM_RESPONSE = { id: num, formId: str, versionNumber: num, submittedAt: str, fields: arr, answers: obj } as const satisfies Shape<FormResponse>;
const RESPONSE_LIST = { responses: arr, next: orNull(num), forms: arr } as const satisfies Shape<ResponseList>;
const FORM_RESPONSE_COUNT = { formId: str, count: num } as const satisfies Shape<FormResponseCount>;
// What DirectUpload hands back: the API's answer, less the direct_upload
// member the library takes out.
const DIRECT_UPLOAD_BLOB = {
  signed_id: str, filename: str, content_type: str, byte_size: num, checksum: str,
} as const satisfies Shape<DirectUploadBlob>;

// Requests, as the adapter writes them.
const NEW_PAGE = { title: str, slug: str } as const satisfies Shape<NewPage>;
const PAGE_CHANGES = { slug: optional(str), home: optional(bool) } as const satisfies Shape<PageChanges>;
const DRAFT_SAVE = { revision: num, document: obj, saveId: str } as const satisfies Shape<DraftSave>;
const PUBLISH_REQUEST = { revision: optional(num) } as const satisfies Shape<PublishRequest>;
const SCHEDULE_REQUEST = { revision: num, at: str } as const satisfies Shape<ScheduleRequest>;
const NEW_VERSION = { name: optional(str) } as const satisfies Shape<NewVersion>;
const SITE_STYLE_CHANGE = { palette: obj, typeScale: str, letterWidth: optional(str), customCss: optional(str), kept: optional(str) } as const satisfies Shape<SiteStyleChange>;
const SHOP_SETTINGS = { enabled: bool, currency: str, productsCollectionId: orNull(num), priceField: orNull(str) } as const satisfies Shape<ShopSettings>;
const MEDIA_CREATE = { signedBlobId: str, width: num, height: num, alt: optional(str) } as const satisfies Shape<MediaCreate>;
const MEDIA_ALT_CHANGE = { alt: str } as const satisfies Shape<MediaAltChange>;
// A collection's definition and an entry, as the collection schema
// describes them (cms/openapi.yaml refers to schema/collection.schema.json).
const COLLECTION_DEFINITION = { name: str, prefix: str, fields: arr, sort: obj } as const satisfies Shape<CollectionDefinition>;
const COLLECTION_CHANGES = { name: optional(str), prefix: optional(str), fields: optional(arr), sort: optional(obj) } as const satisfies Shape<CollectionChanges>;
const NEW_ENTRY = { title: str, slug: str, values: obj } as const satisfies Shape<EntryContent>;
const ENTRY_SAVE = { revision: num, saveId: str, title: str, slug: str, values: obj } as const satisfies Shape<EntrySave>;
// Not a body: the list's query parameters, compared with the operation's.
const RESPONSE_QUERY = { form: optional(str), before: optional(num) } as const satisfies Shape<ResponseQuery>;
const ENTRY_QUERY = { q: optional(str), order: optional(str) } as const satisfies Shape<EntryQuery>;

const INVALID_CODES = ["invalid_request", "invalid_document", "duplicate_key"] as const satisfies readonly Invalid["code"][];
// And no code of Invalid's is missing from the list.
const everyCode: Exclude<Invalid["code"], (typeof INVALID_CODES)[number]> extends never ? true : false = true;

// ------------------------------------------------ the API description

type Node = Record<string, unknown>;
const openapi = parse(readFileSync(new URL("../../../cms/openapi.yaml", import.meta.url), "utf8")) as Node;
// The collection schema the description refers to, and the page schema
// that one refers to, each by the reference that names it from the
// description's folder.
const COLLECTION_FILE = "../schema/collection.schema.json";
const PAGE_FILE = "../schema/block-document.schema.json";
const files: Readonly<Record<string, Node>> = {
  [COLLECTION_FILE]: JSON.parse(readFileSync(new URL("../../../schema/collection.schema.json", import.meta.url), "utf8")) as Node,
  [PAGE_FILE]: JSON.parse(readFileSync(new URL("../../../schema/block-document.schema.json", import.meta.url), "utf8")) as Node,
};

// The node at a JSON pointer of the description ("#/components/schemas/Page"),
// or of another file it refers to.
function at(pointer: string, root: Node = openapi): Node {
  let here: unknown = root;
  for (const raw of pointer.replace(/^#\/?/, "").split("/").filter((part) => part !== "")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (here === null || typeof here !== "object" || !(key in here)) throw new Error(`there is nothing at ${pointer} (stopped at ${key})`);
    here = (here as Node)[key];
  }
  return here as Node;
}

// A schema with its $ref followed: in the description, into the collection
// schema, and from there into the page schema beside it; and the file the
// schema found is in, for the references it holds in turn. The page
// document's own schema, referred to whole, is an object, held to
// document.ts by its own test.
function resolve(schema: Node, base = "openapi.yaml"): { node: Node; base: string } {
  const ref = schema.$ref;
  if (typeof ref !== "string") return { node: schema, base };
  const [file = "", fragment = ""] = ref.split("#");
  const target = file === "" ? base : base === "openapi.yaml" ? file : `../schema/${file}`;
  if (target === PAGE_FILE && fragment === "") return { node: { type: "object", externalRef: ref }, base: target };
  const root = target === "openapi.yaml" ? openapi : files[target];
  if (!root) throw new Error(`no file ${target} for the reference ${ref}`);
  return resolve(at(`#${fragment}`, root), target);
}
const follow = (schema: Node, base?: string): Node => resolve(schema, base).node;

function describeSchema(schema: Node, base?: string): { type: string; nullable: boolean } {
  const { node: resolved, base: here } = resolve(schema, base);
  if (Array.isArray(resolved.anyOf)) {
    const branches = (resolved.anyOf as Node[]).map((branch) => resolve(branch, here));
    const nonNull = branches.filter((b) => b.node.type !== "null");
    if (nonNull.length !== 1) throw new Error(`an anyOf of ${nonNull.length} non-null branches has no single type`);
    const inner = describeSchema(nonNull[0]!.node, nonNull[0]!.base);
    return { type: inner.type, nullable: inner.nullable || nonNull.length < branches.length };
  }
  if ("const" in resolved) return { type: typeof resolved.const, nullable: false };
  const types = (Array.isArray(resolved.type) ? resolved.type : [resolved.type]) as unknown[];
  const real = types.filter((t) => t !== "null").map((t) => (t === "integer" ? "number" : t));
  if (real.length !== 1 || typeof real[0] !== "string") throw new Error(`no single type in ${JSON.stringify(resolved).slice(0, 120)}`);
  return { type: real[0], nullable: types.includes("null") };
}

// The table the API gives an object schema, in the same form as the shapes.
function shapeOf(pointer: string, without: readonly string[] = []): Record<string, { type: string; nullable: boolean; required: boolean }> {
  const { node: schema, base } = resolve(at(pointer));
  if (schema.additionalProperties !== false) throw new Error(`${pointer} allows members it does not name, so no table can hold it`);
  const required = new Set((schema.required ?? []) as string[]);
  const properties = (schema.properties ?? {}) as Record<string, Node>;
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => !without.includes(key))
      .map(([key, property]) => [key, { ...describeSchema(property, base), required: required.has(key) }]),
  );
}

const sortKeys = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const json = "content/application~1json/schema";
const response = (path: string, method: string, status: number) => `#/paths/${path.replaceAll("/", "~1")}/${method}/responses/${status}/${json}`;
const requestBody = (path: string, method: string) => `#/paths/${path.replaceAll("/", "~1")}/${method}/requestBody/${json}`;

describe("the adapter's types match cms/openapi.yaml", () => {
  // Each shape, where the API describes it, and the members the API has
  // that the shape leaves to its kind.
  const pairs: Array<[name: string, shape: Record<string, unknown>, pointer: string, without?: readonly string[]]> = [
    ["PageLinks", PAGE_LINKS, "#/components/schemas/PageLinks"],
    ["Published", PUBLISHED, "#/components/schemas/Published"],
    ["PageSummary", PAGE_SUMMARY, "#/components/schemas/PageSummary"],
    ["PageList", PAGE_LIST, response("/api/pages", "get", 200)],
    ["PageInfo", PAGE_INFO, "#/components/schemas/Page/properties/page"],
    ["Page", PAGE, "#/components/schemas/Page"],
    ["DraftSaved", DRAFT_SAVED, "#/components/schemas/DraftSaved"],
    ["Draft", DRAFT, "#/components/schemas/Draft"],
    ["Version", VERSION, "#/components/schemas/Version"],
    ["VersionWithDocument", VERSION_WITH_DOCUMENT, "#/components/schemas/VersionWithDocument"],
    ["PublishResult", PUBLISH_RESULT, response("/api/pages/{id}/publish", "post", 200)],
    ["Schedule", SCHEDULE, "#/components/schemas/Schedule"],
    ["ScheduleResult", SCHEDULE_RESULT, response("/api/pages/{id}/schedules", "post", 201)],
    ["KeptField", KEPT_FIELD, "#/components/schemas/KeptField"],
    ["ResponseExcerpt", RESPONSE_EXCERPT, "#/components/schemas/ResponseExcerpt"],
    ["ResponseSummary", RESPONSE_SUMMARY, "#/components/schemas/FormResponseSummary"],
    ["FormResponse", FORM_RESPONSE, "#/components/schemas/FormResponse"],
    ["ResponseList", RESPONSE_LIST, response("/api/pages/{id}/responses", "get", 200)],
    ["FormResponseCount", FORM_RESPONSE_COUNT, `${response("/api/pages/{id}/responses", "get", 200)}/properties/forms/items`],
    ["RestoreResult", RESTORE_RESULT, response("/api/pages/{id}/versions/{number}/restore", "post", 200)],
    ["MediaItem", MEDIA_ITEM, "#/components/schemas/MediaItem"],
    ["MediaUse", MEDIA_USE, "#/components/schemas/MediaInUseError/properties/usedBy"],
    ["a page of MediaUse", MEDIA_USE_PAGE, "#/components/schemas/MediaInUseError/properties/usedBy/properties/pages/items"],
    ["a version of MediaUse", MEDIA_USE_VERSION, "#/components/schemas/MediaInUseError/properties/usedBy/properties/versions/items"],
    ["an entry of MediaUse", MEDIA_USE_ENTRY, "#/components/schemas/MediaInUseError/properties/usedBy/properties/entries/items"],
    ["Collection", COLLECTION, "#/components/schemas/Collection"],
    ["the list of collections", COLLECTION_LIST, response("/api/collections", "get", 200)],
    ["EntryPublished", ENTRY_PUBLISHED, "#/components/schemas/EntryPublished"],
    ["Entry", ENTRY, "#/components/schemas/Entry"],
    ["the list of entries", ENTRY_LIST, response("/api/collections/{id}/entries", "get", 200)],
    ["CollectionDefinition, the collection schema's", COLLECTION_DEFINITION, requestBody("/api/collections", "post")],
    ["CollectionChanges", COLLECTION_CHANGES, requestBody("/api/collections/{id}", "patch")],
    ["EntryContent, the collection schema's entry", NEW_ENTRY, requestBody("/api/collections/{id}/entries", "post")],
    ["EntrySave", ENTRY_SAVE, requestBody("/api/collections/{id}/entries/{entryId}", "put")],
    ["SiteStyle", SITE_STYLE, "#/components/schemas/SiteStyle"],
    ["SiteStyle's choices", SITE_STYLE_CHOICES, "#/components/schemas/SiteStyle/properties/choices"],
    ["KeptStyle", KEPT_STYLE, "#/components/schemas/KeptStyle"],
    ["ToneChoice", TONE_CHOICE, "#/components/schemas/SiteStyle/properties/choices/properties/palette/additionalProperties/items"],
    ["TypeScaleChoice", TYPE_SCALE_CHOICE, "#/components/schemas/SiteStyle/properties/choices/properties/typeScales/items"],
    ["LetterWidthChoice", LETTER_WIDTH_CHOICE, "#/components/schemas/SiteStyle/properties/choices/properties/letterWidths/items"],
    ["Site", SITE, "#/components/schemas/Site"],
    ["Shop", SHOP, "#/components/schemas/Shop"],
    ["Shop's checkout", SHOP_CHECKOUT, "#/components/schemas/Shop/properties/checkout"],
    ["ShopSettings, as the change sends them", SHOP_SETTINGS, requestBody("/api/shop", "put")],
    ["Order", ORDER, "#/components/schemas/Order"],
    ["OrderLine", ORDER_LINE, "#/components/schemas/OrderLine"],
    ["the list of orders", ORDER_LIST, response("/api/orders", "get", 200)],
    ["FieldError", FIELD_ERROR, "#/components/schemas/ErrorDetail"],
    ["Conflict", CONFLICT, "#/components/schemas/ConflictError", ["error"]],
    ["Invalid, as a request's", INVALID, "#/components/schemas/InvalidRequestError", ["error"]],
    ["Invalid, as a document's", INVALID, "#/components/schemas/InvalidDocumentError", ["error"]],
    ["Invalid, as a key named twice", INVALID, "#/components/schemas/DuplicateKeyError", ["error", "pointer"]],
    ["InUse", IN_USE, "#/components/schemas/MediaInUseError", ["error"]],
    ["NotPending", NOT_PENDING, "#/components/schemas/NotPendingError", ["error"]],
    ["DirectUpload's blob", DIRECT_UPLOAD_BLOB, "#/components/schemas/DirectUpload", ["direct_upload"]],
    ["NewPage", NEW_PAGE, requestBody("/api/pages", "post")],
    ["PageChanges", PAGE_CHANGES, requestBody("/api/pages/{id}", "patch")],
    ["DraftSave", DRAFT_SAVE, requestBody("/api/pages/{id}/draft", "put")],
    ["PublishRequest", PUBLISH_REQUEST, requestBody("/api/pages/{id}/publish", "post")],
    ["ScheduleRequest", SCHEDULE_REQUEST, requestBody("/api/pages/{id}/schedules", "post")],
    ["NewVersion", NEW_VERSION, requestBody("/api/pages/{id}/versions", "post")],
    ["SiteStyleChange", SITE_STYLE_CHANGE, requestBody("/api/site-style", "put")],
    ["MediaCreate", MEDIA_CREATE, requestBody("/api/media", "post")],
    ["MediaAltChange", MEDIA_ALT_CHANGE, requestBody("/api/media/{id}", "patch")],
  ];

  test.each(pairs)("%s", (_name, shape, pointer, without) => {
    expect(sortKeys(shape)).toEqual(sortKeys(shapeOf(pointer, without)));
  });

  test("the kinds of page", () => {
    expect([...PAGE_KINDS]).toEqual(at("#/components/schemas/Kind").enum);
  });

  test("what a change of the site style does with the style kept to be put back", () => {
    expect([...KEPT_CHANGES]).toEqual(follow(at(`${requestBody("/api/site-style", "put")}/properties/kept`)).enum);
  });

  test("the version reasons and the image types", () => {
    expect([...VERSION_REASONS]).toEqual(at("#/components/schemas/Version/properties/reason").enum);
    expect([...VERSION_REASONS]).toEqual(at("#/components/schemas/VersionWithDocument/properties/reason").enum);
    expect([...IMAGE_TYPES]).toEqual(at("#/components/schemas/ImageType").enum);
    expect([...SCHEDULE_STATES]).toEqual(at("#/components/schemas/Schedule/properties/state").enum);
  });

  test("the shop's currencies, an order's statuses on the CMS, and a line's most", () => {
    expect([...CURRENCIES]).toEqual(at("#/components/schemas/Currency").enum);
    expect([...ORDER_STATUSES]).toEqual(at("#/components/schemas/Order/properties/status").enum);
    expect(MOST_QUANTITY).toBe(at("#/components/schemas/OrderLine/properties/quantity").maximum);
    expect(MOST_LINES).toBe(at("#/components/schemas/Order/properties/lines").maxItems);
  });

  test("the largest upload and the largest side an image may have", () => {
    const blob = follow((follow(at(requestBody("/api/media/direct_uploads", "post"))).properties as Record<string, Node>).blob!);
    expect(MAX_UPLOAD_BYTES).toBe(follow((blob.properties as Record<string, Node>).byte_size!).maximum);
    const media = follow(at(requestBody("/api/media", "post"))).properties as Record<string, Node>;
    expect([follow(media.width!).maximum, follow(media.height!).maximum]).toEqual([MAX_IMAGE_SIDE, MAX_IMAGE_SIDE]);
  });

  test("the responses: a list's longest part, the kinds of a kept field, and the list's query", () => {
    expect(RESPONSES_PER_PART).toBe(at(`${response("/api/pages/{id}/responses", "get", 200)}/properties/responses`).maxItems);
    expect([...FORM_FIELD_KINDS]).toEqual(at("#/components/schemas/KeptField/properties/kind").enum);
    const parameters = (at("#/paths/~1api~1pages~1{id}~1responses/get").parameters as Node[]).map((schema) => follow(schema));
    const query = Object.fromEntries(
      parameters.filter((p) => p.in === "query").map((p) => [p.name as string, { ...describeSchema(p.schema as Node), required: p.required === true }]),
    );
    expect(sortKeys(query)).toEqual(sortKeys(RESPONSE_QUERY));
  });

  test("the list of entries' query", () => {
    const parameters = (at("#/paths/~1api~1collections~1{id}~1entries/get").parameters as Node[]).map((p) => follow(p));
    const query = Object.fromEntries(
      parameters.filter((p) => p.in === "query").map((p) => [p.name as string, { ...describeSchema(p.schema as Node), required: p.required === true }]),
    );
    expect(sortKeys(query)).toEqual(sortKeys(ENTRY_QUERY));
  });

  test("the codes of an invalid request", () => {
    const codes = ["InvalidRequestError", "InvalidDocumentError", "DuplicateKeyError"].map((name) => at(`#/components/schemas/${name}/properties/error`).const);
    expect(codes).toEqual([...INVALID_CODES]);
    expect(everyCode).toBe(true);
  });

  test("every shape compared is a real table, not an empty one", () => {
    for (const [name, shape, pointer, without] of pairs) {
      expect(Object.keys(shape).length, name).toBeGreaterThan(0);
      expect(Object.keys(shapeOf(pointer, without)).length, name).toBeGreaterThan(0);
    }
    expect(pairs).toHaveLength(64);
  });
});

describe("the Rails adapter's routes match cms/openapi.yaml", () => {
  const methods = ["get", "post", "put", "patch", "delete"] as const;
  const operations = Object.entries(at("#/paths")).flatMap(([path, item]) =>
    methods.filter((method) => method in (item as Node)).map((method) => {
      const operation = (item as Node)[method] as Node;
      const body = operation.requestBody as Node | undefined;
      return {
        id: operation.operationId as string,
        method: method.toUpperCase(),
        path,
        body: body === undefined ? "none" : body.required === true ? "required" : "optional",
      };
    }),
  );

  test("every operation of the API has its route, with the API's method, path and body", () => {
    expect(operations.length).toBeGreaterThanOrEqual(22);
    const routes = RAILS_ROUTES as Record<string, { method: string; path: string; body: string }>;
    const differing = operations.filter((op) => {
      const route = routes[op.id];
      return route === undefined || route.method !== op.method || `/api${route.path}` !== op.path || route.body !== op.body;
    });
    expect(differing).toEqual([]);
  });

  test("and every route is an operation of the API", () => {
    const ids = new Set(operations.map((op) => op.id));
    expect((Object.keys(RAILS_ROUTES) as OperationId[]).filter((id) => !ids.has(id))).toEqual([]);
  });
});
