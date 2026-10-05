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
  IMAGE_TYPES, MAX_IMAGE_SIDE, MAX_UPLOAD_BYTES, RESPONSES_PER_PART, SCHEDULE_STATES, VERSION_REASONS,
  type Conflict, type Draft, type DraftSave, type DraftSaved, type FieldError, type FormResponse, type FormResponseCount, type InUse, type Invalid,
  type KeptField, type MediaItem, type MediaUse, type NewPage, type NewVersion, type Page, type PageChanges, type PageInfo, type PageLinks, type PageSummary,
  type NotPending, type Published, type PublishRequest, type PublishResult, type ResponseExcerpt, type ResponseList, type ResponseQuery, type ResponseSummary,
  type RestoreResult, type Schedule, type ScheduleRequest, type ScheduleResult,
  type Site, type SiteLink, type SiteStyle, type SiteStyleChange,
  type ToneChoice, type TypeScaleChoice, type Version, type VersionWithDocument,
} from "./adapter.ts";
import { FORM_FIELD_KINDS } from "../shared/document.ts";
import { RAILS_ROUTES, type MediaAltChange, type MediaCreate, type OperationId } from "./rails.ts";

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
const PUBLISHED = { slug: str, versionNumber: num, draftRevision: num, publishedAt: str } as const satisfies Shape<Published>;
const PAGE_SUMMARY = {
  id: num, title: str, slug: str, home: bool, revision: num, updatedAt: str, published: orNull(obj), scheduled: orNull(obj), links: obj,
} as const satisfies Shape<PageSummary>;
const PAGE_INFO = { id: num, title: str, slug: str, home: bool, createdAt: str } as const satisfies Shape<PageInfo>;
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
const MEDIA_USE = { pages: arr, versions: arr } as const satisfies Shape<MediaUse>;
const MEDIA_USE_PAGE = { id: num, title: str, slug: str } as const satisfies Shape<MediaUse["pages"][number]>;
const MEDIA_USE_VERSION = { pageId: num, number: num } as const satisfies Shape<MediaUse["versions"][number]>;
const SITE_STYLE = { palette: obj, typeScale: str, updatedAt: orNull(str), choices: obj } as const satisfies Shape<SiteStyle>;
const SITE_STYLE_CHOICES = { palette: obj, typeScales: arr } as const satisfies Shape<SiteStyle["choices"]>;
const TONE_CHOICE = { color: str, label: str, hex: str } as const satisfies Shape<ToneChoice>;
const TYPE_SCALE_CHOICE = { name: str, label: str } as const satisfies Shape<TypeScaleChoice>;
const SITE = { name: str, menu: arr, action: orNull(obj), footer: obj, timeZone: str } as const satisfies Shape<Site>;
const SITE_LINK = { label: str, href: str } as const satisfies Shape<SiteLink>;
const SITE_FOOTER = { lead: str, text: str } as const satisfies Shape<Site["footer"]>;
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
const SITE_STYLE_CHANGE = { palette: obj, typeScale: str } as const satisfies Shape<SiteStyleChange>;
const MEDIA_CREATE = { signedBlobId: str, width: num, height: num, alt: optional(str) } as const satisfies Shape<MediaCreate>;
const MEDIA_ALT_CHANGE = { alt: str } as const satisfies Shape<MediaAltChange>;
// Not a body: the list's query parameters, compared with the operation's.
const RESPONSE_QUERY = { form: optional(str), before: optional(num) } as const satisfies Shape<ResponseQuery>;

const INVALID_CODES = ["invalid_request", "invalid_document", "duplicate_key"] as const satisfies readonly Invalid["code"][];
// And no code of Invalid's is missing from the list.
const everyCode: Exclude<Invalid["code"], (typeof INVALID_CODES)[number]> extends never ? true : false = true;

// ------------------------------------------------ the API description

type Node = Record<string, unknown>;
const openapi = parse(readFileSync(new URL("../../../cms/openapi.yaml", import.meta.url), "utf8")) as Node;

// The node at a JSON pointer of the description ("#/components/schemas/Page").
function at(pointer: string): Node {
  let here: unknown = openapi;
  for (const raw of pointer.replace(/^#\//, "").split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (here === null || typeof here !== "object" || !(key in here)) throw new Error(`openapi.yaml has nothing at ${pointer} (stopped at ${key})`);
    here = (here as Node)[key];
  }
  return here as Node;
}

// A schema with its local $ref followed. A reference to another file is
// the page document's schema, held to document.ts by its own test.
function follow(schema: Node): Node {
  const ref = schema.$ref;
  if (typeof ref !== "string") return schema;
  if (!ref.startsWith("#/")) return { type: "object", externalRef: ref };
  return follow(at(ref));
}

function describeSchema(schema: Node): { type: string; nullable: boolean } {
  const resolved = follow(schema);
  if (Array.isArray(resolved.anyOf)) {
    const branches = (resolved.anyOf as Node[]).map(follow);
    const nonNull = branches.filter((b) => b.type !== "null");
    if (nonNull.length !== 1) throw new Error(`an anyOf of ${nonNull.length} non-null branches has no single type`);
    const inner = describeSchema(nonNull[0]!);
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
  const schema = follow(at(pointer));
  if (schema.additionalProperties !== false) throw new Error(`${pointer} allows members it does not name, so no table can hold it`);
  const required = new Set((schema.required ?? []) as string[]);
  const properties = (schema.properties ?? {}) as Record<string, Node>;
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => !without.includes(key))
      .map(([key, property]) => [key, { ...describeSchema(property), required: required.has(key) }]),
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
    ["SiteStyle", SITE_STYLE, "#/components/schemas/SiteStyle"],
    ["SiteStyle's choices", SITE_STYLE_CHOICES, "#/components/schemas/SiteStyle/properties/choices"],
    ["ToneChoice", TONE_CHOICE, "#/components/schemas/SiteStyle/properties/choices/properties/palette/additionalProperties/items"],
    ["TypeScaleChoice", TYPE_SCALE_CHOICE, "#/components/schemas/SiteStyle/properties/choices/properties/typeScales/items"],
    ["Site", SITE, "#/components/schemas/Site"],
    ["SiteLink", SITE_LINK, "#/components/schemas/SiteLink"],
    ["Site's footer", SITE_FOOTER, "#/components/schemas/Site/properties/footer"],
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

  test("the version reasons and the image types", () => {
    expect([...VERSION_REASONS]).toEqual(at("#/components/schemas/Version/properties/reason").enum);
    expect([...VERSION_REASONS]).toEqual(at("#/components/schemas/VersionWithDocument/properties/reason").enum);
    expect([...IMAGE_TYPES]).toEqual(at("#/components/schemas/ImageType").enum);
    expect([...SCHEDULE_STATES]).toEqual(at("#/components/schemas/Schedule/properties/state").enum);
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
    const parameters = (at("#/paths/~1api~1pages~1{id}~1responses/get").parameters as Node[]).map(follow);
    const query = Object.fromEntries(
      parameters.filter((p) => p.in === "query").map((p) => [p.name as string, { ...describeSchema(p.schema as Node), required: p.required === true }]),
    );
    expect(sortKeys(query)).toEqual(sortKeys(RESPONSE_QUERY));
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
    expect(pairs).toHaveLength(47);
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
