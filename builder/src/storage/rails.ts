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
  unsupported,
  type CallOptions,
  type Capabilities,
  type Conflict,
  type Draft,
  type DraftSaved,
  type DraftSave,
  type FieldError,
  type InUse,
  type Invalid,
  type MediaItem,
  type NewPage,
  type NewVersion,
  type Outcome,
  type Page,
  type PageChanges,
  type PageSummary,
  type PublishRequest,
  type PublishResult,
  type RestoreResult,
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
  listVersions: { method: "GET", path: "/pages/{id}/versions", body: "none" },
  saveVersion: { method: "POST", path: "/pages/{id}/versions", body: "optional" },
  getVersion: { method: "GET", path: "/pages/{id}/versions/{number}", body: "none" },
  restoreVersion: { method: "POST", path: "/pages/{id}/versions/{number}/restore", body: "none" },
  // Sent by DirectUpload itself, which writes POST and its own headers.
  startUpload: { method: "POST", path: "/media/direct_uploads", body: "required" },
  listMedia: { method: "GET", path: "/media", body: "none" },
  createMedia: { method: "POST", path: "/media", body: "required" },
  setMediaAlt: { method: "PATCH", path: "/media/{id}", body: "required" },
  deleteMedia: { method: "DELETE", path: "/media/{id}", body: "none" },
  getSiteStyle: { method: "GET", path: "/site-style", body: "none" },
  setSiteStyle: { method: "PUT", path: "/site-style", body: "required" },
  getSite: { method: "GET", path: "/site", body: "none" },
} as const satisfies Record<string, Route>;

export type OperationId = keyof typeof RAILS_ROUTES;

export const RAILS_CAPABILITIES: Capabilities = {
  publish: true,
  // Until the CMS has them: scheduled publishing in stage 4, form answers
  // in stage 5.
  schedule: false,
  responses: false,
  // The CMS keeps each file as uploaded: it has no image library to make
  // variants with (variant_processor :disabled, cms/config/application.rb),
  // and the battery's upload case reads the same bytes back from an
  // image's address.
  imageVariants: false,
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

type Accepts = "conflict" | "invalid" | "in-use";

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

  function address(operation: OperationId, params: Record<string, string | number>): string {
    const path = RAILS_ROUTES[operation].path.replace(/\{([a-z]+)\}/g, (_, name: string) => {
      const value = params[name];
      if (value === undefined) throw new Error(`${operation} needs the path parameter ${name}`);
      return encodeURIComponent(String(value));
    });
    return `${base}${path}`;
  }

  async function call(operation: OperationId, params: Record<string, string | number>, body: unknown, options?: CallOptions): Promise<Answer> {
    const route: Route = RAILS_ROUTES[operation];
    const url = address(operation, params);
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
      return value<{ pages: PageSummary[] }>(await call("listPages", {}, undefined, options), 200, "listPages").pages;
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
    async schedulePublish() {
      throw unsupported("schedule", "rails");
    },
    async cancelScheduledPublish() {
      throw unsupported("schedule", "rails");
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
      return settle<SiteStyle, Invalid>(await call("setSiteStyle", {}, { palette: style.palette, typeScale: style.typeScale }, options), 200, ["invalid"], "setSiteStyle");
    },
    async getSite(options) {
      return value<Site>(await call("getSite", {}, undefined, options), 200, "getSite");
    },

    async listResponses() {
      throw unsupported("responses", "rails");
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
