// The storage adapter that keeps everything in this browser, in IndexedDB:
// the editor in the browser alone, with no CMS behind it. Behind the same
// interface as the Rails adapter (./adapter.ts), so nothing else in the
// editor changes to use it, and held to the same battery (./contract.ts).
//
// What it keeps: pages with their draft and its revision, the versions
// (Save version, the automatic ones, the copy kept before a restore), a
// publish as a version and the page's published state, the media library
// with each image's bytes as a blob, and the site style. The site's header
// and footer are pages too, of their own kind, made the first time they are
// asked for from the starters the build serves. Collections and their
// entries each have a store of their own, an entry with its draft and what
// it was last published with; a collection's template is a page of its own
// kind, made with its collection. What it cannot do it says it cannot
// (capabilities): there is no server to serve a page, to publish it at a
// time, or to take a visitor's form, so links.live stays null, and
// scheduling and responses are refused as unsupported. It makes no
// smaller copies of an image either, so the editor resizes each image
// before it goes up, as it does for the CMS.
//
// It refuses what the CMS refuses, in the same shapes: the document, and
// a part's rule, by the editor's twin of the schema and the application
// rules (../shared/validate.ts), the rest by the twins of the
// CMS's own checks (./browser-rules.ts). Stored documents are brought up to
// the current schemaVersion when read and restored by the twin of the
// CMS's upgrades (../document/upgrade.ts).
//
// Two tabs of one browser share the database. A save's revision check and
// its write are one readwrite transaction, and IndexedDB runs transactions
// that touch the same stores one after the other, whichever tab they come
// from: of two saves from one revision, the second finds the revision
// moved and gets the conflict the CMS would answer with its 409.
//
// When it gives up it says why, as a sentence the editor shows: IndexedDB
// missing or refused (some private windows), the browser's storage full,
// and an upgrade of the database held up by another tab still open on an
// older version.
import {
  MAX_IMAGE_SIDE,
  MAX_UPLOAD_BYTES,
  StorageError,
  unsupported,
  type CallOptions,
  type Capabilities,
  type Collection,
  type CollectionChanges,
  type Conflict,
  type Draft,
  type DraftSave,
  type DraftSaved,
  type Entry,
  type EntryPublished,
  type EntryQuery,
  type EntrySave,
  type FieldError,
  type ImageType,
  type Invalid,
  type MediaItem,
  type NewPage,
  type NewVersion,
  type Outcome,
  type Page,
  type PageChanges,
  type PageKind,
  type PageLinks,
  type PageSummary,
  PART_KINDS,
  type PartKind,
  type Published,
  type PublishRequest,
  type RestoreResult,
  type Site,
  type SiteStyle,
  type SiteStyleChange,
  type StorageAdapter,
  type Time,
  type Upload,
  type UploadOptions,
  type Version,
  type VersionReason,
  type VersionWithDocument,
} from "./adapter.ts";
import {
  ALT_MAX_LENGTH,
  asciiLower,
  AUTO_VERSION_EVERY_MS,
  BodyCheck,
  BUILT_IN_ORDERS,
  CONTENT_TYPES,
  ENTRY_QUERY,
  fieldError,
  FILENAME_MAX_LENGTH,
  MEDIA_ID,
  mediaRefs,
  orderedBy,
  prefixReserved,
  SAVE_ID,
  sizeErrors,
  siteStyleErrors,
  slugErrors,
  sniff,
  type SortValue,
  underDocument,
  VERSION_NAME_MAX_LENGTH,
  WORDS,
} from "./browser-rules.ts";
import { systemClock, type Clock } from "./clock.ts";
import { digest } from "./digest.ts";
import { SITE_THEME } from "virtual:site-theme";
import { isObject, sameJson } from "../document/json.ts";
import { CURRENT, openDocument, upgrade, UnsupportedDocument } from "../document/upgrade.ts";
import { SORTABLE_TYPES, type CollectionDefinition, type EntryContent, type EntryValues } from "../shared/collection.ts";
import type { PageDocument } from "../shared/document.ts";
import { defaultSiteStyle, siteStyleChoices } from "../shared/site-tokens.ts";
import { isLine, pageFaults, partFaults, templateFaults, validateCollection, validateDocument, validateEntry, type DocumentError } from "../shared/validate.ts";

export const BROWSER_CAPABILITIES: Capabilities = {
  // A publish is kept as a version, with the page's published state, for
  // the editor to show the page as it went live.
  publish: true,
  // No server to publish at a time, nor to take a visitor's form.
  schedule: false,
  responses: false,
  imageVariants: false,
  // Nothing is served: there is no live address to give.
  livePages: false,
  // Collections, their entries and their templates, kept as the CMS keeps
  // them; an entry published is kept with its collection, served nowhere.
  collections: true,
};

export const DATABASE_NAME = "page-builder-cms";

// The database's layout, one step per version: LAYOUT[n] takes it from
// version n to n + 1, inside the upgrade's own transaction, and the
// database's version is the number of steps. A change of layout is a step
// added at the end, never an old one changed: a browser that already has
// version n runs only the steps after it.
export type LayoutStep = (database: IDBDatabase, transaction: IDBTransaction) => void;

export const LAYOUT: readonly LayoutStep[] = [
  (database) => {
    // Pages by id, from 1; each record holds its draft, so a save's
    // revision check and its write touch one record.
    database.createObjectStore("pages", { keyPath: "id", autoIncrement: true });
    // Versions by page and number.
    database.createObjectStore("versions", { keyPath: ["pageId", "number"] });
    // The media library in the order the items were added, found by the
    // id documents name; the bytes apart, so the list is read without
    // them.
    database.createObjectStore("media", { keyPath: "seq", autoIncrement: true }).createIndex("id", "id", { unique: true });
    database.createObjectStore("blobs", { keyPath: "id" });
    database.createObjectStore("site", { keyPath: "key" });
  },
  // Version 2: the site style's record holds the site's custom CSS. No
  // store changes; the step is there so that a tab of an editor built
  // before it, which would put the style back without the stylesheet,
  // lets go of the database (onversionchange) once this build opens it.
  () => undefined,
  // Version 3: collections and their entries, in stores of their own, an
  // entry found by its collection. A collection's template is a record of
  // pages, of its own kind, which needs no store. Every record of the
  // stores before stays as it is.
  (database) => {
    database.createObjectStore("collections", { keyPath: "id", autoIncrement: true });
    database.createObjectStore("entries", { keyPath: "id", autoIncrement: true }).createIndex("collectionId", "collectionId");
  },
];

const STORES = ["pages", "versions", "media", "blobs", "site", "collections", "entries"] as const;
type StoreName = (typeof STORES)[number];
// The stores a later step added: how the site stands (standing) leaves
// each out while it holds nothing, so a site with no collection stands as
// it stood under a build before them, and the demo's seed still knows it
// as the one it put in (./example-site.ts).
const LATER_STORES: readonly StoreName[] = ["collections", "entries"];

interface PageRecord {
  id: number;
  // A page, one of the site's parts, or a collection's template; absent,
  // as in the records a build before the parts kept, a page.
  kind?: PageKind;
  // A template's collection.
  collectionId?: number;
  createdAt: Time;
  // The latest change of the page or of its draft.
  updatedAt: Time;
  home: boolean;
  // The next address, the draft's; null for a part, which has none.
  slug: string | null;
  // The address it went live under, null before the first publish.
  liveSlug: string | null;
  draft: { document: unknown; revision: number; lastSaveId: string | null; updatedAt: Time };
  published: { versionNumber: number; draftRevision: number; publishedAt: Time } | null;
}

interface VersionRecord {
  pageId: number;
  number: number;
  reason: VersionReason;
  name: string | null;
  restoredFrom: number | null;
  createdAt: Time;
  document: unknown;
}

interface MediaRecord {
  seq?: number;
  id: string;
  alt: string;
  width: number;
  height: number;
  contentType: ImageType;
  byteSize: number;
  filename: string;
  createdAt: Time;
}

interface BlobRecord {
  id: string;
  blob: Blob;
}

// A collection: its definition, the changes a visitor could see of it, and
// its template's page.
interface CollectionRecord extends CollectionDefinition {
  id: number;
  publishedRevision: number;
  templateId: number;
  createdAt: Time;
  updatedAt: Time;
}

// An entry: its draft at its revision, and what it was last published
// with.
interface EntryRecord extends EntryContent {
  id: number;
  collectionId: number;
  revision: number;
  lastSaveId: string | null;
  createdAt: Time;
  updatedAt: Time;
  published: EntryPublished | null;
}

interface StyleRecord {
  key: "style";
  palette: Record<string, string>;
  typeScale: string;
  // Absent from a record kept before the choice existed: the default.
  letterWidth?: string;
  // Absent from a record kept before it existed: none.
  customCss?: string;
  updatedAt: Time;
}

export interface BrowserAdapterConfig {
  databaseName?: string;
  clock?: Clock;
  // The layout this build expects: LAYOUT, unless a test stands for a
  // later build with a step of its own.
  layout?: readonly LayoutStep[];
  // Where the editor shows the draft as a published page would look: an
  // address of the editor's own site, which the storage cannot know.
  previewAddress?: (pageId: number) => string;
  // A new media item's id, 16 letters and digits as the CMS makes them.
  newMediaId?: () => string;
}

// Why the browser's storage cannot be used, in the words the editor shows.
export const GIVING_UP = {
  unavailable: "This browser keeps nothing for the editor here: its storage (IndexedDB) is missing or refused, as in some private windows. Open the editor in a normal window.",
  quota: "This browser has no room left for the editor's pages and images: delete images from the library, or let this site keep more in the browser's settings.",
  blocked: "Another tab has the editor open on an older version of its storage and holds on to it: close that tab, then try again.",
  upgraded: "A newer version of the editor, open in another tab, has upgraded this browser's storage: reload this tab to go on.",
  deleted: "This browser's storage for the editor was deleted in another tab: reload this tab.",
  newer: "This browser's storage was made by a newer version of the editor: reload this tab to get it.",
} as const;

const refused = (code: string, message: string) => new StorageError({ kind: "refused", status: 0, code, message });
const notFound = () => new StorageError({ kind: "not-found", message: WORDS.notFound });
const abandoned = (what: string) => new StorageError({ kind: "unknown", cause: "timeout", status: null, message: `${what} was abandoned before it was done.` });

const domName = (error: unknown): string | null => (error instanceof DOMException || (error instanceof Error && error.name !== "Error") ? (error as Error).name : null);

// A failure of IndexedDB as the storage's refusal: the quota said as
// such, anything else as the storage failing, with the browser's words.
function storageFailure(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  if (domName(error) === "QuotaExceededError") return refused("quota_exceeded", GIVING_UP.quota);
  const said = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return refused("storage_failed", `This browser's storage failed (${said}).`);
}

function invalid(code: Invalid["code"], errors: FieldError[]): { ok: false; problem: Invalid } {
  return { ok: false, problem: { kind: "invalid", code, message: code === "invalid_document" ? WORDS.invalidDocument : WORDS.invalidRequest, errors } };
}

// A UTF-16 unit that is half of a surrogate pair with no other half: text
// that is no Unicode, which JSON written as escapes can still carry.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

// What the request would be on its way to the CMS: JSON, where a member
// given as undefined is left out and -0 is 0. And what the CMS does with
// it: its JSON parser refuses a body with a lone surrogate in any string or
// any key (json 3 raises "incomplete surrogate pair"), and the API answers
// 400, malformed_json, for the whole request. Said here as that refusal,
// before anything else about the request is looked at.
function wire<T>(value: T): T {
  const sent = JSON.parse(JSON.stringify(value)) as T;
  const stack: unknown[] = [sent];
  while (stack.length > 0) {
    const item = stack.pop();
    if (typeof item === "string") {
      if (LONE_SURROGATE.test(item)) throw new StorageError({ kind: "refused", status: 400, code: "malformed_json", message: WORDS.malformedJson });
    } else if (Array.isArray(item)) {
      stack.push(...item);
    } else if (isObject(item)) {
      for (const [key, member] of Object.entries(item)) stack.push(key, member);
    }
  }
  return sent;
}

// One IndexedDB request, as a promise. Awaited inside a transaction's
// body, the next request is made before the transaction can commit.
// How the site stands, read in `tx`, over the stores it spans (every one,
// in this build): every record of each, a picture's bytes by their size
// and type (BrowserAdapter). A store a later step added is left out while
// it holds nothing (LATER_STORES), so a site with no collection stands as
// it stood under the build before them.
export async function standing(tx: IDBTransaction): Promise<string> {
  const held: unknown[] = [];
  for (const store of STORES) {
    if (!tx.objectStoreNames.contains(store)) continue;
    const records = (await request(tx.objectStore(store).getAll())) as unknown[];
    if (LATER_STORES.includes(store) && records.length === 0) continue;
    held.push(store === "blobs" ? (records as BlobRecord[]).map((record) => [record.id, record.blob.size, record.blob.type]) : records);
  }
  return digest(JSON.stringify(held));
}

// Every store emptied, in `tx`, which spans them all.
async function emptied(tx: IDBTransaction): Promise<void> {
  for (const store of STORES) await request(tx.objectStore(store).clear());
}

function request<T>(asked: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    asked.onsuccess = () => resolve(asked.result);
    asked.onerror = () => reject(asked.error);
  });
}

function randomId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // 248 is the largest multiple of 62 below 256: the bytes above it are
  // drawn again, so every character is as likely.
  let id = "";
  for (const byte of bytes) id += byte < 248 ? alphabet[byte % 62] : "";
  return id.length === 16 ? id : id + randomId().slice(id.length);
}

// The browser's opens of one database wait in one line. An open that
// another tab holds up (an older version it does not let go of) is told
// so; an open made after it, in a third tab, only waits behind it, and the
// browser tells it nothing. So an open held up holds a lock named after
// the database (the Web Locks API) until it is through, and an open still
// waiting looks for that lock, at once and then every half second: found,
// it is held up by the same tab, says so, and holds the lock too. Closing
// the first held-up tab then still leaves the lock held, and a tab opened
// after it is told as well (the browser tells the second nothing more when
// the first goes). A browser without the API (all current ones have it)
// only waits.
const LOOK_AGAIN_MS = 500;

interface PlaceInLine {
  // This open is held up: the lock is held until it is through.
  hold(): void;
  // This open is through, either way.
  done(): void;
}

function placeInLine(name: string, heldUpAhead: () => void): PlaceInLine {
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  const lockName = `${name}: an open held up`;
  let through = false;
  let holding = false;
  let release: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stopLooking = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const hold = () => {
    stopLooking();
    if (through || holding || !locks) return;
    holding = true;
    locks
      .request(lockName, { mode: "shared" }, () => new Promise<void>((letGo) => {
        release = letGo;
        if (through) letGo();
      }))
      .catch(() => undefined);
  };
  const look = () => {
    timer = null;
    if (through || holding || !locks) return;
    locks.query().then(
      (state) => {
        if (through || holding) return;
        if (state.held?.some((lock) => lock.name === lockName)) {
          heldUpAhead();
          hold();
        } else {
          timer = setTimeout(look, LOOK_AGAIN_MS);
        }
      },
      () => undefined,
    );
  };
  look();
  return {
    hold,
    done() {
      through = true;
      stopLooking();
      release?.();
    },
  };
}

// The browser's storage, and what only it can do, for the demo to give a
// visitor a newer example site (./example-site.ts): say how the site
// stands, and let go of everything it keeps of it. The CMS keeps its own
// pages; nothing in the editor asks for this.
export interface BrowserAdapter extends StorageAdapter {
  // A digest of every record of every store, the pictures' bytes by their
  // size and type: any write through the storage changes it, a version
  // saved by name too; a read does not.
  siteFingerprint(): Promise<string>;
  // Every page, version, picture and setting of the site, gone in one
  // transaction, and the pictures' addresses with them.
  clearSite(): Promise<void>;
  // The same, only while the site stands as `fingerprint` says, read in
  // the transaction that lets go of it: a write that comes in between,
  // from another tab too, keeps the site. Says whether it let go.
  clearSiteIf(fingerprint: string): Promise<boolean>;
}

export function createBrowserAdapter(config: BrowserAdapterConfig = {}): BrowserAdapter {
  const name = config.databaseName ?? DATABASE_NAME;
  const clock = config.clock ?? systemClock;
  const layout = config.layout ?? LAYOUT;
  const previewAddress = config.previewAddress ?? ((pageId: number) => `?preview=${pageId}`);
  const newMediaId = config.newMediaId ?? randomId;
  const now = (): Time => new Date(clock.now()).toISOString();

  // ------------------------------------------------------------ database

  let opening: Promise<IDBDatabase> | null = null;
  // Set when another tab took the database away (a newer version, or
  // deleted it): this tab's next call says so, and none goes through.
  let gone: StorageError | null = null;
  // Set while this tab's open waits for another tab that holds the
  // database on an older version, held up itself or waiting behind another
  // tab's open so held up: each call is refused at once, in the same
  // words, until that tab lets go. Another open made meanwhile would only
  // wait in line behind the first, with no word of why, and go through by
  // itself once that tab is closed.
  let heldUp: StorageError | null = null;

  function database(): Promise<IDBDatabase> {
    if (gone) return Promise.reject(gone);
    if (heldUp) return Promise.reject(heldUp);
    opening ??= open().catch((error: unknown) => {
      opening = null;
      throw error;
    });
    return opening;
  }

  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const factory = (globalThis as { indexedDB?: IDBFactory | null }).indexedDB;
      if (!factory) {
        reject(refused("storage_unavailable", GIVING_UP.unavailable));
        return;
      }
      let asked: IDBOpenDBRequest;
      try {
        asked = factory.open(name, layout.length);
      } catch {
        reject(refused("storage_unavailable", GIVING_UP.unavailable));
        return;
      }
      let said = false;
      // Another tab holds the database open on an older version and does
      // not let go of it. The open waits for it; the person is told now,
      // and so is each call until that tab lets go.
      const holdUp = () => {
        if (said) return;
        said = true;
        heldUp = refused("storage_blocked", GIVING_UP.blocked);
        reject(heldUp);
      };
      // An open of a third tab, waiting behind one so held up, is held up
      // by the same tab: told nothing by the browser, it says so all the
      // same (placeInLine).
      const inLine = placeInLine(name, holdUp);
      asked.onupgradeneeded = (event) => {
        // No other tab holds the database any more: a call made from now on
        // opens it once this upgrade is done.
        heldUp = null;
        inLine.done();
        const upgrading = asked.transaction!;
        for (let version = event.oldVersion; version < layout.length; version += 1) layout[version]!(asked.result, upgrading);
      };
      asked.onblocked = () => {
        inLine.hold();
        holdUp();
      };
      asked.onsuccess = () => {
        heldUp = null;
        inLine.done();
        const opened = asked.result;
        if (said) {
          // Blocked earlier and said so: this tab's next call opens anew.
          opened.close();
          return;
        }
        said = true;
        opened.onversionchange = (event) => {
          // A newer version of the editor in another tab wants to upgrade
          // the database, or another tab deletes it: let go of it, so that
          // tab is not held up, and say so here.
          opened.close();
          opening = null;
          gone = event.newVersion === null ? refused("storage_deleted", GIVING_UP.deleted) : refused("storage_upgraded", GIVING_UP.upgraded);
        };
        // Closed by the browser (its data cleared): the next call opens
        // the database again.
        opened.onclose = () => {
          opening = null;
        };
        resolve(opened);
      };
      asked.onerror = () => {
        heldUp = null;
        inLine.done();
        if (said) return;
        said = true;
        const error = asked.error;
        if (domName(error) === "VersionError") reject(refused("storage_newer", GIVING_UP.newer));
        else if (domName(error) === "QuotaExceededError") reject(refused("quota_exceeded", GIVING_UP.quota));
        else reject(refused("storage_unavailable", GIVING_UP.unavailable));
      };
    });
  }

  // Runs body in one transaction over the stores named, and gives what it
  // gives once the transaction has committed. A throw rolls everything
  // back, and so does a refusal ({ ok: false }) of a write: as on the CMS,
  // where a refusal raised inside a write's transaction undoes it, a
  // version kept before a check that then fails is not kept. The body
  // awaits IndexedDB requests only: anything else lets the transaction
  // commit under it.
  async function transaction<T>(stores: readonly StoreName[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await database();
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (error) {
      throw gone ?? storageFailure(error);
    }
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new DOMException("The transaction was aborted.", "AbortError"));
    });
    let result: T;
    try {
      result = await body(tx);
    } catch (error) {
      done.catch(() => undefined);
      try {
        tx.abort();
      } catch {
        // Already finished or aborted by the error itself.
      }
      throw storageFailure(error);
    }
    if (mode === "readwrite" && isObject(result) && result.ok === false) {
      done.catch(() => undefined);
      // Still within the last request's turn, so the transaction has not
      // begun to commit; if it had, it would throw, which is a fault here.
      tx.abort();
      return result;
    }
    try {
      await done;
    } catch (error) {
      throw storageFailure(error);
    }
    return result;
  }

  const read = <T>(stores: readonly StoreName[], body: (tx: IDBTransaction) => Promise<T>) => transaction(stores, "readonly", body);
  const write = <T>(stores: readonly StoreName[], body: (tx: IDBTransaction) => Promise<T>) => transaction(stores, "readwrite", body);

  function checkSignal(options: CallOptions | undefined, what: string): void {
    if (options?.signal?.aborted) throw abandoned(what);
  }

  // -------------------------------------------------------------- shapes

  const links = (pageId: number): PageLinks => ({
    // There is no API in the browser: these name the page's records.
    self: `indexeddb:pages/${pageId}`,
    draft: `indexeddb:pages/${pageId}/draft`,
    versions: `indexeddb:pages/${pageId}/versions`,
    publish: `indexeddb:pages/${pageId}/publish`,
    schedules: `indexeddb:pages/${pageId}/schedules`,
    preview: previewAddress(pageId),
    live: null,
  });

  const titleOf = (record: PageRecord): string => {
    const title = isObject(record.draft.document) ? record.draft.document.title : undefined;
    return typeof title === "string" ? title : "";
  };

  const kindOf = (record: PageRecord): PageKind => record.kind ?? "page";

  const publishedOf = (record: PageRecord): Published | null =>
    record.published === null ? null : { slug: kindOf(record) === "page" ? (record.liveSlug ?? record.slug) : null, versionNumber: record.published.versionNumber, draftRevision: record.published.draftRevision, publishedAt: record.published.publishedAt };

  // A stored document brought up to the current schemaVersion, as the CMS
  // answers one; a document of a version this build does not know is
  // refused with the upgrade's words.
  function upgraded(document: unknown): PageDocument {
    try {
      return upgrade(document) as PageDocument;
    } catch (error) {
      if (error instanceof UnsupportedDocument) throw refused("unsupported_document", error.message);
      throw error;
    }
  }

  // A stored document upgraded and checked again, as what a version made
  // from it holds (Draft.upgrade_and_check): a part's by a part's rule
  // too, as its saves are.
  function checked(record: PageRecord, document: unknown): Outcome<PageDocument, Invalid> {
    const opened = openDocument(document);
    if (!opened.ok) return invalid("invalid_document", opened.errors.map(underDocument));
    return partRefusal(record, opened.document) ?? { ok: true, value: opened.document };
  }

  // A part's own rules (SiteParts.check): no form, refused at each form
  // block, no section anchor, refused at each anchor, and no Field block;
  // a template's (CollectionTemplate.check): no form; and a page's
  // (PageRules.check): no Field block, which only a template holds.
  function partRefusal(record: PageRecord, document: PageDocument): { ok: false; problem: Invalid } | null {
    const kind = kindOf(record);
    const faults = kind === "page" ? pageFaults(document) : kind === "template" ? templateFaults(document) : partFaults(document);
    return faults.length > 0 ? invalid("invalid_document", faults.map(underDocument)) : null;
  }

  const draftOf = (record: PageRecord): Draft => ({ revision: record.draft.revision, lastSaveId: record.draft.lastSaveId, updatedAt: record.draft.updatedAt, document: upgraded(record.draft.document) });

  const savedOf = (record: PageRecord): DraftSaved => ({ revision: record.draft.revision, lastSaveId: record.draft.lastSaveId, updatedAt: record.draft.updatedAt });

  const pageOf = (record: PageRecord): Page => ({
    page: { id: record.id, kind: kindOf(record), title: titleOf(record), slug: record.slug, home: record.home, createdAt: record.createdAt },
    draft: draftOf(record),
    published: publishedOf(record),
    scheduled: null,
    links: links(record.id),
  });

  const summaryOf = (record: PageRecord): PageSummary => ({
    id: record.id,
    kind: kindOf(record),
    title: titleOf(record),
    slug: record.slug,
    home: record.home,
    revision: record.draft.revision,
    updatedAt: record.updatedAt,
    published: publishedOf(record),
    scheduled: null,
    links: links(record.id),
  });

  const entryOf = (record: EntryRecord): Entry => ({
    id: record.id,
    collectionId: record.collectionId,
    title: record.title,
    slug: record.slug,
    values: record.values,
    revision: record.revision,
    lastSaveId: record.lastSaveId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    published: record.published,
  });

  const definitionOf = (record: CollectionRecord): CollectionDefinition => ({ name: record.name, prefix: record.prefix, fields: record.fields, sort: record.sort });

  // A refusal of the collection's checks (../shared/validate.ts), as the
  // CMS's 422 lists them.
  const refusedBy = (errors: readonly DocumentError[]) => invalid("invalid_request", errors.map((e) => fieldError(e.pointer, e.keyword, e.message)));

  const entryConflict = (record: EntryRecord): { ok: false; problem: Conflict } =>
    ({ ok: false, problem: { kind: "conflict", message: WORDS.entryConflict, currentRevision: record.revision, lastSaveId: record.lastSaveId } });

  // The value an entry is ordered by, as the CMS reads it
  // (EntriesController#sort_value): a field's only when it is of its
  // field's type, a date's text or a number.
  const sortValueOf = (entry: EntryRecord, key: string, type: string | undefined): SortValue => {
    if (key === "title") return entry.title;
    if (key === "updatedAt") return entry.updatedAt;
    if (key === "createdAt") return entry.createdAt;
    if (key === "publishedAt") return entry.published?.publishedAt ?? null;
    const found: unknown = entry.values[key];
    if (type === "date" && typeof found === "string") return found;
    if (type === "number" && typeof found === "number") return found;
    return null;
  };

  const versionOf = (record: VersionRecord, page: PageRecord): Version => ({
    number: record.number,
    reason: record.reason,
    name: record.name,
    restoredFrom: record.restoredFrom,
    createdAt: record.createdAt,
    published: page.published?.versionNumber === record.number,
  });

  // ------------------------------------------------- object URLs, by item

  // Each image's address in this tab: an object URL of its blob, made the
  // first time the item is given out and the same after, so the canvas
  // and the library name one address. It is revoked when the item goes:
  // deleted here, or found gone when the library is read again (deleted
  // in another tab). Nothing can show an image the library no longer has.
  const addresses = new Map<string, string>();

  function addressOf(id: string, blob: Blob): string {
    let address = addresses.get(id);
    if (address === undefined) {
      address = URL.createObjectURL(blob);
      addresses.set(id, address);
    }
    return address;
  }

  function forget(id: string): void {
    const address = addresses.get(id);
    if (address === undefined) return;
    URL.revokeObjectURL(address);
    addresses.delete(id);
  }

  const itemOf = (record: MediaRecord, blob: Blob): MediaItem => ({
    id: record.id,
    alt: record.alt,
    width: record.width,
    height: record.height,
    contentType: record.contentType,
    byteSize: record.byteSize,
    filename: record.filename,
    url: addressOf(record.id, blob),
    createdAt: record.createdAt,
  });

  // ---------------------------------------------- inside a transaction

  async function pageIn(tx: IDBTransaction, pageId: number): Promise<PageRecord> {
    if (!Number.isSafeInteger(pageId) || pageId < 1) throw notFound();
    const record = (await request(tx.objectStore("pages").get(pageId))) as PageRecord | undefined;
    if (!record) throw notFound();
    return record;
  }

  const versionRange = (pageId: number) => IDBKeyRange.bound([pageId, 0], [pageId, Infinity]);

  async function versionsIn(tx: IDBTransaction, pageId: number): Promise<VersionRecord[]> {
    return (await request(tx.objectStore("versions").getAll(versionRange(pageId)))) as VersionRecord[];
  }

  async function newestIn(tx: IDBTransaction, pageId: number): Promise<VersionRecord | null> {
    const cursor = await request(tx.objectStore("versions").openCursor(versionRange(pageId), "prev"));
    return cursor ? (cursor.value as VersionRecord) : null;
  }

  // The media a document names, each checked to be in the library:
  // MediaUsage's refusal of an image that names a missing item.
  async function missingMedia(tx: IDBTransaction, document: unknown): Promise<FieldError[]> {
    const index = tx.objectStore("media").index("id");
    const errors: FieldError[] = [];
    for (const [pointer, id] of mediaRefs(document)) {
      if ((await request(index.getKey(id))) === undefined) errors.push(underDocument({ pointer, keyword: "mediaExists", message: WORDS.mediaMissing(id) }));
    }
    return errors;
  }

  // The next version of a page (its highest number plus one), after the
  // media it names are found in the library.
  async function recordVersion(tx: IDBTransaction, pageId: number, document: PageDocument, reason: VersionReason, at: Time, extra: { name?: string | null; restoredFrom?: number | null } = {}): Promise<Outcome<VersionRecord, Invalid>> {
    const missing = await missingMedia(tx, document);
    if (missing.length > 0) return invalid("invalid_document", missing);
    const newest = await newestIn(tx, pageId);
    const record: VersionRecord = { pageId, number: (newest?.number ?? 0) + 1, reason, name: extra.name ?? null, restoredFrom: extra.restoredFrom ?? null, createdAt: at, document };
    await request(tx.objectStore("versions").add(record));
    return { ok: true, value: record };
  }

  // Whether another page has the address as its next one, or as the one
  // it is live under, or a collection as its prefix: the draft's
  // uniqueness rules, in the order the CMS checks them. `tx` spans pages
  // and collections.
  async function addressTaken(tx: IDBTransaction, slug: string, pageId: number | null): Promise<FieldError[]> {
    const pages = (await request(tx.objectStore("pages").getAll())) as PageRecord[];
    const others = pages.filter((page) => page.id !== pageId);
    if (others.some((page) => page.slug === slug)) return [fieldError("/slug", "taken", WORDS.nextAddressTaken)];
    if (others.some((page) => page.liveSlug === slug)) return [fieldError("/slug", "taken", WORDS.liveAddressTaken)];
    const collections = (await request(tx.objectStore("collections").getAll())) as CollectionRecord[];
    if (collections.some((collection) => collection.prefix === slug)) return [fieldError("/slug", "taken", WORDS.slugIsPrefix)];
    return [];
  }

  // Whether a prefix is another collection's, reserved, or a page's
  // address, next or live: Collection's checks, the first that fails, in
  // their order. `tx` spans pages and collections.
  async function prefixTaken(tx: IDBTransaction, prefix: string, collectionId: number | null): Promise<FieldError[]> {
    const collections = (await request(tx.objectStore("collections").getAll())) as CollectionRecord[];
    if (collections.some((collection) => collection.id !== collectionId && collection.prefix === prefix)) return [fieldError("/prefix", "taken", WORDS.prefixTaken)];
    const reserved = prefixReserved(prefix);
    if (reserved.length > 0) return reserved;
    const pages = (await request(tx.objectStore("pages").getAll())) as PageRecord[];
    if (pages.some((page) => page.slug === prefix || page.liveSlug === prefix)) return [fieldError("/prefix", "taken", WORDS.prefixIsPage)];
    return [];
  }

  // The images an entry's values name, each checked to be in the library,
  // at its value's pointer: MediaUsage.index_entry!'s refusal.
  async function missingEntryMedia(tx: IDBTransaction, values: EntryValues): Promise<FieldError[]> {
    const index = tx.objectStore("media").index("id");
    const errors: FieldError[] = [];
    for (const [pointer, id] of mediaRefs(values)) {
      if ((await request(index.getKey(id))) === undefined) errors.push(fieldError(`/values${pointer}`, "mediaExists", WORDS.mediaMissing(id)));
    }
    return errors;
  }

  // Entry's slug rules in its collection: no other entry's next address,
  // nor its live one.
  async function entrySlugTaken(tx: IDBTransaction, collectionId: number, slug: string, entryId: number | null): Promise<FieldError[]> {
    const others = (await entriesIn(tx, collectionId)).filter((entry) => entry.id !== entryId);
    if (others.some((entry) => entry.slug === slug)) return [fieldError("/slug", "taken", WORDS.entryNextAddressTaken)];
    if (others.some((entry) => entry.published?.slug === slug)) return [fieldError("/slug", "taken", WORDS.entryAddressTaken)];
    return [];
  }

  async function collectionIn(tx: IDBTransaction, collectionId: number): Promise<CollectionRecord> {
    if (!Number.isSafeInteger(collectionId) || collectionId < 1) throw notFound();
    const record = (await request(tx.objectStore("collections").get(collectionId))) as CollectionRecord | undefined;
    if (!record) throw notFound();
    return record;
  }

  async function entriesIn(tx: IDBTransaction, collectionId: number): Promise<EntryRecord[]> {
    return (await request(tx.objectStore("entries").index("collectionId").getAll(collectionId))) as EntryRecord[];
  }

  // An entry, found only under its own collection.
  async function entryIn(tx: IDBTransaction, collection: CollectionRecord, entryId: number): Promise<EntryRecord> {
    if (!Number.isSafeInteger(entryId) || entryId < 1) throw notFound();
    const record = (await request(tx.objectStore("entries").get(entryId))) as EntryRecord | undefined;
    if (!record || record.collectionId !== collection.id) throw notFound();
    return record;
  }

  // The collection as the CMS answers it, with its entries counted and its
  // template summarised. `tx` spans pages and entries.
  async function collectionOf(tx: IDBTransaction, record: CollectionRecord): Promise<Collection> {
    const template = await pageIn(tx, record.templateId);
    const entries = await entriesIn(tx, record.id);
    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      fields: record.fields,
      sort: record.sort,
      publishedRevision: record.publishedRevision,
      entryCount: entries.length,
      publishedCount: entries.filter((entry) => entry.published !== null).length,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      template: summaryOf(template),
    };
  }

  // One more change a visitor could see of the collection.
  async function advance(tx: IDBTransaction, record: CollectionRecord): Promise<void> {
    await request(tx.objectStore("collections").put({ ...record, publishedRevision: record.publishedRevision + 1 } satisfies CollectionRecord));
  }

  // --------------------------------------------------------- the adapter

  const adapter: BrowserAdapter = {
    name: "browser",
    capabilities: BROWSER_CAPABILITIES,

    async listPages(options) {
      checkSignal(options, "Reading the pages");
      return read(["pages"], async (tx) => ((await request(tx.objectStore("pages").getAll())) as PageRecord[]).filter((record) => kindOf(record) === "page").sort((a, b) => a.id - b.id).map(summaryOf));
    },

    // As the CMS's GET /api/pages makes them (Page.part!): a part not here
    // yet is made, in the same transaction that looks for it, with the
    // starter the build serves as its draft and nothing published, so two
    // tabs asking at once make one each of none.
    async listParts(options) {
      checkSignal(options, "Reading the header and footer");
      return write(["pages"], async (tx) => {
        const store = tx.objectStore("pages");
        const records = (await request(store.getAll())) as PageRecord[];
        const parts: PageSummary[] = [];
        for (const kind of PART_KINDS) {
          let record = records.find((r) => kindOf(r) === kind);
          if (!record) {
            const at = now();
            const made: Omit<PageRecord, "id"> = { kind, createdAt: at, updatedAt: at, home: false, slug: null, liveSlug: null, draft: { document: structuredClone(SITE_THEME.parts[kind as PartKind]), revision: 0, lastSaveId: null, updatedAt: at }, published: null };
            record = { ...made, id: (await request(store.add(made))) as number };
          }
          parts.push(summaryOf(record));
        }
        return parts;
      });
    },

    async createPage(page: NewPage, options) {
      checkSignal(options, "Making the page");
      const body = wire({ title: page.title, slug: page.slug }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.required("title");
      check.string("slug", { required: true });
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      // The title is the document's: a new page is an empty document
      // holding it, checked as any document is.
      const made = validateDocument({ schemaVersion: CURRENT, title: body.title, sections: [] });
      if (!made.valid) return invalid("invalid_request", unique(made.errors).map((e) => fieldError(e.pointer, e.keyword, e.message)));
      const slug = body.slug as string;
      const wrong = slugErrors(slug);
      if (wrong.length > 0) return invalid("invalid_request", wrong);
      return write(["pages", "collections"], async (tx): Promise<Outcome<Page, Invalid>> => {
        const taken = await addressTaken(tx, slug, null);
        if (taken.length > 0) return invalid("invalid_request", taken);
        const at = now();
        const record: Omit<PageRecord, "id"> = {
          createdAt: at,
          updatedAt: at,
          home: false,
          slug,
          liveSlug: null,
          draft: { document: made.document, revision: 0, lastSaveId: null, updatedAt: at },
          published: null,
        };
        const id = (await request(tx.objectStore("pages").add(record))) as number;
        return { ok: true, value: pageOf({ ...record, id }) };
      });
    },

    async getPage(pageId, options) {
      checkSignal(options, "Reading the page");
      return pageOf(await read(["pages"], (tx) => pageIn(tx, pageId)));
    },

    async updatePage(pageId, changes: PageChanges, options) {
      checkSignal(options, "Changing the page");
      const body = wire({ slug: changes.slug, home: changes.home }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.anyOf("slug", "home");
      check.string("slug");
      check.boolean("home");
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      return write(["pages", "collections"], async (tx): Promise<Outcome<Page, Invalid>> => {
        const record = await pageIn(tx, pageId);
        // A part or a template has no address and is never home: refused at
        // the member sent, as the CMS refuses it.
        const kind = kindOf(record);
        if (kind !== "page") {
          const template = kind === "template";
          return invalid("invalid_request", [fieldError(body.slug !== undefined ? "/slug" : "/home", template ? "template" : "part", template ? WORDS.templateNoAddress : WORDS.partNoAddress)]);
        }
        const pages = tx.objectStore("pages");
        const at = now();
        if (typeof body.slug === "string" && body.slug !== record.slug) {
          const wrong = slugErrors(body.slug);
          const errors = wrong.length > 0 ? wrong : await addressTaken(tx, body.slug, pageId);
          if (errors.length > 0) return invalid("invalid_request", errors);
          record.slug = body.slug;
          record.draft.updatedAt = at;
          record.updatedAt = at;
        }
        if (body.home === true) {
          // One home page: the one that was home stops being it, first.
          for (const other of (await request(pages.getAll())) as PageRecord[]) {
            if (other.id !== pageId && other.home) await request(pages.put({ ...other, home: false, updatedAt: at }));
          }
          record.home = true;
          record.updatedAt = at;
        } else if (body.home === false) {
          record.home = false;
          record.updatedAt = at;
        }
        await request(pages.put(record));
        return { ok: true, value: pageOf(record) };
      });
    },

    async getDraft(pageId, options) {
      checkSignal(options, "Reading the draft");
      return draftOf(await read(["pages"], (tx) => pageIn(tx, pageId)));
    },

    async saveDraft(pageId, save: DraftSave, options) {
      checkSignal(options, "The save");
      const body = wire({ revision: save.revision, document: save.document, saveId: save.saveId }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.integer("revision", { required: true, minimum: 0 });
      check.string("saveId", { required: true, pattern: SAVE_ID });
      check.required("document");
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      const result = validateDocument(body.document);
      if (!result.valid) return invalid("invalid_document", unique(result.errors).map(underDocument));
      const document = result.document;
      const revision = body.revision as number;
      const saveId = body.saveId as string;
      return write(["pages", "versions", "media"], async (tx) => {
        const record = await pageIn(tx, pageId);
        if (record.draft.revision !== revision) {
          // The same save sent again after its answer was lost is the save
          // that took the draft to its revision now: answered as saved.
          if (record.draft.lastSaveId === saveId && record.draft.revision === revision + 1 && sameJson(record.draft.document, document)) {
            return { ok: true as const, value: savedOf(record) };
          }
          return { ok: false as const, problem: { kind: "conflict" as const, message: WORDS.conflict, currentRevision: record.draft.revision, lastSaveId: record.draft.lastSaveId } };
        }
        // A part holds no form, after a page's checks.
        const refused = partRefusal(record, document);
        if (refused) return refused;
        const missing = await missingMedia(tx, document);
        if (missing.length > 0) return invalid("invalid_document", missing);
        const at = now();
        record.draft = { document, revision: revision + 1, lastSaveId: saveId, updatedAt: at };
        record.updatedAt = at;
        await request(tx.objectStore("pages").put(record));
        // An automatic version, unless the page has a version of any kind
        // from the last ten minutes.
        const latest = (await versionsIn(tx, pageId)).reduce<string | null>((max, v) => (max === null || v.createdAt > max ? v.createdAt : max), null);
        if (latest === null || Date.parse(latest) <= Date.parse(at) - AUTO_VERSION_EVERY_MS) {
          const kept = await recordVersion(tx, pageId, document, "auto", at);
          if (!kept.ok) return kept;
        }
        return { ok: true as const, value: savedOf(record) };
      });
    },

    async publish(pageId, request_: PublishRequest = {}, options) {
      checkSignal(options, "The publish");
      const body = wire({ revision: request_.revision }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.integer("revision", { minimum: 0 });
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      return write(["pages", "versions", "media"], async (tx) => {
        const record = await pageIn(tx, pageId);
        if (typeof body.revision === "number" && body.revision !== record.draft.revision) {
          return { ok: false as const, problem: { kind: "conflict" as const, message: WORDS.conflict, currentRevision: record.draft.revision, lastSaveId: record.draft.lastSaveId } };
        }
        const document = checked(record, record.draft.document);
        if (!document.ok) return document;
        const at = now();
        const version = await recordVersion(tx, pageId, document.value, "publish", at);
        if (!version.ok) return version;
        const before = record.published?.publishedAt ?? null;
        record.liveSlug = record.slug;
        // Never earlier than the last publish, even if the clock went back.
        record.published = { versionNumber: version.value.number, draftRevision: record.draft.revision, publishedAt: before !== null && before > at ? before : at };
        record.updatedAt = at;
        await request(tx.objectStore("pages").put(record));
        return { ok: true as const, value: { published: publishedOf(record)!, version: versionOf(version.value, record), links: links(record.id) } };
      });
    },

    async schedulePublish() {
      throw unsupported("schedule", "browser");
    },
    async cancelScheduledPublish() {
      throw unsupported("schedule", "browser");
    },
    async listSchedules() {
      throw unsupported("schedule", "browser");
    },

    async listVersions(pageId, options) {
      checkSignal(options, "Reading the versions");
      return read(["pages", "versions"], async (tx) => {
        const page = await pageIn(tx, pageId);
        return (await versionsIn(tx, pageId)).sort((a, b) => b.number - a.number).map((v) => versionOf(v, page));
      });
    },

    async getVersion(pageId, number, options) {
      checkSignal(options, "Reading the version");
      return read(["pages", "versions"], async (tx): Promise<VersionWithDocument> => {
        const page = await pageIn(tx, pageId);
        if (!Number.isSafeInteger(number) || number < 1) throw notFound();
        const record = (await request(tx.objectStore("versions").get([pageId, number]))) as VersionRecord | undefined;
        if (!record) throw notFound();
        return { ...versionOf(record, page), document: upgraded(record.document) };
      });
    },

    async saveVersion(pageId, request_: NewVersion = {}, options) {
      checkSignal(options, "Keeping the version");
      const body = wire({ name: request_.name }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.string("name");
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      const name = typeof body.name === "string" ? body.name : null;
      return write(["pages", "versions", "media"], async (tx): Promise<Outcome<Version, Invalid>> => {
        const page = await pageIn(tx, pageId);
        const document = checked(page, page.draft.document);
        if (!document.ok) return document;
        if (name !== null && !isLine(name, VERSION_NAME_MAX_LENGTH)) return invalid("invalid_request", [fieldError("/name", "invalid", WORDS.versionName)]);
        const version = await recordVersion(tx, pageId, document.value, "manual", now(), { name });
        return version.ok ? { ok: true, value: versionOf(version.value, page) } : version;
      });
    },

    async restoreVersion(pageId, number, options) {
      checkSignal(options, "The restore");
      return write(["pages", "versions", "media"], async (tx): Promise<Outcome<RestoreResult, Invalid>> => {
        const page = await pageIn(tx, pageId);
        const source = Number.isSafeInteger(number) && number >= 1 ? ((await request(tx.objectStore("versions").get([pageId, number]))) as VersionRecord | undefined) : undefined;
        if (!source) throw notFound();
        const current = checked(page, page.draft.document);
        if (!current.ok) return current;
        const at = now();
        // The draft as it is now is kept first, so the edits a restore
        // replaces can be had back; unless it is the newest version
        // already, and nothing would be lost.
        const newest = await newestIn(tx, pageId);
        let kept: VersionRecord | null = null;
        if (!newest || !sameJson(newest.document, current.value)) {
          const made = await recordVersion(tx, pageId, current.value, "before-restore", at);
          if (!made.ok) return made;
          kept = made.value;
        }
        const restored = checked(page, source.document);
        if (!restored.ok) return restored;
        const missing = await missingMedia(tx, restored.value);
        if (missing.length > 0) return invalid("invalid_document", missing);
        // A restore counts as a save, and a save from before it is a
        // conflict: no save id is the last one any more.
        page.draft = { document: restored.value, revision: page.draft.revision + 1, lastSaveId: null, updatedAt: at };
        page.updatedAt = at;
        await request(tx.objectStore("pages").put(page));
        const version = await recordVersion(tx, pageId, restored.value, "restore", at, { restoredFrom: source.number });
        if (!version.ok) return version;
        return { ok: true, value: { draft: draftOf(page), version: versionOf(version.value, page), kept: kept && versionOf(kept, page) } };
      });
    },

    async listMedia(options) {
      checkSignal(options, "Reading the library");
      const items = await read(["media", "blobs"], async (tx) => {
        const records = (await request(tx.objectStore("media").getAll())) as MediaRecord[];
        const blobs = new Map(((await request(tx.objectStore("blobs").getAll())) as BlobRecord[]).map((b) => [b.id, b.blob]));
        return records.map((record) => ({ record, blob: blobs.get(record.id) }));
      });
      // An item deleted in another tab lets go of its address here.
      const present = new Set(items.map((item) => item.record.id));
      // (A Map deleted from while it is walked goes on with what is left.)
      for (const id of addresses.keys()) if (!present.has(id)) forget(id);
      // Newest first, as the CMS orders them: by when, then by which came
      // last.
      return items
        .filter((item): item is { record: MediaRecord; blob: Blob } => item.blob !== undefined)
        .sort((a, b) => (a.record.createdAt === b.record.createdAt ? (b.record.seq ?? 0) - (a.record.seq ?? 0) : a.record.createdAt < b.record.createdAt ? 1 : -1))
        .map(({ record, blob }) => itemOf(record, blob));
    },

    async uploadMedia(upload: Upload, options?: UploadOptions) {
      const what = `The upload of "${upload.file.name}"`;
      checkSignal(options, what);
      const file = upload.file;
      // First what the CMS refuses before any byte is sent: the name's
      // length, the size, the type. (A File's name is text the browser has
      // made whole: a lone surrogate cannot be in it, so the name is not
      // looked at as the request bodies are, in wire.)
      const blobCheck = new BodyCheck({ filename: file.name, byte_size: file.size }, "/file");
      blobCheck.string("filename", { required: true, maxLength: FILENAME_MAX_LENGTH });
      blobCheck.integer("byte_size", { required: true, minimum: 1, maximum: MAX_UPLOAD_BYTES });
      const early = blobCheck.errors.map((e) => ({ ...e, pointer: "/file" }));
      if (early.length > 0) return invalid("invalid_request", early);
      if (!(CONTENT_TYPES as readonly string[]).includes(file.type)) return invalid("invalid_request", [fieldError("/file", "enum", WORDS.contentTypes)]);
      // Then the item: its size in pixels, its alt text, and bytes that
      // are the image they claim to be.
      const body = wire({ width: upload.width, height: upload.height, alt: upload.alt }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.integer("width", { required: true });
      check.integer("height", { required: true });
      check.string("alt");
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      let bytes: ArrayBuffer;
      try {
        bytes = await file.arrayBuffer();
      } catch {
        throw refused("unreadable_file", `The file "${file.name}" could not be read.`);
      }
      options?.onProgress?.(0, bytes.byteLength);
      const alt = typeof body.alt === "string" ? body.alt : "";
      // Active Storage, given the bytes, takes the type they are over the
      // one declared, and the CMS then holds the bytes to it: an image of
      // another allowed type is kept as that type; bytes of none of them
      // are refused as not the image they claim to be. (Active Storage
      // knows more kinds of file than these four, so a picture of a kind
      // the CMS refuses is refused there as not allowed, here as not what
      // it claims: refused at /file either way.)
      const sniffed = sniff(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
      const type = sniffed ?? (file.type as ImageType);
      const errors = sizeErrors(body.width as number, body.height as number, MAX_IMAGE_SIDE);
      if (alt !== "" && !isLine(alt, ALT_MAX_LENGTH)) errors.push(fieldError("/alt", "invalid", WORDS.alt));
      if (sniffed === null) errors.push(fieldError("/file", "contentMismatch", WORDS.contentMismatch(type)));
      if (errors.length > 0) return invalid("invalid_request", errors);
      checkSignal(options, what);
      const blob = new Blob([bytes], { type });
      const record = await write(["media", "blobs"], async (tx) => {
        const index = tx.objectStore("media").index("id");
        let id = newMediaId();
        while ((await request(index.getKey(id))) !== undefined) id = newMediaId();
        const made: MediaRecord = { id, alt, width: body.width as number, height: body.height as number, contentType: type, byteSize: bytes.byteLength, filename: file.name, createdAt: now() };
        made.seq = (await request(tx.objectStore("media").add(made))) as number;
        await request(tx.objectStore("blobs").put({ id, blob } satisfies BlobRecord));
        return made;
      });
      options?.onProgress?.(bytes.byteLength, bytes.byteLength);
      return { ok: true, value: itemOf(record, blob) };
    },

    async setMediaAlt(mediaId, alt, options) {
      checkSignal(options, "Changing the alt text");
      const body = wire({ alt }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.string("alt", { required: true });
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      return write(["media", "blobs"], async (tx): Promise<Outcome<MediaItem, Invalid>> => {
        if (!MEDIA_ID.test(mediaId)) throw notFound();
        const media = tx.objectStore("media");
        const record = (await request(media.index("id").get(mediaId))) as MediaRecord | undefined;
        const stored = (await request(tx.objectStore("blobs").get(mediaId))) as BlobRecord | undefined;
        if (!record || !stored) throw notFound();
        const text = body.alt as string;
        if (text !== "" && !isLine(text, ALT_MAX_LENGTH)) return invalid("invalid_request", [fieldError("/alt", "invalid", WORDS.alt)]);
        record.alt = text;
        await request(media.put(record));
        return { ok: true, value: itemOf(record, stored.blob) };
      });
    },

    async deleteMedia(mediaId, options) {
      checkSignal(options, "The delete");
      const outcome = await write(["pages", "versions", "media", "blobs", "entries"], async (tx) => {
        if (!MEDIA_ID.test(mediaId)) throw notFound();
        const media = tx.objectStore("media");
        const seq = (await request(media.index("id").getKey(mediaId))) as number | undefined;
        if (seq === undefined) throw notFound();
        // Who still shows it: a draft, a kept version, or an entry, by its
        // draft or by what is live of it.
        const uses = (document: unknown) => mediaRefs(document).some(([, id]) => id === mediaId);
        const pages = ((await request(tx.objectStore("pages").getAll())) as PageRecord[]).filter((page) => uses(page.draft.document)).sort((a, b) => a.id - b.id);
        const versions = ((await request(tx.objectStore("versions").getAll())) as VersionRecord[]).filter((version) => uses(version.document)).sort((a, b) => a.pageId - b.pageId || a.number - b.number);
        const entries = ((await request(tx.objectStore("entries").getAll())) as EntryRecord[])
          .filter((entry) => uses(entry.values) || (entry.published !== null && uses(entry.published.values)))
          .sort((a, b) => a.collectionId - b.collectionId || a.id - b.id);
        if (pages.length > 0 || versions.length > 0 || entries.length > 0) {
          return {
            ok: false as const,
            problem: {
              kind: "in-use" as const,
              message: WORDS.inUse,
              usedBy: {
                pages: pages.map((page) => ({ id: page.id, title: titleOf(page), slug: page.slug })),
                versions: versions.map((v) => ({ pageId: v.pageId, number: v.number })),
                entries: entries.map((entry) => ({ collectionId: entry.collectionId, id: entry.id, title: entry.title })),
              },
            },
          };
        }
        // The item and its bytes go together, or neither does.
        await request(media.delete(seq));
        await request(tx.objectStore("blobs").delete(mediaId));
        return { ok: true as const, value: null };
      });
      if (outcome.ok) forget(mediaId);
      return outcome;
    },

    async getSiteStyle(options) {
      checkSignal(options, "Reading the site style");
      const stored = await read(["site"], async (tx) => (await request(tx.objectStore("site").get("style"))) as StyleRecord | undefined);
      return styleOf(stored ?? null);
    },

    async setSiteStyle(style: SiteStyleChange, options) {
      checkSignal(options, "Changing the site style");
      const body = wire({ palette: style.palette, typeScale: style.typeScale, letterWidth: style.letterWidth, customCss: style.customCss }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.object("palette", { required: true });
      check.string("typeScale", { required: true });
      check.string("letterWidth");
      check.string("customCss");
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      const choices = siteStyleChoices();
      const slots = Object.fromEntries(Object.entries(choices.palette).map(([slot, tones]) => [slot, tones.map((tone) => tone.color)]));
      const errors = siteStyleErrors(body.palette as Record<string, unknown>, body.typeScale, slots, choices.typeScales.map((scale) => scale.name), body.letterWidth, choices.letterWidths.map((width) => width.name), body.customCss);
      if (errors.length > 0) return invalid("invalid_request", errors);
      return write(["site"], async (tx): Promise<Outcome<SiteStyle, Invalid>> => {
        const site = tx.objectStore("site");
        const stored = (await request(site.get("style"))) as StyleRecord | undefined;
        const palette = body.palette as Record<string, string>;
        const typeScale = body.typeScale as string;
        // Without a letter width or custom CSS the style keeps its own.
        const letterWidth = (body.letterWidth as string | undefined) ?? styleOf(stored ?? null).letterWidth;
        const customCss = (body.customCss as string | undefined) ?? styleOf(stored ?? null).customCss;
        // A change that changes nothing keeps its time, as a record saved
        // unchanged keeps its updated_at.
        if (stored && sameJson(stored.palette, palette) && stored.typeScale === typeScale && styleOf(stored).letterWidth === letterWidth && styleOf(stored).customCss === customCss) return { ok: true, value: styleOf(stored) };
        const record: StyleRecord = { key: "style", palette, typeScale, letterWidth, customCss, updatedAt: now() };
        await request(site.put(record));
        return { ok: true, value: styleOf(record) };
      });
    },

    // The site's time zone, as the build serves it from the file the CMS
    // reads.
    async getSite(options) {
      checkSignal(options, "Reading the site");
      const site: Site = { timeZone: SITE_THEME.timeZone };
      return site;
    },

    async listResponses() {
      throw unsupported("responses", "browser");
    },
    async getResponse() {
      throw unsupported("responses", "browser");
    },
    async deleteResponse() {
      throw unsupported("responses", "browser");
    },

    // ---------------------------------------------------- collections

    async listCollections(options) {
      checkSignal(options, "Reading the collections");
      return read(["collections", "pages", "entries"], async (tx) => {
        const records = ((await request(tx.objectStore("collections").getAll())) as CollectionRecord[]).sort((a, b) => a.id - b.id);
        const collections: Collection[] = [];
        for (const record of records) collections.push(await collectionOf(tx, record));
        return collections;
      });
    },

    // As the CMS makes one (Collection.create_with_template!): the
    // definition checked whole, then its prefix; the template made with it,
    // an empty document with its name, in the same transaction.
    async createCollection(definition: CollectionDefinition, options) {
      checkSignal(options, "Making the collection");
      const body = wire({ name: definition.name, prefix: definition.prefix, fields: definition.fields, sort: definition.sort });
      const checked = validateCollection(body);
      if (!checked.valid) return refusedBy(checked.errors);
      const made = checked.value;
      return write(["collections", "pages", "entries"], async (tx): Promise<Outcome<Collection, Invalid>> => {
        const taken = await prefixTaken(tx, made.prefix, null);
        if (taken.length > 0) return invalid("invalid_request", taken);
        const at = now();
        const collection: Omit<CollectionRecord, "id"> = { ...made, publishedRevision: 0, templateId: 0, createdAt: at, updatedAt: at };
        const id = (await request(tx.objectStore("collections").add(collection))) as number;
        const template: Omit<PageRecord, "id"> = {
          kind: "template", collectionId: id, createdAt: at, updatedAt: at, home: false, slug: null, liveSlug: null,
          draft: { document: { schemaVersion: CURRENT, title: made.name, sections: [] }, revision: 0, lastSaveId: null, updatedAt: at },
          published: null,
        };
        const templateId = (await request(tx.objectStore("pages").add(template))) as number;
        const record: CollectionRecord = { ...collection, id, templateId };
        await request(tx.objectStore("collections").put(record));
        return { ok: true, value: await collectionOf(tx, record) };
      });
    },

    async getCollection(collectionId, options) {
      checkSignal(options, "Reading the collection");
      return read(["collections", "pages", "entries"], async (tx) => collectionOf(tx, await collectionIn(tx, collectionId)));
    },

    // The members given replace the definition's own, checked whole, then
    // the prefix; a change that changes something moves the published
    // revision (Collection#update_definition!).
    async updateCollection(collectionId, changes: CollectionChanges, options) {
      checkSignal(options, "Changing the collection");
      const body = wire({ name: changes.name, prefix: changes.prefix, fields: changes.fields, sort: changes.sort }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.anyOf("name", "prefix", "fields", "sort");
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      return write(["collections", "pages", "entries"], async (tx): Promise<Outcome<Collection, Invalid>> => {
        const record = await collectionIn(tx, collectionId);
        const checked = validateCollection({ ...definitionOf(record), ...body });
        if (!checked.valid) return refusedBy(checked.errors);
        // Nothing changed, nothing saved: the CMS checks the prefix as it
        // saves a change.
        if (sameJson(checked.value, definitionOf(record))) return { ok: true, value: await collectionOf(tx, record) };
        const taken = await prefixTaken(tx, checked.value.prefix, record.id);
        if (taken.length > 0) return invalid("invalid_request", taken);
        const changed: CollectionRecord = { ...record, ...checked.value, publishedRevision: record.publishedRevision + 1, updatedAt: now() };
        await request(tx.objectStore("collections").put(changed));
        return { ok: true, value: await collectionOf(tx, changed) };
      });
    },

    // With its entries, and its template with the template's versions.
    async deleteCollection(collectionId, options) {
      checkSignal(options, "Deleting the collection");
      await write(["collections", "pages", "versions", "entries"], async (tx) => {
        const record = await collectionIn(tx, collectionId);
        for (const version of await versionsIn(tx, record.templateId)) await request(tx.objectStore("versions").delete([version.pageId, version.number]));
        await request(tx.objectStore("pages").delete(record.templateId));
        for (const entry of await entriesIn(tx, record.id)) await request(tx.objectStore("entries").delete(entry.id));
        await request(tx.objectStore("collections").delete(record.id));
      });
    },

    // As the CMS lists them (EntriesController#index): the collection
    // first, then the query's form, then an order by a key it cannot order
    // by, each refused as the CMS's 400 is.
    async listEntries(collectionId, query: EntryQuery = {}, options) {
      checkSignal(options, "Reading the entries");
      // An empty q is not sent; one with half a surrogate pair is sent as
      // URLSearchParams writes it, with U+FFFD in its place.
      const asked: Record<string, string> = {};
      if (query.q !== undefined && query.q !== "") asked.q = query.q.toWellFormed();
      if (query.order !== undefined) asked.order = query.order;
      const badQuery = (message: string) => new StorageError({ kind: "refused", status: 400, code: "invalid_query", message });
      return read(["collections", "entries"], async (tx) => {
        const collection = await collectionIn(tx, collectionId);
        for (const [name, value] of Object.entries(asked)) {
          if (!ENTRY_QUERY[name]!(value)) throw badQuery(WORDS.queryForm(name));
        }
        const order = asked.order ?? `${collection.sort.direction === "desc" ? "-" : ""}${collection.sort.by}`;
        const key = order.replace(/^-/, "");
        const field = collection.fields.find((candidate) => candidate.key === key);
        if (asked.order !== undefined && !BUILT_IN_ORDERS.includes(key) && !(field && SORTABLE_TYPES.includes(field.type))) throw badQuery(WORDS.noSortField(key));
        let entries = await entriesIn(tx, collection.id);
        if (asked.q !== undefined) {
          const wanted = asciiLower(asked.q);
          entries = entries.filter((entry) => asciiLower(entry.title).includes(wanted));
        }
        return orderedBy(entries, (entry) => sortValueOf(entry, key, field?.type), order.startsWith("-")).map(entryOf);
      });
    },

    // As the CMS makes one (Entry.create_checked!): the collection, the
    // entry against its fields, the slug, the images.
    async createEntry(collectionId, entry: EntryContent, options) {
      checkSignal(options, "Making the entry");
      const body = wire({ title: entry.title, slug: entry.slug, values: entry.values });
      return write(["collections", "entries", "media"], async (tx): Promise<Outcome<Entry, Invalid>> => {
        const collection = await collectionIn(tx, collectionId);
        const checked = validateEntry(definitionOf(collection), body);
        if (!checked.valid) return refusedBy(checked.errors);
        const taken = await entrySlugTaken(tx, collection.id, checked.value.slug, null);
        if (taken.length > 0) return invalid("invalid_request", taken);
        const missing = await missingEntryMedia(tx, checked.value.values);
        if (missing.length > 0) return invalid("invalid_request", missing);
        const at = now();
        const made: Omit<EntryRecord, "id"> = { ...checked.value, collectionId: collection.id, revision: 0, lastSaveId: null, createdAt: at, updatedAt: at, published: null };
        const id = (await request(tx.objectStore("entries").add(made))) as number;
        return { ok: true, value: entryOf({ ...made, id }) };
      });
    },

    async getEntry(collectionId, entryId, options) {
      checkSignal(options, "Reading the entry");
      return read(["collections", "entries"], async (tx) => entryOf(await entryIn(tx, await collectionIn(tx, collectionId), entryId)));
    },

    // As the CMS saves one (Entry.save_checked!): the request's members,
    // the collection, the entry against its fields, the entry itself, its
    // slug, then the revision, with the same answer as the CMS's for a save
    // sent again after its answer was lost, then the images.
    async saveEntry(collectionId, entryId, save: EntrySave, options) {
      checkSignal(options, "The save");
      const body = wire({ revision: save.revision, saveId: save.saveId, title: save.title, slug: save.slug, values: save.values }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.integer("revision", { required: true, minimum: 0 });
      check.string("saveId", { required: true, pattern: SAVE_ID });
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      const revision = body.revision as number;
      const saveId = body.saveId as string;
      const content = Object.fromEntries(Object.entries(body).filter(([name]) => name === "title" || name === "slug" || name === "values"));
      return write(["collections", "entries", "media"], async (tx): Promise<Outcome<Entry, Conflict | Invalid>> => {
        const collection = await collectionIn(tx, collectionId);
        const checked = validateEntry(definitionOf(collection), content);
        if (!checked.valid) return refusedBy(checked.errors);
        const record = await entryIn(tx, collection, entryId);
        const taken = await entrySlugTaken(tx, collection.id, checked.value.slug, record.id);
        if (taken.length > 0) return invalid("invalid_request", taken);
        if (record.revision !== revision) {
          const replay = record.lastSaveId === saveId && record.revision === revision + 1 && sameJson({ title: record.title, slug: record.slug, values: record.values }, checked.value);
          return replay ? { ok: true, value: entryOf(record) } : entryConflict(record);
        }
        const missing = await missingEntryMedia(tx, checked.value.values);
        if (missing.length > 0) return invalid("invalid_request", missing);
        const saved: EntryRecord = { ...record, ...checked.value, revision: revision + 1, lastSaveId: saveId, updatedAt: now() };
        await request(tx.objectStore("entries").put(saved));
        return { ok: true, value: entryOf(saved) };
      });
    },

    // As the CMS publishes one (Entry#publish!): at the revision asked, the
    // draft checked again against the fields as they are now; when it went
    // live stays the first publish's time until an unpublish. Nothing is
    // served, so no old address is kept to redirect from.
    async publishEntry(collectionId, entryId, request_: PublishRequest = {}, options) {
      checkSignal(options, "The publish");
      const body = wire({ revision: request_.revision }) as Record<string, unknown>;
      const check = new BodyCheck(body);
      check.integer("revision", { minimum: 0 });
      if (check.errors.length > 0) return invalid("invalid_request", check.errors);
      return write(["collections", "entries", "media"], async (tx): Promise<Outcome<Entry, Conflict | Invalid>> => {
        const collection = await collectionIn(tx, collectionId);
        const record = await entryIn(tx, collection, entryId);
        if (typeof body.revision === "number" && body.revision !== record.revision) return entryConflict(record);
        const checked = validateEntry(definitionOf(collection), { title: record.title, slug: record.slug, values: record.values });
        if (!checked.valid) return refusedBy(checked.errors);
        const missing = await missingEntryMedia(tx, record.values);
        if (missing.length > 0) return invalid("invalid_request", missing);
        const at = now();
        const published: EntryPublished = { title: record.title, slug: record.slug, values: record.values, draftRevision: record.revision, publishedAt: record.published?.publishedAt ?? at };
        const live: EntryRecord = { ...record, published, updatedAt: at };
        await request(tx.objectStore("entries").put(live));
        await advance(tx, collection);
        return { ok: true, value: entryOf(live) };
      });
    },

    async unpublishEntry(collectionId, entryId, options) {
      checkSignal(options, "Taking the entry off");
      return write(["collections", "entries"], async (tx) => {
        const collection = await collectionIn(tx, collectionId);
        const record = await entryIn(tx, collection, entryId);
        if (record.published === null) return entryOf(record);
        const off: EntryRecord = { ...record, published: null, updatedAt: now() };
        await request(tx.objectStore("entries").put(off));
        await advance(tx, collection);
        return entryOf(off);
      });
    },

    async deleteEntry(collectionId, entryId, options) {
      checkSignal(options, "Deleting the entry");
      await write(["collections", "entries"], async (tx) => {
        const collection = await collectionIn(tx, collectionId);
        const record = await entryIn(tx, collection, entryId);
        await request(tx.objectStore("entries").delete(record.id));
        if (record.published !== null) await advance(tx, collection);
      });
    },

    async siteFingerprint() {
      return read(STORES, standing);
    },
    async clearSite() {
      await write(STORES, emptied);
      for (const id of addresses.keys()) forget(id);
    },
    async clearSiteIf(fingerprint) {
      const cleared = await write(STORES, async (tx) => {
        if ((await standing(tx)) !== fingerprint) return false;
        await emptied(tx);
        return true;
      });
      if (cleared) for (const id of addresses.keys()) forget(id);
      return cleared;
    },
  };

  return adapter;
}

// The errors of a document once, by pointer and keyword, as the CMS
// reports them.
function unique<T extends { pointer: string; keyword: string }>(errors: readonly T[]): T[] {
  const seen = new Set<string>();
  return errors.filter((error) => {
    const key = `${error.pointer}\u0000${error.keyword}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function styleOf(stored: StyleRecord | null): SiteStyle {
  const defaults = defaultSiteStyle();
  return {
    palette: stored?.palette ?? defaults.palette,
    typeScale: stored?.typeScale ?? defaults.typeScale,
    letterWidth: stored?.letterWidth ?? defaults.letterWidth,
    customCss: stored?.customCss ?? "",
    updatedAt: stored?.updatedAt ?? null,
    choices: siteStyleChoices(),
  };
}

