// The media library's work against a storage adapter of the test's making:
// uploads one at a time, each made ready first and sent as made ready,
// with its progress; what the preparation or the CMS refuses, said; an
// answer that never came, and the library read again; an upload stopped;
// an image's alt text; a delete the CMS refuses, with who shows the image.
import { describe, expect, test } from "vitest";
import { StorageError, type InUse, type Invalid, type MediaItem, type Outcome, type Upload, type UploadOptions } from "../../storage/adapter.ts";
import { createUiStore } from "../ui-store.ts";
import type { Preparation } from "./resize.ts";
import { createMediaService, type MediaAdapter, type ObjectUrls } from "./service.ts";

const T = "2026-10-03T08:00:00.000Z";
const item = (id: string, alt = ""): MediaItem => ({ id, alt, width: 800, height: 600, contentType: "image/png", byteSize: 1000, filename: `${id}.png`, url: `/media/${id}.png`, createdAt: T });

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((done) => setTimeout(done, 0));

function rig(library: MediaItem[] = []) {
  const ui = createUiStore();
  ui.getState().setMedia(library);
  const sent: Array<{ upload: Upload; options: UploadOptions | undefined; answer: Deferred<Outcome<MediaItem, Invalid>> }> = [];
  const prepared: string[] = [];
  const refusals = new Map<string, string>();
  let listed = 0;
  let listAnswer: MediaItem[] | null = null;
  const alts: Array<[string, string]> = [];
  const deletes: string[] = [];
  let altAnswer: (id: string, alt: string) => Promise<Outcome<MediaItem, Invalid>> = async (id, alt) => ({ ok: true, value: { ...item(id), alt } });
  let deleteAnswer: (id: string) => Promise<Outcome<null, InUse>> = async () => ({ ok: true, value: null });
  const adapter: MediaAdapter = {
    capabilities: { publish: true, schedule: false, responses: false, imageVariants: false },
    listMedia: async () => {
      listed += 1;
      return listAnswer ?? [...ui.getState().media.values()];
    },
    uploadMedia: (upload, options) => {
      const answer = deferred<Outcome<MediaItem, Invalid>>();
      sent.push({ upload, options, answer });
      options?.signal?.addEventListener("abort", () => answer.reject(new StorageError({ kind: "unknown", cause: "timeout", status: null, message: "abandoned" })));
      return answer.promise;
    },
    setMediaAlt: (id, alt) => {
      alts.push([id, alt]);
      return altAnswer(id, alt);
    },
    deleteMedia: (id) => {
      deletes.push(id);
      return deleteAnswer(id);
    },
  };
  // Made ready: the same name, "-ready" added, 600 by 400; a file named in
  // `held` waits until the test lets it go.
  const held = new Map<string, Deferred<void>>();
  const prepare = async (file: File): Promise<Preparation> => {
    prepared.push(file.name);
    await held.get(file.name)?.promise;
    const refused = refusals.get(file.name);
    if (refused) return { ok: false, reason: refused };
    return { ok: true, image: { file: new File(["ready bytes"], `${file.name}-ready`, { type: "image/png" }), width: 600, height: 400, resized: true } };
  };
  const made: string[] = [];
  const revoked: string[] = [];
  const urls: ObjectUrls = {
    create: (file) => {
      const url = `blob:${(file as File).name}`;
      made.push(url);
      return url;
    },
    revoke: (url) => revoked.push(url),
  };
  const service = createMediaService({ adapter, ui, prepare, urls });
  return {
    ui, service, sent, prepared, refusals, alts, deletes, made, revoked, held,
    listed: () => listed,
    listWith: (items: MediaItem[]) => {
      listAnswer = items;
    },
    altWith: (answer: typeof altAnswer) => {
      altAnswer = answer;
    },
    deleteWith: (answer: typeof deleteAnswer) => {
      deleteAnswer = answer;
    },
    ids: () => [...ui.getState().media.keys()],
    entries: () => service.uploads.getState().entries,
  };
}

const file = (name: string) => new File(["original bytes, larger"], name, { type: "image/png" });

describe("uploads", () => {
  test("go one at a time, made ready first and sent as made ready; each image the CMS takes goes to the head of the library", async () => {
    const r = rig([item("old", "An old one")]);
    const added: string[] = [];
    r.service.upload([file("a.png"), file("b.png")], (made) => added.push(made.id));
    expect(r.entries().map((e) => [e.name, e.phase])).toEqual([["a.png", "preparing"], ["b.png", "waiting"]]);
    await settle();
    // The first is on its way, as made ready; the second waits for it.
    expect(r.sent).toHaveLength(1);
    expect(r.prepared).toEqual(["a.png"]);
    const first = r.sent[0]!;
    expect([first.upload.file.name, first.upload.width, first.upload.height]).toEqual(["a.png-ready", 600, 400]);
    expect(r.entries().map((e) => [e.name, e.phase, e.preview])).toEqual([["a.png", "uploading", "blob:a.png-ready"], ["b.png", "waiting", null]]);
    expect(r.service.busy()).toBe(true);

    first.options?.onProgress?.(4, 11);
    expect(r.entries()[0]).toMatchObject({ sent: 4, total: 11 });

    first.answer.resolve({ ok: true, value: item("a1") });
    await settle();
    expect(r.ids()).toEqual(["a1", "old"]);
    expect(added).toEqual(["a1"]);
    expect(r.revoked).toEqual(["blob:a.png-ready"]);
    expect(r.sent).toHaveLength(2);
    r.sent[1]!.answer.resolve({ ok: true, value: item("b1") });
    await settle();
    expect(r.ids()).toEqual(["b1", "a1", "old"]);
    expect(r.entries()).toEqual([]);
    expect(r.service.busy()).toBe(false);
  });

  test("a file the editor will not make ready is refused with its reason, and the next one goes on", async () => {
    const r = rig();
    r.refusals.set("drawing.svg", "SVG images are not taken.");
    r.service.upload([file("drawing.svg"), file("photo.png")]);
    await settle();
    expect(r.entries().map((e) => [e.name, e.phase, e.reason])).toEqual([["drawing.svg", "failed", "SVG images are not taken."], ["photo.png", "uploading", null]]);
    expect(r.sent.map((s) => s.upload.file.name)).toEqual(["photo.png-ready"]);
    // A refused upload is no reason to keep the tab open.
    r.sent[0]!.answer.resolve({ ok: true, value: item("p1") });
    await settle();
    expect(r.service.busy()).toBe(false);
    r.service.dismiss(r.entries()[0]!.key);
    expect(r.entries()).toEqual([]);
  });

  test("the CMS's refusal is said as the CMS's, and nothing is added", async () => {
    const r = rig();
    r.service.upload([file("huge.png")]);
    await settle();
    r.sent[0]!.answer.resolve({ ok: false, problem: { kind: "invalid", code: "invalid_request", message: "The request is not valid.", errors: [{ pointer: "/file", keyword: "maximum", blockPointer: null, message: "must be at most 10485760" }] } });
    await settle();
    expect(r.entries()[0]).toMatchObject({ phase: "failed", reason: expect.stringMatching(/^The CMS refused it: ready to go up it is 11 bytes, and the CMS takes images up to 10 MB/) });
    expect(r.ids()).toEqual([]);
  });

  test("with no answer, it may be in the library or not: it says so, and reads the library again", async () => {
    const r = rig();
    r.service.upload([file("lost.png")]);
    await settle();
    r.listWith([item("maybe")]);
    r.sent[0]!.answer.reject(new StorageError({ kind: "unknown", cause: "network", status: null, message: "POST /media could not reach the CMS" }));
    await settle();
    await settle();
    expect(r.entries()[0]).toMatchObject({ phase: "failed", reason: expect.stringMatching(/^No answer from the CMS \(POST \/media could not reach the CMS\): it may be in the library or not/) });
    expect(r.listed()).toBe(1);
    expect(r.ids()).toEqual(["maybe"]);
  });

  test("stopped on its way: the request is abandoned, nothing added, and the library read again; stopped while waiting: never made ready", async () => {
    const r = rig();
    const [sending, waiting] = r.service.upload([file("one.png"), file("two.png")]);
    await settle();
    r.service.cancel(waiting!);
    r.service.cancel(sending!);
    expect(r.sent[0]!.options?.signal?.aborted).toBe(true);
    await settle();
    expect(r.entries()).toEqual([]);
    expect(r.prepared).toEqual(["one.png"]);
    expect(r.sent).toHaveLength(1);
    expect(r.ids()).toEqual([]);
    expect(r.listed()).toBe(1);
    expect(r.revoked).toEqual(["blob:one.png-ready"]);
  });

  test("stopped while it is made ready: it is never sent, and the next one goes", async () => {
    const r = rig();
    const ready = deferred<void>();
    r.held.set("slow.png", ready);
    const [slow] = r.service.upload([file("slow.png"), file("next.png")]);
    await settle();
    expect(r.entries()[0]).toMatchObject({ name: "slow.png", phase: "preparing" });
    r.service.cancel(slow!);
    ready.resolve();
    await settle();
    expect(r.sent.map((s) => s.upload.file.name)).toEqual(["next.png-ready"]);
    expect(r.entries().map((e) => e.name)).toEqual(["next.png"]);
  });
});

describe("alt text and deleting", () => {
  test("an alt text kept by the CMS replaces the image's in its place; a refused one says why; one of an image gone takes it away", async () => {
    const r = rig([item("a", "Before"), item("b")]);
    expect(await r.service.setAlt("b", "The buoy line")).toEqual({ ok: true });
    expect([...r.ui.getState().media.values()].map((m) => [m.id, m.alt])).toEqual([["a", "Before"], ["b", "The buoy line"]]);

    r.altWith(async () => ({ ok: false, problem: { kind: "invalid", code: "invalid_request", message: "The request is not valid.", errors: [{ pointer: "/alt", keyword: "invalid", blockPointer: null, message: "must be empty, or one line of text with a visible character, at most 300 characters" }] } }));
    expect(await r.service.setAlt("a", "x".repeat(301))).toEqual({ ok: false, message: "Not saved: the alt text must be empty, or one line of text with a visible character, at most 300 characters." });
    expect(r.ui.getState().media.get("a")?.alt).toBe("Before");

    r.altWith(async () => {
      throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
    });
    expect(await r.service.setAlt("a", "Again")).toEqual({ ok: false, message: "This image is no longer in the library." });
    expect(r.ids()).toEqual(["b"]);
  });

  test("a delete takes the image out of the library; one the CMS refuses says who shows it and keeps it; one already gone is done", async () => {
    const r = rig([item("a"), item("b"), item("c")]);
    expect(await r.service.remove("a")).toEqual({ ok: true });
    expect(r.ids()).toEqual(["b", "c"]);

    const usedBy = { pages: [{ id: 1, title: "Home", slug: "home" }], versions: [{ pageId: 1, number: 3 }] };
    r.deleteWith(async () => ({ ok: false, problem: { kind: "in-use", message: "Pages still use this image.", usedBy } }));
    expect(await r.service.remove("b")).toEqual({ ok: false, inUse: usedBy });
    expect(r.ids()).toEqual(["b", "c"]);

    r.deleteWith(async () => {
      throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
    });
    expect(await r.service.remove("c")).toEqual({ ok: true });
    expect(r.ids()).toEqual(["b"]);

    r.deleteWith(async () => {
      throw new StorageError({ kind: "unknown", cause: "server", status: 500, message: "DELETE /media/{id} failed on the server (500)." });
    });
    expect(await r.service.remove("b")).toEqual({ ok: false, message: "Not deleted: DELETE /media/{id} failed on the server (500)." });
    expect(r.deletes).toEqual(["a", "b", "c", "b"]);
  });

  test("the storage's word on image variants is the service's", () => {
    expect(rig().service.imageVariants).toBe(false);
  });
});

describe("images a page names that the library has not got", () => {
  test("are looked for with one read of the library, said as looked for meanwhile, and one gone is not asked for again", async () => {
    const r = rig([item("here")]);
    // The CMS has an image another tab uploaded; "gone" it has not.
    r.listWith([item("other"), item("here")]);
    r.service.ensure(new Set(["here", "other", "gone"]));
    expect([...r.ui.getState().mediaLooking]).toEqual(["other", "gone"]);
    await settle();
    expect(r.listed()).toBe(1);
    expect(r.ids()).toEqual(["other", "here"]);
    expect([...r.ui.getState().mediaLooking]).toEqual([]);
    r.service.ensure(new Set(["here", "other", "gone"]));
    await settle();
    expect(r.listed()).toBe(1);
  });

  test("ids met while a read is on its way are read for once it is done", async () => {
    const r = rig([]);
    r.listWith([item("a"), item("b")]);
    r.service.ensure(new Set(["a"]));
    r.service.ensure(new Set(["b"]));
    expect([...r.ui.getState().mediaLooking]).toEqual(["a", "b"]);
    await settle();
    await settle();
    expect(r.listed()).toBe(2);
    expect(r.ids()).toEqual(["a", "b"]);
    expect([...r.ui.getState().mediaLooking]).toEqual([]);
  });
});
