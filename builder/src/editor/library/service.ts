// The media library's work, through the storage adapter only: the list
// read again, uploads one after another (made ready in the browser first,
// ./resize.ts), each with its progress and a way to stop it, an image's
// proposed alt text, and deleting an image, which the CMS refuses while a
// page or a kept version shows it.
//
// The library itself is the interface's store's (`media`, ../ui-store.ts),
// where the canvas finds an image by its id. An upload adds its image
// there once the CMS has it, and never touches the page: an image enters
// a page only when the person places it, as one command born with its
// mediaId, so the page never holds an image the CMS has not taken.
// Uploads go on with the library closed, and
// the tab warns before it closes while one is on its way (./context.tsx).
import { createStore, type StoreApi } from "zustand/vanilla";
import { isStorageError, type MediaItem, type MediaUse, type StorageAdapter, type Upload } from "../../storage/adapter.ts";
import type { UiStore } from "../ui-store.ts";
import { uploadRefusal } from "./files.ts";
import { prepareImage, type Prepare } from "./resize.ts";

// waiting: behind another upload; preparing: being drawn again in the
// browser; uploading: its bytes on their way; failed: refused, with why.
export type UploadPhase = "waiting" | "preparing" | "uploading" | "failed";

export interface UploadEntry {
  key: string;
  // The file's name as the person chose it.
  name: string;
  phase: UploadPhase;
  // Bytes sent of the file made ready, as they go.
  sent: number;
  total: number;
  // The image made ready, for its tile while it goes up.
  preview: string | null;
  // Why it was refused, for a failed one.
  reason: string | null;
}

export type AltOutcome = { ok: true } | { ok: false; message: string };
export type RemoveOutcome = { ok: true } | { ok: false; inUse: MediaUse } | { ok: false; message: string };

export interface MediaService {
  // The storage makes smaller copies of an image (../../storage/adapter.ts,
  // Capabilities); the library says what it means either way.
  readonly imageVariants: boolean;
  readonly uploads: StoreApi<{ entries: readonly UploadEntry[] }>;
  // Queues the files; each image the CMS takes is added to the library and
  // handed to onAdded. Returns the uploads' keys.
  upload(files: readonly File[], onAdded?: (item: MediaItem) => void): string[];
  // Stops an upload not yet finished, and forgets it.
  cancel(key: string): void;
  // Forgets a failed upload.
  dismiss(key: string): void;
  // Reads the library again; resolves with why it could not, or null.
  refresh(): Promise<string | null>;
  // A page taken from the server (a reload, another page, a restore, the
  // draft another tab saved) may show images this tab has not seen: any of
  // these ids the library does not have sends it to be read again, once
  // per id, the ids listed in the interface's `mediaLooking` meanwhile.
  ensure(ids: ReadonlySet<string>): void;
  setAlt(id: string, alt: string): Promise<AltOutcome>;
  remove(id: string): Promise<RemoveOutcome>;
  // An image made in this browser (a picture the Assistant made for a
  // page), uploaded as it is, with its alt text: added to the library
  // once the storage has it, as an upload's is; or why not, as a clause
  // ("the CMS refused it: ...").
  put(upload: Upload): Promise<PutOutcome>;
  // An upload is waiting, being made ready or on its way.
  busy(): boolean;
}

export type PutOutcome = { ok: true; item: MediaItem } | { ok: false; reason: string };

// The browser's addresses for the files made ready; none in a test's DOM.
export interface ObjectUrls {
  create(file: Blob): string | null;
  revoke(url: string): void;
}

const browserUrls: ObjectUrls = {
  create: (file) => (typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null),
  revoke: (url) => {
    if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
  },
};

export type MediaAdapter = Pick<StorageAdapter, "capabilities" | "listMedia" | "uploadMedia" | "setMediaAlt" | "deleteMedia">;

interface Job {
  file: File;
  controller: AbortController;
  onAdded: ((item: MediaItem) => void) | undefined;
  cancelled: boolean;
}

const describe = (error: unknown): string => (isStorageError(error) ? error.failure.message : error instanceof Error ? error.message : String(error));

// `inBrowser`: the pages and images are kept in this browser, with no CMS
// (the demo): what is refused or unanswered is then this browser's storage,
// and is not said to be the CMS.
export function createMediaService(options: { adapter: MediaAdapter; ui: UiStore; prepare?: Prepare; urls?: ObjectUrls; inBrowser?: boolean }): MediaService {
  const { adapter, ui } = options;
  const inBrowser = options.inBrowser ?? false;
  const prepare = options.prepare ?? prepareImage;
  const urls = options.urls ?? browserUrls;
  const uploads = createStore<{ entries: readonly UploadEntry[] }>()(() => ({ entries: [] }));
  const jobs = new Map<string, Job>();
  let made = 0;
  let running = false;
  // Images made in the browser on their way up.
  let putting = 0;

  const entries = () => uploads.getState().entries;
  const patch = (key: string, change: Partial<UploadEntry>) =>
    uploads.setState({ entries: entries().map((entry) => (entry.key === key ? { ...entry, ...change } : entry)) });
  const forget = (key: string) => {
    const entry = entries().find((e) => e.key === key);
    if (entry?.preview) urls.revoke(entry.preview);
    jobs.delete(key);
    uploads.setState({ entries: entries().filter((e) => e.key !== key) });
  };
  const fail = (key: string, reason: string) => {
    jobs.delete(key);
    patch(key, { phase: "failed", reason });
  };

  // The library, newest first, with this image at its head.
  const add = (item: MediaItem) => {
    const others = [...ui.getState().media.values()].filter((m) => m.id !== item.id);
    ui.getState().setMedia([item, ...others]);
  };
  const replace = (item: MediaItem) => ui.getState().setMedia([...ui.getState().media.values()].map((m) => (m.id === item.id ? item : m)));
  const drop = (id: string) => ui.getState().setMedia([...ui.getState().media.values()].filter((m) => m.id !== id));

  const refresh = async (): Promise<string | null> => {
    try {
      ui.getState().setMedia(await adapter.listMedia());
      return null;
    } catch (error) {
      return `The library could not be read again: ${describe(error)}`;
    }
  };

  // The ids a read was made for, and whether one is under way and another
  // is wanted after it.
  const asked = new Set<string>();
  let reading = false;
  let again = false;
  const look = async (): Promise<void> => {
    reading = true;
    do {
      again = false;
      const why = await refresh();
      // A read that failed confirms nothing: those ids may be asked again.
      if (why) for (const id of ui.getState().mediaLooking) asked.delete(id);
    } while (again);
    reading = false;
    ui.setState({ mediaLooking: new Set() });
  };
  const ensure = (ids: ReadonlySet<string>): void => {
    const media = ui.getState().media;
    const missing = [...ids].filter((id) => !media.has(id) && !asked.has(id));
    if (missing.length === 0) return;
    for (const id of missing) asked.add(id);
    ui.setState({ mediaLooking: new Set([...ui.getState().mediaLooking, ...missing]) });
    if (reading) again = true;
    else void look();
  };

  async function send(key: string, job: Job): Promise<void> {
    patch(key, { phase: "preparing" });
    const prepared = await prepare(job.file);
    if (job.cancelled) return;
    if (!prepared.ok) {
      fail(key, prepared.reason);
      return;
    }
    const { file, width, height } = prepared.image;
    patch(key, { phase: "uploading", sent: 0, total: file.size, preview: urls.create(file) });
    let outcome;
    try {
      outcome = await adapter.uploadMedia({ file, width, height }, {
        signal: job.controller.signal,
        onProgress: (sent, total) => {
          if (!job.cancelled) patch(key, { sent, total });
        },
      });
    } catch (error) {
      if (job.cancelled) return;
      if (isStorageError(error) && error.failure.kind === "unknown") {
        // It may have reached the library: the list read again shows.
        fail(key, `No answer from ${inBrowser ? "this browser's storage" : "the CMS"} (${error.failure.message}): it may be in the library or not. The list was read again; look for it before uploading it again.`);
        await refresh();
        return;
      }
      // A refusal with no status is this browser's own (a file it cannot
      // read, its storage full), not the CMS's; with no CMS, all are.
      const own = inBrowser || (isStorageError(error) && error.failure.kind === "refused" && error.failure.status === 0);
      fail(key, own ? `Not uploaded: ${describe(error)}` : `The CMS refused it: ${describe(error)}`);
      return;
    }
    if (job.cancelled) return;
    if (!outcome.ok) {
      fail(key, uploadRefusal(outcome.problem, file, inBrowser));
      return;
    }
    forget(key);
    add(outcome.value);
    job.onAdded?.(outcome.value);
  }

  // One upload at a time: an image being drawn again holds its pixels, and
  // one request at a time keeps each one's progress honest.
  async function run(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const next = entries().find((entry) => entry.phase === "waiting");
        const job = next && jobs.get(next.key);
        if (!next || !job) return;
        try {
          await send(next.key, job);
        } catch (error) {
          if (!job.cancelled) fail(next.key, `It could not be uploaded: ${describe(error)}`);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    imageVariants: adapter.capabilities.imageVariants,
    uploads,
    upload(files, onAdded) {
      const keys = files.map(() => `upload-${++made}`);
      for (const [index, file] of files.entries()) {
        jobs.set(keys[index]!, { file, controller: new AbortController(), onAdded, cancelled: false });
      }
      uploads.setState({
        entries: [
          ...entries(),
          ...files.map((file, index): UploadEntry => ({ key: keys[index]!, name: file.name, phase: "waiting", sent: 0, total: file.size, preview: null, reason: null })),
        ],
      });
      void run();
      return keys;
    },
    cancel(key) {
      const job = jobs.get(key);
      const entry = entries().find((e) => e.key === key);
      if (!entry || entry.phase === "failed") return;
      const wasSending = entry.phase === "uploading";
      if (job) {
        job.cancelled = true;
        job.controller.abort();
      }
      forget(key);
      // Stopped after the CMS may have made the item: the list says.
      if (wasSending) void refresh();
    },
    dismiss(key) {
      if (entries().find((e) => e.key === key)?.phase === "failed") forget(key);
    },
    refresh,
    ensure,
    async setAlt(id, alt) {
      let outcome;
      try {
        outcome = await adapter.setMediaAlt(id, alt);
      } catch (error) {
        if (isStorageError(error) && error.failure.kind === "not-found") {
          drop(id);
          return { ok: false, message: "This image is no longer in the library." };
        }
        return { ok: false, message: `Not saved: ${describe(error)}` };
      }
      if (!outcome.ok) {
        const error = outcome.problem.errors.find((e) => e.pointer === "/alt") ?? outcome.problem.errors[0];
        return { ok: false, message: `Not saved: the alt text ${error?.message ?? outcome.problem.message}.` };
      }
      replace(outcome.value);
      return { ok: true };
    },
    async remove(id) {
      let outcome;
      try {
        outcome = await adapter.deleteMedia(id);
      } catch (error) {
        // Deleted already, from another tab: what was asked is so.
        if (isStorageError(error) && error.failure.kind === "not-found") {
          drop(id);
          return { ok: true };
        }
        return { ok: false, message: `Not deleted: ${describe(error)}` };
      }
      if (!outcome.ok) return { ok: false, inUse: outcome.problem.usedBy };
      drop(id);
      return { ok: true };
    },
    async put(upload) {
      putting += 1;
      let outcome;
      try {
        outcome = await adapter.uploadMedia(upload);
      } catch (error) {
        if (isStorageError(error) && error.failure.kind === "unknown") {
          await refresh();
          return { ok: false, reason: `no answer came from ${inBrowser ? "this browser's storage" : "the CMS"} (${error.failure.message}): it may be in the library or not.` };
        }
        const own = inBrowser || (isStorageError(error) && error.failure.kind === "refused" && error.failure.status === 0);
        return { ok: false, reason: own ? `it could not be kept: ${describe(error)}` : `the CMS refused it: ${describe(error)}` };
      } finally {
        putting -= 1;
      }
      if (!outcome.ok) {
        const said = uploadRefusal(outcome.problem, upload.file, inBrowser);
        return { ok: false, reason: `${said.charAt(0).toLowerCase()}${said.slice(1)}` };
      }
      add(outcome.value);
      return { ok: true, item: outcome.value };
    },
    busy: () => putting > 0 || entries().some((entry) => entry.phase !== "failed"),
  };
}
