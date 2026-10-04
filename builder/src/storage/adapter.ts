// The storage adapter: the one way the editor reads and writes pages, their
// draft and versions, the media library, the site style and form answers.
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
import type { PageDocument } from "../shared/document.ts";

// ISO 8601, in UTC, as the server writes it ("2026-10-02T09:15:00.000Z").
export type Time = string;

// ------------------------------------------------------------- pages

export interface PageLinks {
  // The API's own addresses of the page.
  self: string;
  draft: string;
  versions: string;
  publish: string;
  schedules: string;
  // The draft as the published page would look, and the live page (null
  // before the first publish): paths on the CMS's own origin, which the
  // editor's development proxy does not forward.
  preview: string;
  live: string | null;
}

// What is live, or null before the first publish.
export interface Published {
  // The live address, which a later PATCH of the slug changes only at the
  // next publish.
  slug: string;
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
  title: string;
  // The next address: the one the next publish applies.
  slug: string;
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
  title: string;
  slug: string;
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
  pages: Array<{ id: number; title: string; slug: string }>;
  // Kept versions that show it.
  versions: Array<{ pageId: number; number: number }>;
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

export interface SiteStyle {
  // A tone for every palette slot, by colour name.
  palette: Record<string, string>;
  typeScale: string;
  // null until the style is first changed.
  updatedAt: Time | null;
  // The values each part may take: the curated tones of each slot, and the
  // type scales.
  choices: {
    palette: Record<string, ToneChoice[]>;
    typeScales: TypeScaleChoice[];
  };
}

// ------------------------------------------------------ the theme

// A link of the site's header, its address as the published page writes it.
export interface SiteLink {
  label: string;
  href: string;
}

// The theme's parts around every page: the same on every page, read only.
// The published page draws them around its sections, and the canvas draws
// them there too, locked.
export interface Site {
  // The site's name, beside its mark in the header.
  name: string;
  menu: SiteLink[];
  // The header's button; null when there is none.
  action: SiteLink | null;
  footer: { lead: string; text: string };
  // The site's time zone, an IANA name ("Europe/London"): a scheduled
  // publish is set and shown in it, the same for every visitor.
  timeZone: string;
}

// ---------------------------------------------------- form answers

// Stage 5 (forms): the shape is this interface's guess until the CMS keeps
// answers, and is fixed against its API then.
export interface FormResponse {
  id: number;
  pageId: number;
  versionNumber: number;
  submittedAt: Time;
  fields: Array<{ label: string; value: string | boolean }>;
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

export interface SiteStyleChange {
  palette: Record<string, string>;
  typeScale: string;
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

export const OPTIONAL_OPERATIONS = ["publish", "schedule", "responses"] as const;
// What an adapter may lack: publishing and serving pages (the browser demo
// only previews), scheduled publishing (stage 4), form answers (stage 5).
export type OptionalOperation = (typeof OPTIONAL_OPERATIONS)[number];

// Says which optional operations this adapter has. The editor shows no
// control for one it lacks, and the adapter refuses it, as unsupported,
// without asking anyone.
//
// And one thing the storage does or does not do on its own: imageVariants,
// whether it makes smaller copies of an uploaded image for the pages to
// serve. Without them the file is served as it was uploaded, so the editor
// resizes each image before it goes up, and its media library says so: a
// visitor's phone gets that file and no smaller one.
export type Capabilities = Readonly<Record<OptionalOperation, boolean>> & { readonly imageVariants: boolean };

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
};

// ---------------------------------------------------------- the adapter

export interface StorageAdapter {
  // A short name for messages: "rails".
  readonly name: string;
  readonly capabilities: Capabilities;

  // Pages, oldest first.
  listPages(options?: CallOptions): Promise<PageSummary[]>;
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
  // The theme's header and footer, as every page draws them.
  getSite(options?: CallOptions): Promise<Site>;

  // Capability responses (stage 5): the answers sent from a page's forms,
  // or from every page's.
  listResponses(pageId?: number, options?: CallOptions): Promise<FormResponse[]>;
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
