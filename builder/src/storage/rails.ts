// The storage adapter for the CMS's JSON API (cms/openapi.yaml).
//
// - Where the API is comes from configuration: VITE_API_BASE, /api by
//   default (config.ts), or the apiBase given here.
// - Every call names its method and path in RAILS_ROUTES, by the API's
//   operationId, and nowhere else: a method is never deduced from whether
//   there is a body. openapi.test.ts holds the table to the API, both ways.
// - Every POST, PUT and PATCH says Content-Type: application/json, even
//   with no body: the CMS refuses any other write with 415, its guard
//   against requests sent from other sites.
// - A call that gets no answer saying what happened (no network, the time
//   ran out, a 5xx, something that is not the API's JSON) fails with an
//   unknown outcome, never with a guess.
// - Images go up with @rails/activestorage's DirectUpload, unchanged, to
//   the API's own /media/direct_uploads, then become a library item. The
//   library is loaded only when an image is uploaded.
import {
  StorageError,
  type CallOptions,
  type Capabilities,
  type Collection,
  type CollectionChanges,
  type Conflict,
  type Draft,
  type DraftSaved,
  type DraftSave,
  type Entry,
  type EntryQuery,
  type EntrySave,
  type FieldError,
  type FormResponse,
  type InUse,
  type Invalid,
  type MediaItem,
  type NewPage,
  type NewVersion,
  type NotPending,
  type Outcome,
  type Page,
  type PageChanges,
  type PageSummary,
  type PublishRequest,
  type PublishResult,
  type ResponseList,
  type ResponseQuery,
  type RestoreResult,
  type Schedule,
  type ScheduleRequest,
  type ScheduleResult,
  type Site,
  type SiteStyle,
  type SiteStyleChange,
  type StorageAdapter,
  type Upload,
  type UploadOptions,
  type Version,
  type VersionWithDocument,
} from "./adapter.ts";
import { isObject } from "../document/json.ts";
import type { CollectionDefinition, EntryContent } from "../shared/collection.ts";
import { systemClock, type Clock } from "./clock.ts";
import { apiBase } from "./config.ts";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface Route {
  method: HttpMethod;
  // Under the API base, with {name} for each path parameter.
  path: string;
  // Whether the request carries a JSON body: always, when there is
  // something to send, or never.
  body: "required" | "optional" | "none";
}

// Every operation of the API, by its operationId in cms/openapi.yaml.
export const RAILS_ROUTES = {
  listPages: { method: "GET", path: "/pages", body: "none" },
  createPage: { method: "POST", path: "/pages", body: "required" },
  getPage: { method: "GET", path: "/pages/{id}", body: "none" },
  updatePage: { method: "PATCH", path: "/pages/{id}", body: "required" },
  getDraft: { method: "GET", path: "/pages/{id}/draft", body: "none" },
  saveDraft: { method: "PUT", path: "/pages/{id}/draft", body: "required" },
  publishPage: { method: "POST", path: "/pages/{id}/publish", body: "optional" },
  listSchedules: { method: "GET", path: "/pages/{id}/schedules", body: "none" },
  schedulePublish: { method: "POST", path: "/pages/{id}/schedules", body: "required" },
  cancelSchedule: { method: "POST", path: "/pages/{id}/schedules/{scheduleId}/cancel", body: "none" },
  listVersions: { method: "GET", path: "/pages/{id}/versions", body: "none" },
  saveVersion: { method: "POST", path: "/pages/{id}/versions", body: "optional" },
  getVersion: { method: "GET", path: "/pages/{id}/versions/{number}", body: "none" },
  restoreVersion: { method: "POST", path: "/pages/{id}/versions/{number}/restore", body: "none" },
  listResponses: { method: "GET", path: "/pages/{id}/responses", body: "none" },
  getResponse: { method: "GET", path: "/pages/{id}/responses/{responseId}", body: "none" },
  deleteResponse: { method: "DELETE", path: "/pages/{id}/responses/{responseId}", body: "none" },
  // Sent by DirectUpload itself, which writes POST and its own headers.
  startUpload: { method: "POST", path: "/media/direct_uploads", body: "required" },
  listMedia: { method: "GET", path: "/media", body: "none" },
  createMedia: { method: "POST", path: "/media", body: "required" },
  setMediaAlt: { method: "PATCH", path: "/media/{id}", body: "required" },
  deleteMedia: { method: "DELETE", path: "/media/{id}", body: "none" },
  getSiteStyle: { method: "GET", path: "/site-style", body: "none" },
  setSiteStyle: { method: "PUT", path: "/site-style", body: "required" },
  getSite: { method: "GET", path: "/site", body: "none" },
  listCollections: { method: "GET", path: "/collections", body: "none" },
  createCollection: { method: "POST", path: "/collections", body: "required" },
  getCollection: { method: "GET", path: "/collections/{id}", body: "none" },
  updateCollection: { method: "PATCH", path: "/collections/{id}", body: "required" },
  deleteCollection: { method: "DELETE", path: "/collections/{id}", body: "none" },
  listEntries: { method: "GET", path: "/collections/{id}/entries", body: "none" },
  createEntry: { method: "POST", path: "/collections/{id}/entries", body: "required" },
  getEntry: { method: "GET", path: "/collections/{id}/entries/{entryId}", body: "none" },
  saveEntry: { method: "PUT", path: "/collections/{id}/entries/{entryId}", body: "required" },
  deleteEntry: { method: "DELETE", path: "/collections/{id}/entries/{entryId}", body: "none" },
  publishEntry: { method: "POST", path: "/collections/{id}/entries/{entryId}/publish", body: "optional" },
  unpublishEntry: { method: "POST", path: "/collections/{id}/entries/{entryId}/unpublish", body: "none" },
} as const satisfies Record<string, Route>;

export type OperationId = keyof typeof RAILS_ROUTES;

// The answer of GET /api/pages: the pages, and the site's parts beside
// them, the header then the footer.
export interface PageList {
  pages: PageSummary[];
  parts: PageSummary[];
}

export const RAILS_CAPABILITIES: Capabilities = {
  publish: true,
  // A job of the CMS's queue publishes at the time set.
  schedule: true,
  // The CMS keeps what visitors send with a published page's forms.
  responses: true,
  // The CMS keeps each file as uploaded: it has no image library to make
  // variants with (variant_processor :disabled, cms/config/application.rb),
  // and the battery's upload case reads the same bytes back from an
  // image's address.
  imageVariants: false,
  // The CMS serves what is published, at the page's address, with its cache.
  livePages: true,
  // The CMS keeps collections, their entries and their templates.
  collections: true,
};

export interface RailsAdapterConfig {
  // Where the API is: /api (the editor's own origin, through the
  // development server's proxy) unless VITE_API_BASE says otherwise.
  apiBase?: string;
  fetch?: typeof globalThis.fetch;
  clock?: Clock;
  // How long a call may take before it fails with an unknown outcome.
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

// The bodies this adapter writes that are not the interface's own requests:
// the library item made from a finished upload, and a new alt text.
export interface MediaCreate {
  signedBlobId: string;
  width: number;
  height: number;
  alt?: string;
}
export interface MediaAltChange {
  alt: string;
}

interface Answer {
  status: number;
  // The parsed JSON, or null for an empty body.
  body: unknown;
}

type Accepts = "conflict" | "invalid" | "in-use" | "not-pending";

export function createRailsAdapter(config: RailsAdapterConfig = {}): StorageAdapter {
  const base = (config.apiBase ?? apiBase()).replace(/\/+$/, "");
  const send = config.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const clock = config.clock ?? systemClock;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // An absolute base means the API is on another origin: the addresses the
  // CMS gives as paths (an image's) are made absolute on that origin, so an
  // <img> in the editor still finds them.
  const absoluteBase = /^[a-z][a-z0-9+.-]*:/i.test(base) ? base : null;
  const onCmsOrigin = (path: string) => (absoluteBase === null ? path : new URL(path, absoluteBase).href);

  // The query takes the parameters given a value, in the order given; an
  // undefined one is left out rather than sent empty.
  function address(operation: OperationId, params: Record<string, string | number>, query: Record<string, string | number | undefined> = {}): string {
    const path = RAILS_ROUTES[operation].path.replace(/\{([A-Za-z]+)\}/g, (_, name: string) => {
      const value = params[name];
      if (value === undefined) throw new Error(`${operation} needs the path parameter ${name}`);
      return encodeURIComponent(String(value));
    });
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) if (value !== undefined) search.append(name, String(value));
    return search.size === 0 ? `${base}${path}` : `${base}${path}?${search}`;
  }

  async function call(
    operation: OperationId,
    params: Record<string, string | number>,
    body: unknown,
    options?: CallOptions,
    query?: Record<string, string | number | undefined>,
  ): Promise<Answer> {
    const route: Route = RAILS_ROUTES[operation];
    const url = address(operation, params, query);
    const headers: Record<string, string> = { Accept: "application/json" };
    const init: RequestInit = { method: route.method, headers, cache: "no-store", credentials: "same-origin" };
    if (route.method === "POST" || route.method === "PUT" || route.method === "PATCH") {
      headers["Content-Type"] = "application/json";
      if (route.body === "required" || (route.body === "optional" && body !== undefined)) init.body = JSON.stringify(body ?? {});
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = clock.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const caller = options?.signal;
    const abandon = () => controller.abort();
    if (caller?.aborted) controller.abort();
    else caller?.addEventListener("abort", abandon, { once: true });
    init.signal = controller.signal;

    const what = `${route.method} ${route.path}`;
    try {
      let response: Response;
      let text: string;
      try {
        response = await send(url, init);
        text = await response.text();
      } catch (error) {
        if (controller.signal.aborted) {
          throw new StorageError({
            kind: "unknown",
            cause: "timeout",
            status: null,
            message: timedOut ? `${what} got no answer within ${timeoutMs / 1000} s.` : `${what} was abandoned before its answer came.`,
          });
        }
        throw new StorageError({ kind: "unknown", cause: "network", status: null, message: `${what} could not reach the CMS: ${(error as Error).message}` });
      }
      if (response.status >= 500) {
        throw new StorageError({ kind: "unknown", cause: "server", status: response.status, message: `${what} failed on the server (${response.status}).` });
      }
      if (text === "") return { status: response.status, body: null };
      try {
        return { status: response.status, body: JSON.parse(text) as unknown };
      } catch {
        // A page from something in between (a proxy, a login wall), not the
        // API: nothing says whether the request took effect.
        throw new StorageError({ kind: "unknown", cause: "unreadable", status: response.status, message: `${what} was answered ${response.status} with something that is not the API's JSON.` });
      }
    } finally {
      clock.clearTimeout(timer);
      caller?.removeEventListener("abort", abandon);
    }
  }

  // What the call was asked for, at the status the API gives it.
  function value<T>(answer: Answer, status: number, operation: OperationId): T {
    const settled = settle<T, never>(answer, status, [], operation);
    if (!settled.ok) throw failure(answer, operation);
    return settled.value;
  }

  // The answer as an Outcome: the value, or one of the refusals this
  // operation can get. Anything else is thrown.
  function settle<T, P>(answer: Answer, status: number, accepts: readonly Accepts[], operation: OperationId): Outcome<T, P> {
    const { body } = answer;
    if (answer.status === status) {
      if (status !== 204 && !isObject(body)) {
        throw new StorageError({ kind: "unknown", cause: "unreadable", status, message: `${operation} was answered ${status} without the object the API sends.` });
      }
      return { ok: true, value: (status === 204 ? null : body) as T };
    }
    if (isObject(body)) {
      const message = typeof body.message === "string" ? body.message : "";
      if (answer.status === 409 && body.error === "conflict" && accepts.includes("conflict")) {
        const conflict: Conflict = { kind: "conflict", message, currentRevision: body.currentRevision as number, lastSaveId: body.lastSaveId as string | null };
        return { ok: false, problem: conflict as P };
      }
      if (answer.status === 409 && body.error === "media_in_use" && accepts.includes("in-use")) {
        const inUse: InUse = { kind: "in-use", message, usedBy: body.usedBy as InUse["usedBy"] };
        return { ok: false, problem: inUse as P };
      }
      if (answer.status === 409 && body.error === "not_pending" && accepts.includes("not-pending")) {
        const notPending: NotPending = { kind: "not-pending", message, schedule: body.schedule as Schedule };
        return { ok: false, problem: notPending as P };
      }
      const code = body.error;
      if (answer.status === 422 && accepts.includes("invalid") && (code === "invalid_request" || code === "invalid_document" || code === "duplicate_key")) {
        const invalid: Invalid = { kind: "invalid", code, message, errors: body.errors as FieldError[] };
        return { ok: false, problem: invalid as P };
      }
    }
    throw failure(answer, operation);
  }

  function failure(answer: Answer, operation: OperationId): StorageError {
    const { status, body } = answer;
    const code = isObject(body) && typeof body.error === "string" ? body.error : null;
    const message = isObject(body) && typeof body.message === "string" ? body.message : `${operation} was answered ${status}.`;
    if (status === 404) return new StorageError({ kind: "not-found", message });
    if (status >= 400 && status < 500 && code !== null) return new StorageError({ kind: "refused", status, code, message });
    // A success other than the one expected, or a refusal without the
    // API's shape: what happened is not known.
    return new StorageError({ kind: "unknown", cause: "unreadable", status, message: `${operation} was answered ${status}, which the API does not give it.` });
  }

  const media = (item: MediaItem): MediaItem => ({ ...item, url: onCmsOrigin(item.url) });

  const adapter: StorageAdapter = {
    name: "rails",
    capabilities: RAILS_CAPABILITIES,

    async listPages(options) {
      return value<PageList>(await call("listPages", {}, undefined, options), 200, "listPages").pages;
    },
    // The same list, whose parts the CMS answers beside the pages.
    async listParts(options) {
      return value<PageList>(await call("listPages", {}, undefined, options), 200, "listPages").parts;
    },
    async createPage(page: NewPage, options) {
      return settle<Page, Invalid>(await call("createPage", {}, { title: page.title, slug: page.slug }, options), 201, ["invalid"], "createPage");
    },
    async getPage(pageId, options) {
      return value<Page>(await call("getPage", { id: pageId }, undefined, options), 200, "getPage");
    },
    async updatePage(pageId, changes: PageChanges, options) {
      return settle<Page, Invalid>(await call("updatePage", { id: pageId }, changes, options), 200, ["invalid"], "updatePage");
    },
    async getDraft(pageId, options) {
      return value<Draft>(await call("getDraft", { id: pageId }, undefined, options), 200, "getDraft");
    },
    async saveDraft(pageId, save: DraftSave, options) {
      const body = { revision: save.revision, document: save.document, saveId: save.saveId };
      return settle<DraftSaved, Conflict | Invalid>(await call("saveDraft", { id: pageId }, body, options), 200, ["conflict", "invalid"], "saveDraft");
    },
    async publish(pageId, request: PublishRequest = {}, options) {
      const body = request.revision === undefined ? undefined : { revision: request.revision };
      return settle<PublishResult, Conflict | Invalid>(await call("publishPage", { id: pageId }, body, options), 200, ["conflict", "invalid"], "publishPage");
    },
    async schedulePublish(pageId, request: ScheduleRequest, options) {
      const body = { revision: request.revision, at: request.at };
      return settle<ScheduleResult, Conflict | Invalid>(await call("schedulePublish", { id: pageId }, body, options), 201, ["conflict", "invalid"], "schedulePublish");
    },
    async cancelScheduledPublish(pageId, scheduleId, options) {
      const answer = settle<{ schedule: Schedule }, NotPending>(await call("cancelSchedule", { id: pageId, scheduleId }, undefined, options), 200, ["not-pending"], "cancelSchedule");
      return answer.ok ? { ok: true, value: answer.value.schedule } : answer;
    },
    async listSchedules(pageId, options) {
      return value<{ schedules: Schedule[] }>(await call("listSchedules", { id: pageId }, undefined, options), 200, "listSchedules").schedules;
    },

    async listVersions(pageId, options) {
      return value<{ versions: Version[] }>(await call("listVersions", { id: pageId }, undefined, options), 200, "listVersions").versions;
    },
    async getVersion(pageId, number, options) {
      return value<VersionWithDocument>(await call("getVersion", { id: pageId, number }, undefined, options), 200, "getVersion");
    },
    async saveVersion(pageId, request: NewVersion = {}, options) {
      const body = request.name === undefined ? undefined : { name: request.name };
      return settle<Version, Invalid>(await call("saveVersion", { id: pageId }, body, options), 201, ["invalid"], "saveVersion");
    },
    async restoreVersion(pageId, number, options) {
      return settle<RestoreResult, Invalid>(await call("restoreVersion", { id: pageId, number }, undefined, options), 200, ["invalid"], "restoreVersion");
    },

    async listMedia(options) {
      return value<{ media: MediaItem[] }>(await call("listMedia", {}, undefined, options), 200, "listMedia").media.map(media);
    },
    async uploadMedia(upload: Upload, options?: UploadOptions) {
      const started = await directUpload(upload.file, address("startUpload", {}), options);
      if (!started.ok) return started;
      const body: MediaCreate = { signedBlobId: started.value, width: upload.width, height: upload.height, ...(upload.alt === undefined ? {} : { alt: upload.alt }) };
      const created = settle<MediaItem, Invalid>(await call("createMedia", {}, body, options), 201, ["invalid"], "createMedia");
      return created.ok ? { ok: true, value: media(created.value) } : { ok: false, problem: onUpload(created.problem) };
    },
    async setMediaAlt(mediaId, alt, options) {
      const body: MediaAltChange = { alt };
      const set = settle<MediaItem, Invalid>(await call("setMediaAlt", { id: mediaId }, body, options), 200, ["invalid"], "setMediaAlt");
      return set.ok ? { ok: true, value: media(set.value) } : set;
    },
    async deleteMedia(mediaId, options) {
      return settle<null, InUse>(await call("deleteMedia", { id: mediaId }, undefined, options), 204, ["in-use"], "deleteMedia");
    },

    async getSiteStyle(options) {
      return value<SiteStyle>(await call("getSiteStyle", {}, undefined, options), 200, "getSiteStyle");
    },
    async setSiteStyle(style: SiteStyleChange, options) {
      const body = {
        palette: style.palette,
        typeScale: style.typeScale,
        ...(style.letterWidth === undefined ? {} : { letterWidth: style.letterWidth }),
        ...(style.customCss === undefined ? {} : { customCss: style.customCss }),
      };
      return settle<SiteStyle, Invalid>(await call("setSiteStyle", {}, body, options), 200, ["invalid"], "setSiteStyle");
    },
    async getSite(options) {
      return value<Site>(await call("getSite", {}, undefined, options), 200, "getSite");
    },

    async listResponses(pageId, query: ResponseQuery = {}, options) {
      const answer = await call("listResponses", { id: pageId }, undefined, options, { form: query.form, before: query.before });
      return value<ResponseList>(answer, 200, "listResponses");
    },
    async getResponse(pageId, responseId, options) {
      return value<FormResponse>(await call("getResponse", { id: pageId, responseId }, undefined, options), 200, "getResponse");
    },
    async deleteResponse(pageId, responseId, options) {
      value<null>(await call("deleteResponse", { id: pageId, responseId }, undefined, options), 204, "deleteResponse");
    },

    async listCollections(options) {
      return value<{ collections: Collection[] }>(await call("listCollections", {}, undefined, options), 200, "listCollections").collections;
    },
    async createCollection(definition: CollectionDefinition, options) {
      const body = { name: definition.name, prefix: definition.prefix, fields: definition.fields, sort: definition.sort };
      return settle<Collection, Invalid>(await call("createCollection", {}, body, options), 201, ["invalid"], "createCollection");
    },
    async getCollection(collectionId, options) {
      return value<Collection>(await call("getCollection", { id: collectionId }, undefined, options), 200, "getCollection");
    },
    async updateCollection(collectionId, changes: CollectionChanges, options) {
      return settle<Collection, Invalid>(await call("updateCollection", { id: collectionId }, changes, options), 200, ["invalid"], "updateCollection");
    },
    async deleteCollection(collectionId, options) {
      value<null>(await call("deleteCollection", { id: collectionId }, undefined, options), 204, "deleteCollection");
    },
    async listEntries(collectionId, query: EntryQuery = {}, options) {
      const answer = await call("listEntries", { id: collectionId }, undefined, options, { q: query.q === "" ? undefined : query.q, order: query.order });
      return value<{ entries: Entry[] }>(answer, 200, "listEntries").entries;
    },
    async createEntry(collectionId, entry: EntryContent, options) {
      const body = { title: entry.title, slug: entry.slug, values: entry.values };
      return settle<Entry, Invalid>(await call("createEntry", { id: collectionId }, body, options), 201, ["invalid"], "createEntry");
    },
    async getEntry(collectionId, entryId, options) {
      return value<Entry>(await call("getEntry", { id: collectionId, entryId }, undefined, options), 200, "getEntry");
    },
    async saveEntry(collectionId, entryId, save: EntrySave, options) {
      const body = { revision: save.revision, saveId: save.saveId, title: save.title, slug: save.slug, values: save.values };
      return settle<Entry, Conflict | Invalid>(await call("saveEntry", { id: collectionId, entryId }, body, options), 200, ["conflict", "invalid"], "saveEntry");
    },
    async publishEntry(collectionId, entryId, request: PublishRequest = {}, options) {
      const body = request.revision === undefined ? undefined : { revision: request.revision };
      return settle<Entry, Conflict | Invalid>(await call("publishEntry", { id: collectionId, entryId }, body, options), 200, ["conflict", "invalid"], "publishEntry");
    },
    async unpublishEntry(collectionId, entryId, options) {
      return value<Entry>(await call("unpublishEntry", { id: collectionId, entryId }, undefined, options), 200, "unpublishEntry");
    },
    async deleteEntry(collectionId, entryId, options) {
      value<null>(await call("deleteEntry", { id: collectionId, entryId }, undefined, options), 204, "deleteEntry");
    },
  };

  // The bytes of an image, by DirectUpload: it asks the API for a blob
  // (POST /media/direct_uploads), PUTs the file where the answer says, and
  // gives the blob's signed id. DirectUpload reports a failure only as a
  // sentence with the status in it, so the request it is making is kept
  // through its delegate, and the API's answer read from there: a 422
  // keeps its fields.
  async function directUpload(file: File, url: string, options?: UploadOptions): Promise<Outcome<string, Invalid>> {
    const signal = options?.signal;
    const abandoned = () => new StorageError({ kind: "unknown", cause: "timeout", status: null, message: `The upload of "${file.name}" was abandoned.` });
    if (signal?.aborted) throw abandoned();
    const { DirectUpload } = await import("@rails/activestorage");
    return await new Promise<Outcome<string, Invalid>>((resolve, reject) => {
      let creating: XMLHttpRequest | null = null;
      let storing: XMLHttpRequest | null = null;
      let done = false;
      const finish = (settle: () => void) => {
        if (done) return;
        done = true;
        signal?.removeEventListener("abort", onAbort);
        settle();
      };
      // DirectUpload hears only load and error, not abort: without this the
      // promise would never settle.
      const onAbort = () => {
        creating?.abort();
        storing?.abort();
        finish(() => reject(abandoned()));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      new DirectUpload(file, url, {
        directUploadWillCreateBlobWithXHR: (xhr) => {
          creating = xhr;
        },
        directUploadWillStoreFileWithXHR: (xhr) => {
          storing = xhr;
          const progress = options?.onProgress;
          if (progress) xhr.upload.addEventListener("progress", (event) => progress(event.loaded, event.total || file.size));
        },
      }).create((error, blob) => {
        finish(() => {
          if (!error && blob) {
            resolve({ ok: true, value: blob.signed_id });
            return;
          }
          const failed = storing ?? creating;
          if (failed === null) {
            // DirectUpload reads the file for its checksum before it sends
            // anything.
            reject(new StorageError({ kind: "refused", status: 0, code: "unreadable_file", message: `The file "${file.name}" could not be read.` }));
            return;
          }
          if (failed.status === 0) {
            reject(new StorageError({ kind: "unknown", cause: "network", status: null, message: `The upload of "${file.name}" could not reach the CMS.` }));
            return;
          }
          if (failed.status >= 500) {
            reject(new StorageError({ kind: "unknown", cause: "server", status: failed.status, message: `The upload of "${file.name}" failed on the server (${failed.status}).` }));
            return;
          }
          if (failed === creating) {
            try {
              const answer: Answer = { status: failed.status, body: failed.responseType === "json" ? (failed.response as unknown) : JSON.parse(String(failed.response)) };
              // A 2xx never comes here (DirectUpload went on to the bytes);
              // a refusal other than a 422 is thrown, as for any call.
              const settled = settle<unknown, Invalid>(answer, 200, ["invalid"], "startUpload");
              if (settled.ok) reject(failure(answer, "startUpload"));
              else resolve({ ok: false, problem: onUpload(settled.problem) });
            } catch (thrown) {
              reject(thrown);
            }
            return;
          }
          // The storage service refused the bytes (a checksum that does not
          // match them, an address that expired).
          reject(new StorageError({ kind: "refused", status: failed.status, code: "upload_refused", message: `The bytes of "${file.name}" were refused (${failed.status}).` }));
        });
      });
    });
  }

  return adapter;
}

// The pointers of a refused upload, moved from the API's two requests (the
// blob of /media/direct_uploads, then the library item of /media) onto the
// Upload the editor gave: anything about the file, its type, its size, or
// its bytes, is /file.
function onUpload(problem: Invalid): Invalid {
  const field = (pointer: string): string =>
    pointer === "/blob" || pointer.startsWith("/blob/") || pointer === "/signedBlobId" || pointer === "/file" ? "/file" : pointer;
  return { ...problem, errors: problem.errors.map((error) => ({ ...error, pointer: field(error.pointer) })) };
}
