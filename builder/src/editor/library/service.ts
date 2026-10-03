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
import { isStorageError, type MediaItem, type MediaUse, type StorageAdapter } from "../../storage/adapter.ts";
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
  setAlt(id: string, alt: string): Promise<AltOutcome>;
  remove(id: string): Promise<RemoveOutcome>;
  // An upload is waiting, being made ready or on its way.
  busy(): boolean;
}

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

export function createMediaService(options: { adapter: MediaAdapter; ui: UiStore; prepare?: Prepare; urls?: ObjectUrls }): MediaService {
  const { adapter, ui } = options;
  const prepare = options.prepare ?? prepareImage;
  const urls = options.urls ?? browserUrls;
  const uploads = createStore<{ entries: readonly UploadEntry[] }>()(() => ({ entries: [] }));
  const jobs = new Map<string, Job>();
  let made = 0;
  let running = false;

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
        fail(key, `No answer from the CMS (${error.failure.message}): it may be in the library or not. The list was read again; look for it before uploading it again.`);
        await refresh();
        return;
      }
      fail(key, `The CMS refused it: ${describe(error)}`);
      return;
    }
    if (job.cancelled) return;
    if (!outcome.ok) {
      fail(key, uploadRefusal(outcome.problem, file));
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
    busy: () => entries().some((entry) => entry.phase !== "failed"),
  };
}
