// The storage adapter: the one way the editor reads and writes pages, their
// draft and versions, the media library, the site style, form answers,
// collections with their entries, and the shop's settings and orders.
// The editor talks to an adapter, never to a server, so the same editor
// runs on the Rails CMS (rails.ts) and, in stage 6, on the browser alone.
// contract.ts is the behaviour every adapter must show, written against
// this interface only.
//
// How an operation answers:
// - What it was asked for, or, where the editor has a way forward, an
//   Outcome naming the refusal: a conflict (someone saved first), an
//   invalid request (with the fields at fault), an image still in use.
//   These are part of the editor's flow, so the compiler makes the caller
//   look at them.
// - Anything else is thrown as a StorageError, whose failure says which of
//   four things happened (Failure, below): no answer that says what
//   happened, a refusal no retry will change, nothing at that address, or
//   an operation this adapter does not have.
//
// The answers' types are written by hand from what the CMS sends
// (cms/openapi.yaml, whose request tests hold the CMS's real answers to
// it); openapi.test.ts holds these types to that file, key by key.
import type { CollectionDefinition, EntryContent, EntryValues } from "../shared/collection.ts";
import type { FormFieldKind, PageDocument } from "../shared/document.ts";
import type { Currency, OrderLine, ShopSettings } from "../shared/shop.ts";

// ISO 8601, in UTC, as the server writes it ("2026-10-02T09:15:00.000Z").
export type Time = string;

// ------------------------------------------------------------- pages

// A page, or one of the site's parts: the header and the footer, documents
// like a page's, edited, versioned and published as a page is, which every
// page draws around its sections. A part has no address and is never the
// home page; the storage lists the two apart from the pages (listParts).
// Or a collection's template, the document each of its entries is drawn
// with, kept the same way, with no address either, which the storage lists
// with its collection (Collection.template).
export const PAGE_KINDS = ["page", "header", "footer", "template"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];
export type PartKind = "header" | "footer";
export const PART_KINDS = ["header", "footer"] as const satisfies readonly PartKind[];

// Whether a kind is one of the site's parts.
export function isPartKind(kind: PageKind): kind is PartKind {
  return (PART_KINDS as readonly PageKind[]).includes(kind);
}

export interface PageLinks {
  // The API's own addresses of the page.
  self: string;
  draft: string;
  versions: string;
  publish: string;
  schedules: string;
  // The draft as the published page would look, and the live page (null
  // before the first publish, and for a part, which has no page of its
  // own): paths on the CMS's own origin, which the editor's development
  // proxy does not forward. A part's preview is the home page's draft
  // inside the parts' drafts.
  preview: string;
  live: string | null;
}

// What is live, or null before the first publish.
export interface Published {
  // The live address, which a later PATCH of the slug changes only at the
  // next publish; null for a part, which has none.
  slug: string | null;
  versionNumber: number;
  // The draft's revision the live version was taken from. The draft's own
  // revision minus this is the number of saves visitors do not see yet
  // ("Published, N changes not live"); zero, and the draft is what is
  // live. A restore counts as a save; a new address alone does not (the
  // page's slug against this object's says that).
  draftRevision: number;
  publishedAt: Time;
}

export interface PageSummary {
  id: number;
  kind: PageKind;
  title: string;
  // The next address: the one the next publish applies; null for a part.
  slug: string | null;
  // Whether this is the page the site's root address serves.
  home: boolean;
  revision: number;
  updatedAt: Time;
  published: Published | null;
  // The publish set for a time and still waiting for it, or null.
  scheduled: Schedule | null;
  links: PageLinks;
}

export interface PageInfo {
  id: number;
  kind: PageKind;
  title: string;
  slug: string | null;
  home: boolean;
  createdAt: Time;
}

export interface Page {
  page: PageInfo;
  draft: Draft;
  published: Published | null;
  scheduled: Schedule | null;
  links: PageLinks;
}

// What a save answers: the draft's new revision, and the saveId of the save
// that took it there.
export interface DraftSaved {
  revision: number;
  // null for a draft no save has touched yet, or right after a restore.
  lastSaveId: string | null;
  updatedAt: Time;
}

export interface Draft extends DraftSaved {
  document: PageDocument;
}

export const VERSION_REASONS = ["publish", "restore", "before-restore", "manual", "auto", "scheduled"] as const;
// publish; restore; before-restore (the draft a restore replaced); manual
// ("Save version"); auto (kept while someone edits, at most every ten
// minutes on the CMS); scheduled (the draft as it was when a publish was
// set for a time: what that publish puts live).
export type VersionReason = (typeof VERSION_REASONS)[number];

export interface Version {
  number: number;
  reason: VersionReason;
  name: string | null;
  // For a restore, the number of the version copied back.
  restoredFrom: number | null;
  createdAt: Time;
  // Whether this is the version that is live.
  published: boolean;
}

export interface VersionWithDocument extends Version {
  document: PageDocument;
}

export interface PublishResult {
  published: Published;
  version: Version;
  links: PageLinks;
}

export interface RestoreResult {
  // The draft as restored, at its new revision.
  draft: Draft;
  // The restore version, of the document now in the draft.
  version: Version;
  // The before-restore version keeping the draft as it was, or null when
  // the draft was already the newest version.
  kept: Version | null;
}

export const SCHEDULE_STATES = ["pending", "published", "cancelled", "replaced", "superseded", "failed"] as const;
// pending until its time; then published, or superseded (by its time a
// publish had already put its revision or a later one live), or failed.
// Before its time: cancelled, or replaced by a newer schedule of the page,
// which has at most one pending.
export type ScheduleState = (typeof SCHEDULE_STATES)[number];

// A publish set for a time. What goes live then is the draft as it was
// when it was set (revision), kept as the version versionNumber: edits
// made in between wait for the next publish.
export interface Schedule {
  id: number;
  at: Time;
  revision: number;
  versionNumber: number;
  state: ScheduleState;
  createdAt: Time;
  // When it stopped being pending; null while it is.
  settledAt: Time | null;
  // For a published one, the version the publish made.
  publishedVersionNumber: number | null;
}

export interface ScheduleResult {
  schedule: Schedule;
  // The "scheduled" version, of what will go live.
  version: Version;
  // The pending schedule this one replaced, or null.
  replaced: Schedule | null;
}

// ------------------------------------------------------------- media

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

// The largest file an upload may send, 10 MB, and the largest side in
// pixels the library takes. A larger file is refused at /file before its
// bytes are sent; the editor uses the numbers to word that refusal.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 10_000;

export interface MediaItem {
  // The id documents name as mediaId.
  id: string;
  // The alt text proposed when the image is placed; each block keeps its own.
  alt: string;
  width: number;
  height: number;
  contentType: ImageType;
  byteSize: number;
  filename: string;
  // Where the image is served, ready for an <img src>.
  url: string;
  createdAt: Time;
}

// Who still shows an image the editor asked to delete.
export interface MediaUse {
  // Pages whose draft shows it.
  pages: Array<{ id: number; title: string; slug: string | null }>;
  // Kept versions that show it.
  versions: Array<{ pageId: number; number: number }>;
  // Entries whose draft, or what is live of them, show it.
  entries: Array<{ collectionId: number; id: number; title: string }>;
}

// ------------------------------------------------------- site style

export interface ToneChoice {
  // The colour's name in schema/tokens.json, the value a palette slot takes.
  color: string;
  label: string;
  hex: string;
}

export interface TypeScaleChoice {
  name: string;
  label: string;
}

export interface LetterWidthChoice {
  name: string;
  label: string;
}

// A style kept to be put back: its palette, type scale and letter width,
// and when it was kept.
export interface KeptStyle {
  palette: Record<string, string>;
  typeScale: string;
  letterWidth: string;
  keptAt: Time;
}

export interface SiteStyle {
  // A tone for every palette slot, by colour name.
  palette: Record<string, string>;
  typeScale: string;
  // How wide the Headings typeface is drawn.
  letterWidth: string;
  // The site's own stylesheet, drawn inside the site on every page
  // (../shared/custom-css.ts); "" for none.
  customCss: string;
  // null until the style is first changed.
  updatedAt: Time | null;
  // The style as it was before the Assistant's last new site, which Put
  // the old style back puts back in one click; null while there is none,
  // and once it is put back.
  kept: KeptStyle | null;
  // The values each part may take: the curated tones of each slot, the
  // type scales and the letter widths.
  choices: {
    palette: Record<string, ToneChoice[]>;
    typeScales: TypeScaleChoice[];
    letterWidths: LetterWidthChoice[];
  };
}

// ------------------------------------------------------- the site

// The site's own settings, which no request changes.
export interface Site {
  // The site's time zone, an IANA name ("Europe/London"): a scheduled
  // publish is set and shown in it, the same for every visitor.
  timeZone: string;
}

// ---------------------------------------------------- form answers

// What visitors sent with the forms of a page's published versions. Each
// response keeps the version its form was read from and a copy of the
// form's fields as that version had them, so it reads the same after the
// form changes. What a visitor wrote is text from a stranger: shown as
// text, never as markup.

// A field of the form, as the version the response came from had it (the
// document's form field): maxLength only for the two kinds of text.
export interface KeptField {
  name: string;
  kind: FormFieldKind;
  label: string;
  required: boolean;
  maxLength?: number;
}

// The first text answer that is not empty, on one line, cut at 120
// characters as a reader counts them; truncated says whether it was cut.
export interface ResponseExcerpt {
  label: string;
  text: string;
  truncated: boolean;
}

// A response as a list shows it.
export interface ResponseSummary {
  id: number;
  // The form block's id in the page's document.
  formId: string;
  versionNumber: number;
  submittedAt: Time;
  // null when every text answer is empty, or the form has only checkboxes.
  excerpt: ResponseExcerpt | null;
}

// A response whole: each field's answer by its name, every field with one.
// A text is the string sent ("" when left empty); a checkbox, whether it
// was ticked.
export interface FormResponse {
  id: number;
  formId: string;
  versionNumber: number;
  submittedAt: Time;
  fields: KeptField[];
  answers: Record<string, string | boolean>;
}

export interface FormResponseCount {
  formId: string;
  count: number;
}

// A part of a page's responses, newest first, at most RESPONSES_PER_PART.
// next continues the list (ResponseQuery.before), null at its end. forms
// counts the responses of each form of the page that has any, whatever the
// query, so the editor offers only forms with responses; in the order of
// their ids, character code by character code (a form's id is ASCII, so
// that is JavaScript's own string order and the database's).
export interface ResponseList {
  responses: ResponseSummary[];
  next: number | null;
  forms: FormResponseCount[];
}

export interface ResponseQuery {
  // Only this form's responses, by its block's id.
  form?: string;
  // Only the responses that came before this one: a list's next.
  before?: number;
}

export const RESPONSES_PER_PART = 50;

// ------------------------------------------------------- collections

// A collection, a type of content: its definition (../shared/collection.ts:
// its name, the prefix of its entries' addresses, its fields, the order its
// entries are listed in), its entries counted, and its template, the page
// of kind template that draws each entry, read, saved, versioned and
// published by the page operations, by its id, as a part is.
export interface Collection extends CollectionDefinition {
  id: number;
  // Advanced by every change a visitor could see: a publish, an
  // unpublish, the delete of a live entry, a change of the definition.
  // The pages that list the collection's entries are cached by it.
  publishedRevision: number;
  entryCount: number;
  // How many entries are live.
  publishedCount: number;
  createdAt: Time;
  // When the definition last changed.
  updatedAt: Time;
  template: PageSummary;
}

// What is live of an entry: what it was last published with.
export interface EntryPublished {
  title: string;
  // The live address, /<prefix>/<slug>.
  slug: string;
  values: EntryValues;
  // The entry's revision this was taken from: the entry's own minus it is
  // the saves visitors do not see yet.
  draftRevision: number;
  // When it went live: the first publish since the last unpublish.
  publishedAt: Time;
}

// An entry: its draft (title, slug, values) at its revision, and what is
// live, or null before the first publish and after an unpublish.
export interface Entry extends EntryContent {
  id: number;
  collectionId: number;
  revision: number;
  // The saveId of the save that took the entry to its revision; null
  // before any save.
  lastSaveId: string | null;
  createdAt: Time;
  // The latest save, publish or unpublish.
  updatedAt: Time;
  published: EntryPublished | null;
}

// The list's query: words its titles hold (ASCII letters without their
// case), and an order (title, updatedAt, publishedAt, createdAt, or the key
// of a date or number field; a minus before it for a descending one). An
// entry with nothing to order by comes last.
export interface EntryQuery {
  q?: string;
  order?: string;
}

// ------------------------------------------------------------ the shop

// The shop's settings (../shared/shop.ts: on or off, the currency, the
// products collection and its price field), when they last changed, and
// whether a checkout reaches Stripe.
export interface Shop extends ShopSettings {
  // null until the settings first change.
  updatedAt: Time | null;
  checkout: ShopCheckout;
}

export interface ShopCheckout {
  // Whether a checkout reaches Stripe, in its test mode: on the CMS, a key
  // of that mode where it runs. The browser's storage never does: its
  // demo's checkout makes an order of its own status, demo.
  ready: boolean;
  // Why not, in words the editor shows; null when ready. Never a key.
  reason: string | null;
}

// An order's status on the CMS: open from its checkout until Stripe says
// it is paid, or that its session expired unpaid.
export const ORDER_STATUSES = ["open", "paid", "expired"] as const;
// And the browser's own: demo, an order the demo's checkout made, which
// reaches no payment.
export type OrderStatus = (typeof ORDER_STATUSES)[number] | "demo";

// Each status as the editor says it.
export const ORDER_STATUS_WORDS: Readonly<Record<OrderStatus, string>> = {
  open: "Open",
  paid: "Paid",
  expired: "Expired",
  demo: "Not paid: browser demo",
};

// What a checkout asked to be paid: its lines as the products were sold
// (../shared/shop.ts, OrderLine), the total, both in the currency's
// smallest unit, and, once paid, the email the buyer gave Stripe and when
// the storage learned it was paid.
export interface Order {
  id: number;
  status: OrderStatus;
  currency: Currency;
  lines: OrderLine[];
  total: number;
  // The order's Checkout Session at Stripe (cs_test_...); null for the
  // demo's, and only while a checkout asks Stripe for it on the CMS.
  stripeSessionId: string | null;
  email: string | null;
  paidAt: Time | null;
  createdAt: Time;
  updatedAt: Time;
}

// --------------------------------------------------------- requests

export interface NewPage {
  title: string;
  slug: string;
}

// At least one of the two.
export interface PageChanges {
  // The address the next publish applies.
  slug?: string;
  // true makes this the page the root address serves, at once.
  home?: boolean;
}

export interface DraftSave {
  // The revision the editor's document started from.
  revision: number;
  document: PageDocument;
  // The id the editor gives this save, [A-Za-z0-9_-]{1,64}. Sent again
  // unchanged, with the same revision and document, when the answer to it
  // never came: if that save was stored, the retry is answered as saved.
  saveId: string;
}

export interface PublishRequest {
  // Publish only if the draft is still at this revision.
  revision?: number;
}

export interface ScheduleRequest {
  // The draft revision the person scheduling has seen: what goes live.
  revision: number;
  // When, in UTC, later than now and at most a year ahead.
  at: Time;
}

export interface NewVersion {
  // One line, at most 80 characters.
  name?: string;
}

// An image to add to the library. The editor has already resized it and
// knows its size in pixels; the server measures nothing.
export interface Upload {
  file: File;
  width: number;
  height: number;
  alt?: string;
}

// What a change does with the style kept to be put back (SiteStyle.kept):
// "now" keeps the style as it is before the change, in place of one kept
// before (the Assistant's new site does); "none" lets go of the one kept
// (it was put back).
export const KEPT_CHANGES = ["now", "none"] as const;
export type KeptChange = (typeof KEPT_CHANGES)[number];

export interface SiteStyleChange {
  palette: Record<string, string>;
  typeScale: string;
  // Without either, the style keeps its own.
  letterWidth?: string;
  customCss?: string;
  // Without it, what is kept stays as it is.
  kept?: KeptChange;
}

// At least one member of a collection's definition; each replaces its own,
// and the definition is checked whole.
export interface CollectionChanges {
  name?: string;
  prefix?: string;
  fields?: CollectionDefinition["fields"];
  sort?: CollectionDefinition["sort"];
}

// A save of an entry: its title, slug and values, from the revision the
// editor started from, under an id of the save's own, as a page draft's.
export interface EntrySave extends EntryContent {
  revision: number;
  saveId: string;
}

export interface CallOptions {
  // Abandons the call. A write abandoned this way may still have reached
  // the server: the call fails with an unknown outcome.
  signal?: AbortSignal | undefined;
}

export interface UploadOptions extends CallOptions {
  // How many of the file's bytes have been sent, as they go.
  onProgress?: ((sent: number, total: number) => void) | undefined;
}

// ------------------------------------------------ refusals and failures

// One problem with a request. pointer is a JSON pointer into the request
// as it was given to the adapter ("" is the request itself): for a save,
// /document/sections/0/props/... For an upload, /file stands for the file
// (its type, its size, or bytes that never arrived), and /width, /height
// and /alt for the rest.
export interface FieldError {
  pointer: string;
  // The rule broken, as JSON Schema names it (required, pattern, maximum...)
  // or as the application rules do (uniqueId, duplicateKey, mediaExists...).
  keyword: string;
  // For a value inside a block of the document, the pointer of that block.
  blockPointer: string | null;
  message: string;
}

export interface Invalid {
  kind: "invalid";
  // invalid_request: the request; invalid_document: the document in it;
  // duplicate_key: a member named twice in one object.
  code: "invalid_request" | "invalid_document" | "duplicate_key";
  message: string;
  errors: FieldError[];
}

export interface Conflict {
  kind: "conflict";
  message: string;
  // Where the draft is now, and the saveId of the save that took it there
  // (null after a restore).
  currentRevision: number;
  lastSaveId: string | null;
}

export interface InUse {
  kind: "in-use";
  message: string;
  usedBy: MediaUse;
}

// A scheduled publish cancelled too late: it is no longer pending, and
// schedule says what became of it (published, replaced...).
export interface NotPending {
  kind: "not-pending";
  message: string;
  schedule: Schedule;
}

export type Outcome<T, P> = { ok: true; value: T } | { ok: false; problem: P };

export const OPTIONAL_OPERATIONS = ["publish", "schedule", "responses", "collections", "shop"] as const;
// What an adapter may lack: publishing (keeping what goes live as a
// version, with the page's published state; whether it is then served is
// livePages, below), scheduled publishing, form answers, collections (and
// their entries and templates), the shop (its settings and orders).
export type OptionalOperation = (typeof OPTIONAL_OPERATIONS)[number];

// Says which optional operations this adapter has. The editor shows no
// control for one it lacks, and the adapter refuses it, as unsupported,
// without asking anyone.
//
// And two things the storage does or does not do on its own:
// - imageVariants, whether it makes smaller copies of an uploaded image for
//   the pages to serve. Without them the file is served as it was
//   uploaded, so the editor resizes each image before it goes up, and its
//   media library says so: a visitor's phone gets that file and no smaller
//   one.
// - livePages, whether a publish puts the page in front of visitors,
//   served at links.live with the cache. The CMS does. The browser's
//   storage keeps what was published as a version and the page's
//   published state, for the preview, but serves nothing: there links.live
//   stays null, and the editor shows the published page itself.
export type Capabilities = Readonly<Record<OptionalOperation, boolean>> & { readonly imageVariants: boolean; readonly livePages: boolean };

export type Failure =
  // No answer that says what happened: the network failed, the time ran
  // out or the call was abandoned, the server failed (5xx), or what came
  // back is not the API's. A write may or may not have taken effect: a
  // save is sent again, unchanged, with the same saveId.
  | { kind: "unknown"; cause: "network" | "timeout" | "server" | "unreadable"; status: number | null; message: string }
  // The server refused the request and nothing was changed; sending it
  // again gets the same answer (a request from another origin, one not
  // sent as JSON, a body that is not JSON, a file the browser cannot read).
  | { kind: "refused"; status: number; code: string; message: string }
  // No such page, version or image.
  | { kind: "not-found"; message: string }
  // This adapter does not have the operation (Capabilities).
  | { kind: "unsupported"; operation: OptionalOperation; message: string };

export class StorageError extends Error {
  readonly failure: Failure;

  constructor(failure: Failure) {
    super(failure.message);
    this.name = "StorageError";
    this.failure = failure;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError;
}

export function unsupported(operation: OptionalOperation, adapter: string): StorageError {
  return new StorageError({ kind: "unsupported", operation, message: `The ${adapter} storage cannot ${OPERATION_VERBS[operation]}.` });
}

const OPERATION_VERBS: Record<OptionalOperation, string> = {
  publish: "publish pages",
  schedule: "schedule a publish",
  responses: "keep form answers",
  collections: "keep collections",
  shop: "keep a shop",
};

// ---------------------------------------------------------- the adapter

export interface StorageAdapter {
  // A short name for messages: "rails".
  readonly name: string;
  readonly capabilities: Capabilities;

  // Pages, oldest first: those of kind page, which a visitor finds at an
  // address.
  listPages(options?: CallOptions): Promise<PageSummary[]>;
  // The site's parts, the header then the footer, made the first time they
  // are asked for, each with its starter as the draft and nothing live.
  // Every other operation on pages takes a part by its id as it takes a
  // page, but for a part's own rules: no address and never the home page
  // (updatePage: invalid at the member, keyword part), and no form in its
  // document (saveDraft: invalid at the form block, keyword part).
  listParts(options?: CallOptions): Promise<PageSummary[]>;
  // A new page: an empty document holding its title, nothing live.
  createPage(page: NewPage, options?: CallOptions): Promise<Outcome<Page, Invalid>>;
  getPage(pageId: number, options?: CallOptions): Promise<Page>;
  updatePage(pageId: number, changes: PageChanges, options?: CallOptions): Promise<Outcome<Page, Invalid>>;
  getDraft(pageId: number, options?: CallOptions): Promise<Draft>;
  // Saves the document if the draft is still at save.revision. The same
  // save sent again (same saveId, revision and document) after its answer
  // was lost is answered as saved, at the revision it made.
  saveDraft(pageId: number, save: DraftSave, options?: CallOptions): Promise<Outcome<DraftSaved, Conflict | Invalid>>;
  // Puts live what the draft holds, as a new version (capability publish).
  publish(pageId: number, request?: PublishRequest, options?: CallOptions): Promise<Outcome<PublishResult, Conflict | Invalid>>;
  // Capability schedule: the draft at request.revision goes live at
  // request.at, kept as a "scheduled" version until then; a pending
  // schedule of the page is replaced. A conflict if the draft has moved
  // past the revision; invalid for a time not later than now or more than
  // a year ahead (/at), or a revision already live (/revision).
  schedulePublish(pageId: number, request: ScheduleRequest, options?: CallOptions): Promise<Outcome<ScheduleResult, Conflict | Invalid>>;
  // Cancels a pending schedule; refused, saying what became of it, when
  // it is no longer pending.
  cancelScheduledPublish(pageId: number, scheduleId: number, options?: CallOptions): Promise<Outcome<Schedule, NotPending>>;
  // The page's schedules, newest first, whatever became of them.
  listSchedules(pageId: number, options?: CallOptions): Promise<Schedule[]>;

  // Versions, newest first, without their documents.
  listVersions(pageId: number, options?: CallOptions): Promise<Version[]>;
  getVersion(pageId: number, number: number, options?: CallOptions): Promise<VersionWithDocument>;
  // "Save version": the draft as it is now, under an optional name.
  saveVersion(pageId: number, request?: NewVersion, options?: CallOptions): Promise<Outcome<Version, Invalid>>;
  // Copies a version back into the draft, after keeping the draft as it was.
  restoreVersion(pageId: number, number: number, options?: CallOptions): Promise<Outcome<RestoreResult, Invalid>>;

  // The library, newest first.
  listMedia(options?: CallOptions): Promise<MediaItem[]>;
  uploadMedia(upload: Upload, options?: UploadOptions): Promise<Outcome<MediaItem, Invalid>>;
  // The alt text proposed for new placements of the image.
  setMediaAlt(mediaId: string, alt: string, options?: CallOptions): Promise<Outcome<MediaItem, Invalid>>;
  // Refused, with who uses it, while a draft or a kept version shows it.
  deleteMedia(mediaId: string, options?: CallOptions): Promise<Outcome<null, InUse>>;

  getSiteStyle(options?: CallOptions): Promise<SiteStyle>;
  setSiteStyle(style: SiteStyleChange, options?: CallOptions): Promise<Outcome<SiteStyle, Invalid>>;
  // The site's settings: its time zone.
  getSite(options?: CallOptions): Promise<Site>;

  // Capability responses: what visitors sent with the page's forms, a part
  // at a time, newest first.
  listResponses(pageId: number, query?: ResponseQuery, options?: CallOptions): Promise<ResponseList>;
  // One response, not-found unless it is this page's.
  getResponse(pageId: number, responseId: number, options?: CallOptions): Promise<FormResponse>;
  // Deletes it for good; not-found when it is already gone.
  deleteResponse(pageId: number, responseId: number, options?: CallOptions): Promise<void>;

  // Capability collections: types of content, each with its fields, its
  // entries, and its template (a page of kind template, by its id, through
  // the page operations above: no address, no home mark, no form, each
  // refused with the keyword template). Oldest first.
  listCollections(options?: CallOptions): Promise<Collection[]>;
  // A new collection, with its template: an empty document with its name,
  // nothing live. Invalid at each fault of the definition (its schema's and
  // its rules', at pointers into it: /fields/0/key...), and at /prefix for
  // a prefix another collection has, or one the application answers itself
  // (keywords taken, reserved). A page's address may be a prefix: the page
  // at /news lists the entries at /news/<slug>.
  createCollection(definition: CollectionDefinition, options?: CallOptions): Promise<Outcome<Collection, Invalid>>;
  getCollection(collectionId: number, options?: CallOptions): Promise<Collection>;
  // Replaces the members given and checks the definition whole: a field
  // the sort follows does not go without a new sort (/sort/by, sortField),
  // nor, while the shop's settings name the collection, the price field
  // they name stop being a number field of it (/fields, or the field's
  // /type, shopPrice).
  updateCollection(collectionId: number, changes: CollectionChanges, options?: CallOptions): Promise<Outcome<Collection, Invalid>>;
  // With its entries and its template; refused while the shop's settings
  // name it, on or off (StorageError refused, code collection_in_shop).
  deleteCollection(collectionId: number, options?: CallOptions): Promise<void>;
  // The collection's entries, searched and in order (EntryQuery), or in
  // the collection's own order; an order by a key the collection cannot
  // order by is refused (StorageError refused, code invalid_query).
  listEntries(collectionId: number, query?: EntryQuery, options?: CallOptions): Promise<Entry[]>;
  // A new entry, nothing live. Invalid at each value its fields refuse
  // (/values/<key>: unknownField, required, a value's own rules and
  // schema; /title, /slug), an image the library has not (mediaExists), a
  // slug another entry has, next or live (/slug, taken).
  createEntry(collectionId: number, entry: EntryContent, options?: CallOptions): Promise<Outcome<Entry, Invalid>>;
  // An entry, not-found unless it is this collection's.
  getEntry(collectionId: number, entryId: number, options?: CallOptions): Promise<Entry>;
  // Saves title, slug and values if the entry is still at save.revision,
  // checked as a new entry's are; the same save sent again after its answer
  // was lost is answered as saved. What is live does not change.
  saveEntry(collectionId: number, entryId: number, save: EntrySave, options?: CallOptions): Promise<Outcome<Entry, Conflict | Invalid>>;
  // Puts live what the draft holds, checked again against the fields as
  // they are now; with request.revision, only if the entry is still at it.
  publishEntry(collectionId: number, entryId: number, request?: PublishRequest, options?: CallOptions): Promise<Outcome<Entry, Conflict | Invalid>>;
  // Takes it off, the draft kept; one not live is answered as it is.
  unpublishEntry(collectionId: number, entryId: number, options?: CallOptions): Promise<Entry>;
  deleteEntry(collectionId: number, entryId: number, options?: CallOptions): Promise<void>;

  // Capability shop: its settings, off by default, and the orders its
  // checkout made. Visitors check out on the site, never through the
  // storage: on the CMS at its cart's addresses, in the browser through
  // its demo's checkout (BrowserAdapter.checkoutDemo).
  getShop(options?: CallOptions): Promise<Shop>;
  // Every member, checked whole against the collections as they are (the
  // shop's rules, ../shared/shop.ts): invalid at each fault's member.
  setShop(settings: ShopSettings, options?: CallOptions): Promise<Outcome<Shop, Invalid>>;
  // The newest first.
  listOrders(options?: CallOptions): Promise<Order[]>;
  getOrder(orderId: number, options?: CallOptions): Promise<Order>;
  // An open order asked of Stripe again and kept as Stripe says it is;
  // any other answered as it is, Stripe not asked. Refused (code
  // checkout_not_set_up) when an open order cannot be asked about; when
  // Stripe could not be, an unknown outcome, nothing changed.
  refreshOrder(orderId: number, options?: CallOptions): Promise<Order>;
}

// --------------------------------------------- errors, block by block

export interface BlockFieldError {
  // The block that holds the value, by its id, or null for a value outside
  // any block (the document's title, its description).
  blockId: string | null;
  // Where the value is inside that block ("/props/alt", "/style/base/color",
  // "" for the block itself), or inside the document when blockId is null.
  field: string;
  keyword: string;
  message: string;
}

// The errors of a refused save, laid out the way the editor shows them: on
// the block, at the field. `sent` is the document that was sent, whose
// blocks the pointers name. An error whose block pointer does not lead to a
// block of that document stays on the document, at its full pointer,
// rather than being dropped.
export function errorsByBlock(sent: PageDocument, errors: readonly FieldError[], under = "/document"): BlockFieldError[] {
  return errors.map((error) => {
    const inner = stripPrefix(error.pointer, under);
    const blockPointer = error.blockPointer === null ? null : stripPrefix(error.blockPointer, under);
    const block = blockPointer === null ? undefined : resolve(sent, blockPointer);
    if (blockPointer !== null && inner !== null && isBlock(block) && (inner === blockPointer || inner.startsWith(`${blockPointer}/`))) {
      return { blockId: block.id, field: inner.slice(blockPointer.length), keyword: error.keyword, message: error.message };
    }
    return { blockId: null, field: inner ?? error.pointer, keyword: error.keyword, message: error.message };
  });
}

function stripPrefix(pointer: string, prefix: string): string | null {
  if (pointer === prefix) return "";
  return pointer.startsWith(`${prefix}/`) ? pointer.slice(prefix.length) : null;
}

function resolve(value: unknown, pointer: string): unknown {
  if (pointer === "") return value;
  let here = value;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(here) && /^(0|[1-9][0-9]*)$/.test(key)) here = here[Number(key)];
    else if (here !== null && typeof here === "object" && !Array.isArray(here) && Object.hasOwn(here, key)) here = (here as Record<string, unknown>)[key];
    else return undefined;
  }
  return here;
}

function isBlock(value: unknown): value is { id: string } {
  return value !== null && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && typeof (value as { type?: unknown }).type === "string";
}
