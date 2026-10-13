// A storage adapter in Node whose every call runs on a browser's adapter in
// a page of Chromium (../../test/browser/storage-page.ts): the battery,
// written against the interface alone, runs unchanged on the real
// IndexedDB of a real browser. Each remote is one adapter of the page, a
// tab of the editor; two pages of one browser context are two tabs on one
// database. What crosses is ./wire.ts.
import type { Page } from "@playwright/test";
import { StorageError, type CallOptions, type Capabilities, type StorageAdapter, type Upload, type UploadOptions } from "../../src/storage/adapter.ts";
import type { WireAnswer, WireFile, WireOptions } from "./wire.ts";

// The page a test opens for the battery, ready once its adapters can be made.
export async function storagePage(page: Page): Promise<Page> {
  await page.goto("/e2e/browser/storage.html");
  await page.waitForFunction(() => window.storagePage !== undefined);
  return page;
}

async function wireFile(file: File): Promise<WireFile> {
  return { __file: { name: file.name, type: file.type, base64: Buffer.from(await file.arrayBuffer()).toString("base64") } };
}

function wireOptions(options: CallOptions | UploadOptions | undefined): WireOptions | undefined {
  const wired: WireOptions = {};
  if (options && "onProgress" in options && options.onProgress) wired.__progress = true;
  if (options?.signal?.aborted) wired.__aborted = true;
  return wired.__progress || wired.__aborted ? wired : undefined;
}

let made = 0;

// An adapter of its own on the page, under a key no other remote has.
export function remoteAdapter(page: Page, capabilities: Capabilities): StorageAdapter & { clearSite(): Promise<void> } {
  const key = `tab-${++made}`;

  async function call<T>(method: keyof StorageAdapter | "clearSite", args: unknown[], options?: CallOptions | UploadOptions): Promise<T> {
    const given: unknown[] = [...args, wireOptions(options)];
    const answer: WireAnswer = await page.evaluate(([k, m, a]) => window.storagePage!.call(k, m, a), [key, method, given] as const);
    if ("failure" in answer) throw new StorageError(answer.failure);
    if ("error" in answer) throw Object.assign(new Error(answer.error.message), { name: answer.error.name });
    const progress = options && "onProgress" in options ? options.onProgress : undefined;
    for (const [sent, total] of answer.progress) progress?.(sent, total);
    return answer.ok as T;
  }

  return {
    name: "browser",
    capabilities,
    listPages: (options) => call("listPages", [], options),
    listParts: (options) => call("listParts", [], options),
    createPage: (page_, options) => call("createPage", [page_], options),
    getPage: (pageId, options) => call("getPage", [pageId], options),
    updatePage: (pageId, changes, options) => call("updatePage", [pageId, changes], options),
    getDraft: (pageId, options) => call("getDraft", [pageId], options),
    saveDraft: (pageId, save, options) => call("saveDraft", [pageId, save], options),
    publish: (pageId, request, options) => call("publish", [pageId, request], options),
    schedulePublish: (pageId, request, options) => call("schedulePublish", [pageId, request], options),
    cancelScheduledPublish: (pageId, scheduleId, options) => call("cancelScheduledPublish", [pageId, scheduleId], options),
    listSchedules: (pageId, options) => call("listSchedules", [pageId], options),
    listVersions: (pageId, options) => call("listVersions", [pageId], options),
    getVersion: (pageId, number, options) => call("getVersion", [pageId, number], options),
    saveVersion: (pageId, request, options) => call("saveVersion", [pageId, request], options),
    restoreVersion: (pageId, number, options) => call("restoreVersion", [pageId, number], options),
    listMedia: (options) => call("listMedia", [], options),
    uploadMedia: async (upload: Upload, options) => call("uploadMedia", [{ ...upload, file: await wireFile(upload.file) }], options),
    setMediaAlt: (mediaId, alt, options) => call("setMediaAlt", [mediaId, alt], options),
    deleteMedia: (mediaId, options) => call("deleteMedia", [mediaId], options),
    getSiteStyle: (options) => call("getSiteStyle", [], options),
    setSiteStyle: (style, options) => call("setSiteStyle", [style], options),
    getSite: (options) => call("getSite", [], options),
    listResponses: (pageId, query, options) => call("listResponses", [pageId, query], options),
    getResponse: (pageId, responseId, options) => call("getResponse", [pageId, responseId], options),
    deleteResponse: (pageId, responseId, options) => call("deleteResponse", [pageId, responseId], options),
    clearSite: () => call("clearSite", []),
  };
}
