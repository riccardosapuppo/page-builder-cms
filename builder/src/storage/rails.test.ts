// The Rails adapter against a fetch that records what it is asked and
// answers what the test says: the request each operation sends, and what
// each kind of answer becomes. Against the real CMS, the same adapter runs
// the battery of contract.ts (rails.rails.test.ts).
import { describe, expect, test } from "vitest";
import { FakeClock, settle } from "../../test/fake-clock.ts";
import type { CollectionDefinition, EntryContent } from "../shared/collection.ts";
import type { PageDocument } from "../shared/document.ts";
import { StorageError, type Failure, type StorageAdapter } from "./adapter.ts";
import { createRailsAdapter, RAILS_ROUTES } from "./rails.ts";

interface Sent {
  method: string;
  url: string;
  contentType: string | null;
  accept: string | null;
  body: string | null;
}

type Reply = { status: number; body?: unknown; text?: string } | Error | "hang";

function fakeFetch(reply: (sent: Sent) => Reply = () => ({ status: 200, body: {} })) {
  const sent: Sent[] = [];
  const signals: AbortSignal[] = [];
  const fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const request: Sent = {
      method: init?.method ?? "(none)",
      url: String(input),
      contentType: headers.get("content-type"),
      accept: headers.get("accept"),
      body: typeof init?.body === "string" ? init.body : null,
    };
    sent.push(request);
    if (init?.signal) signals.push(init.signal);
    const answer = reply(request);
    if (answer === "hang") {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    }
    if (answer instanceof Error) return Promise.reject(answer);
    const text = answer.text ?? (answer.body === undefined ? "" : JSON.stringify(answer.body));
    return Promise.resolve(new Response(answer.status === 204 ? null : text, { status: answer.status }));
  };
  return { fetch, sent, signals };
}

const document: PageDocument = { schemaVersion: 1, title: "A page", sections: [] };
const definition: CollectionDefinition = { name: "News", prefix: "news", fields: [{ key: "day", label: "Day", type: "date", required: true }], sort: { by: "day", direction: "desc" } };
const entry: EntryContent = { title: "Dawn swims", slug: "dawn", values: { day: "2026-05-02" } };

async function failureOf(promise: Promise<unknown>): Promise<Failure> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StorageError) return error.failure;
    throw error;
  }
  throw new Error("the call did not fail");
}

describe("the Rails adapter's requests", () => {
  // Each operation, the request it must send: method, address, body.
  const calls: Array<[string, (a: StorageAdapter) => Promise<unknown>, string, string, unknown]> = [
    ["listPages", (a) => a.listPages(), "GET", "/api/pages", null],
    // The site's parts are answered beside the pages, by the same request.
    ["listPages for the parts", (a) => a.listParts(), "GET", "/api/pages", null],
    ["createPage", (a) => a.createPage({ title: "T", slug: "t" }), "POST", "/api/pages", { title: "T", slug: "t" }],
    ["getPage", (a) => a.getPage(7), "GET", "/api/pages/7", null],
    ["updatePage", (a) => a.updatePage(7, { home: true }), "PATCH", "/api/pages/7", { home: true }],
    ["getDraft", (a) => a.getDraft(7), "GET", "/api/pages/7/draft", null],
    ["saveDraft", (a) => a.saveDraft(7, { revision: 3, document, saveId: "s-1" }), "PUT", "/api/pages/7/draft", { revision: 3, document, saveId: "s-1" }],
    ["publishPage", (a) => a.publish(7), "POST", "/api/pages/7/publish", null],
    ["publishPage at a revision", (a) => a.publish(7, { revision: 4 }), "POST", "/api/pages/7/publish", { revision: 4 }],
    ["listSchedules", (a) => a.listSchedules(7), "GET", "/api/pages/7/schedules", null],
    ["schedulePublish", (a) => a.schedulePublish(7, { revision: 4, at: "2026-10-05T07:15:00.000Z" }), "POST", "/api/pages/7/schedules", { revision: 4, at: "2026-10-05T07:15:00.000Z" }],
    ["cancelSchedule", (a) => a.cancelScheduledPublish(7, 12), "POST", "/api/pages/7/schedules/12/cancel", null],
    ["listVersions", (a) => a.listVersions(7), "GET", "/api/pages/7/versions", null],
    ["saveVersion", (a) => a.saveVersion(7), "POST", "/api/pages/7/versions", null],
    ["saveVersion with a name", (a) => a.saveVersion(7, { name: "Before" }), "POST", "/api/pages/7/versions", { name: "Before" }],
    ["getVersion", (a) => a.getVersion(7, 2), "GET", "/api/pages/7/versions/2", null],
    ["restoreVersion", (a) => a.restoreVersion(7, 2), "POST", "/api/pages/7/versions/2/restore", null],
    ["listResponses", (a) => a.listResponses(7), "GET", "/api/pages/7/responses", null],
    ["listResponses of a form, before a response", (a) => a.listResponses(7, { form: "join form/x", before: 41 }), "GET", "/api/pages/7/responses?form=join+form%2Fx&before=41", null],
    ["listResponses with only before", (a) => a.listResponses(7, { before: 41 }), "GET", "/api/pages/7/responses?before=41", null],
    ["getResponse", (a) => a.getResponse(7, 41), "GET", "/api/pages/7/responses/41", null],
    ["deleteResponse", (a) => a.deleteResponse(7, 41), "DELETE", "/api/pages/7/responses/41", null],
    ["listMedia", (a) => a.listMedia(), "GET", "/api/media", null],
    ["setMediaAlt", (a) => a.setMediaAlt("abc_D-9", "A pier"), "PATCH", "/api/media/abc_D-9", { alt: "A pier" }],
    ["deleteMedia", (a) => a.deleteMedia("abc_D-9"), "DELETE", "/api/media/abc_D-9", null],
    ["getSiteStyle", (a) => a.getSiteStyle(), "GET", "/api/site-style", null],
    ["setSiteStyle", (a) => a.setSiteStyle({ palette: { primary: "sea" }, typeScale: "balanced" }), "PUT", "/api/site-style", { palette: { primary: "sea" }, typeScale: "balanced" }],
    ["getSite", (a) => a.getSite(), "GET", "/api/site", null],
    ["listCollections", (a) => a.listCollections(), "GET", "/api/collections", null],
    ["createCollection", (a) => a.createCollection(definition), "POST", "/api/collections", definition],
    ["getCollection", (a) => a.getCollection(3), "GET", "/api/collections/3", null],
    ["updateCollection", (a) => a.updateCollection(3, { name: "Newsroom" }), "PATCH", "/api/collections/3", { name: "Newsroom" }],
    ["deleteCollection", (a) => a.deleteCollection(3), "DELETE", "/api/collections/3", null],
    ["listEntries", (a) => a.listEntries(3), "GET", "/api/collections/3/entries", null],
    ["listEntries searched and ordered", (a) => a.listEntries(3, { q: "dawn swims/é", order: "-day" }), "GET", "/api/collections/3/entries?q=dawn+swims%2F%C3%A9&order=-day", null],
    ["listEntries with no words to look for", (a) => a.listEntries(3, { q: "" }), "GET", "/api/collections/3/entries", null],
    ["createEntry", (a) => a.createEntry(3, entry), "POST", "/api/collections/3/entries", entry],
    ["getEntry", (a) => a.getEntry(3, 9), "GET", "/api/collections/3/entries/9", null],
    ["saveEntry", (a) => a.saveEntry(3, 9, { ...entry, revision: 2, saveId: "e-1" }), "PUT", "/api/collections/3/entries/9", { revision: 2, saveId: "e-1", ...entry }],
    ["deleteEntry", (a) => a.deleteEntry(3, 9), "DELETE", "/api/collections/3/entries/9", null],
    ["publishEntry", (a) => a.publishEntry(3, 9), "POST", "/api/collections/3/entries/9/publish", null],
    ["publishEntry at a revision", (a) => a.publishEntry(3, 9, { revision: 2 }), "POST", "/api/collections/3/entries/9/publish", { revision: 2 }],
    ["unpublishEntry", (a) => a.unpublishEntry(3, 9), "POST", "/api/collections/3/entries/9/unpublish", null],
  ];

  test.each(calls)("%s sends its own method, address and body", async (_name, run, method, path, body) => {
    const { fetch, sent } = fakeFetch(() => ({ status: 500 }));
    await run(createRailsAdapter({ apiBase: "/api", fetch })).catch(() => undefined);
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect([request!.method, request!.url]).toEqual([method, path]);
    expect(request!.accept).toBe("application/json");
    // Every write says it is JSON, even with no body: the CMS answers 415
    // to any other.
    expect(request!.contentType).toBe(method === "GET" || method === "DELETE" ? null : "application/json");
    expect(request!.body === null ? null : JSON.parse(request!.body)).toEqual(body);
  });

  test("covers every route but the upload's first step, which DirectUpload sends", () => {
    const named = new Set(calls.map(([name]) => name.split(" ")[0]));
    expect(Object.keys(RAILS_ROUTES).filter((id) => !named.has(id))).toEqual(["startUpload", "createMedia"]);
  });

  test("goes to the address VITE_API_BASE gives, absolute or not", async () => {
    const { fetch, sent } = fakeFetch(() => ({ status: 200, body: { pages: [] } }));
    await createRailsAdapter({ apiBase: "http://127.0.0.1:3901/api/", fetch }).listPages();
    await createRailsAdapter({ fetch }).listPages();
    expect(sent.map((s) => s.url)).toEqual(["http://127.0.0.1:3901/api/pages", "/api/pages"]);
  });

  test("declares every optional operation, since the CMS has them all, and no smaller copies of images", () => {
    expect(createRailsAdapter({ fetch: fakeFetch().fetch }).capabilities).toEqual({ publish: true, schedule: true, responses: true, imageVariants: false, livePages: true, collections: true });
  });
});

describe("the site's parts", () => {
  test("are the parts the page list answers, the pages its pages", async () => {
    const summary = (id: number, kind: string, slug: string | null) => ({ id, kind, title: kind, slug, home: false, revision: 0, updatedAt: "2026-10-12T08:00:00.000Z", published: null, scheduled: null, links: { preview: `/preview/${id}`, live: null } });
    const body = { pages: [summary(1, "page", "home")], parts: [summary(4, "header", null), summary(5, "footer", null)] };
    const { fetch } = fakeFetch(() => ({ status: 200, body }));
    const adapter = createRailsAdapter({ fetch });
    expect(await adapter.listParts()).toEqual(body.parts);
    expect(await adapter.listPages()).toEqual(body.pages);
  });
});

describe("the Rails adapter's answers", () => {
  test("a save at the draft's revision, a conflict and an invalid document are each an Outcome", async () => {
    const answers: Reply[] = [
      { status: 200, body: { revision: 4, lastSaveId: "s-1", updatedAt: "2026-10-02T08:00:00.000Z" } },
      { status: 409, body: { error: "conflict", message: "moved", currentRevision: 5, lastSaveId: "other" } },
      { status: 422, body: { error: "invalid_document", message: "no", errors: [{ pointer: "/document/title", keyword: "minLength", blockPointer: null, message: "short" }] } },
    ];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    const save = { revision: 3, document, saveId: "s-1" };
    expect(await adapter.saveDraft(1, save)).toEqual({ ok: true, value: { revision: 4, lastSaveId: "s-1", updatedAt: "2026-10-02T08:00:00.000Z" } });
    expect(await adapter.saveDraft(1, save)).toEqual({ ok: false, problem: { kind: "conflict", message: "moved", currentRevision: 5, lastSaveId: "other" } });
    expect(await adapter.saveDraft(1, save)).toEqual({
      ok: false,
      problem: { kind: "invalid", code: "invalid_document", message: "no", errors: [{ pointer: "/document/title", keyword: "minLength", blockPointer: null, message: "short" }] },
    });
  });

  test("an entry's save, a conflict and a refused value are each an Outcome; an order the list does not take is refused", async () => {
    const saved = { id: 9, collectionId: 3, ...entry, revision: 3, lastSaveId: "e-1", createdAt: "2026-10-15T08:00:00.000Z", updatedAt: "2026-10-15T09:00:00.000Z", published: null };
    const answers: Reply[] = [
      { status: 200, body: saved },
      { status: 409, body: { error: "conflict", message: "The entry has changed since the revision sent.", currentRevision: 4, lastSaveId: "other" } },
      { status: 422, body: { error: "invalid_request", message: "no", errors: [{ pointer: "/values/day", keyword: "dateExists", blockPointer: null, message: "is not a day that exists" }] } },
      { status: 400, body: { error: "invalid_query", message: "The collection has no date or number field summary to order its entries by.", parameter: "order" } },
    ];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    const save = { ...entry, revision: 2, saveId: "e-1" };
    expect(await adapter.saveEntry(3, 9, save)).toEqual({ ok: true, value: saved });
    expect(await adapter.saveEntry(3, 9, save)).toEqual({ ok: false, problem: { kind: "conflict", message: "The entry has changed since the revision sent.", currentRevision: 4, lastSaveId: "other" } });
    expect(await adapter.saveEntry(3, 9, save)).toEqual({
      ok: false,
      problem: { kind: "invalid", code: "invalid_request", message: "no", errors: [{ pointer: "/values/day", keyword: "dateExists", blockPointer: null, message: "is not a day that exists" }] },
    });
    expect(await failureOf(adapter.listEntries(3, { order: "summary" }))).toEqual({
      kind: "refused", status: 400, code: "invalid_query", message: "The collection has no date or number field summary to order its entries by.",
    });
  });

  test("a schedule, a conflict and a time refused are each an Outcome; so is a cancel that comes too late", async () => {
    const schedule = { id: 12, at: "2026-10-05T07:15:00.000Z", revision: 4, versionNumber: 9, state: "pending", createdAt: "2026-10-04T09:00:00.000Z", settledAt: null, publishedVersionNumber: null };
    const version = { number: 9, reason: "scheduled", name: null, restoredFrom: null, createdAt: "2026-10-04T09:00:00.000Z", published: false };
    const published = { ...schedule, state: "published", settledAt: "2026-10-05T07:15:01.000Z", publishedVersionNumber: 10 };
    const answers: Reply[] = [
      { status: 201, body: { schedule, version, replaced: null } },
      { status: 409, body: { error: "conflict", message: "moved", currentRevision: 5, lastSaveId: "other" } },
      { status: 422, body: { error: "invalid_request", message: "no", errors: [{ pointer: "/at", keyword: "inThePast", blockPointer: null, message: "must be later than now" }] } },
      { status: 200, body: { schedule: { ...schedule, state: "cancelled", settledAt: "2026-10-04T10:00:00.000Z" } } },
      { status: 409, body: { error: "not_pending", message: "too late", schedule: published } },
      { status: 200, body: { schedules: [published] } },
    ];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    const request = { revision: 4, at: "2026-10-05T07:15:00.000Z" };
    expect(await adapter.schedulePublish(7, request)).toEqual({ ok: true, value: { schedule, version, replaced: null } });
    expect(await adapter.schedulePublish(7, request)).toEqual({ ok: false, problem: { kind: "conflict", message: "moved", currentRevision: 5, lastSaveId: "other" } });
    expect(await adapter.schedulePublish(7, request)).toMatchObject({ ok: false, problem: { kind: "invalid", code: "invalid_request", errors: [{ pointer: "/at" }] } });
    expect(await adapter.cancelScheduledPublish(7, 12)).toMatchObject({ ok: true, value: { id: 12, state: "cancelled" } });
    expect(await adapter.cancelScheduledPublish(7, 12)).toEqual({ ok: false, problem: { kind: "not-pending", message: "too late", schedule: published } });
    expect(await adapter.listSchedules(7)).toEqual([published]);
  });

  test("an image in use is an Outcome naming who uses it; a deleted one is null", async () => {
    const usedBy = { pages: [{ id: 1, title: "Home", slug: "home" }], versions: [{ pageId: 1, number: 2 }], entries: [{ collectionId: 3, id: 9, title: "Dawn swims" }] };
    const answers: Reply[] = [{ status: 409, body: { error: "media_in_use", message: "used", usedBy } }, { status: 204 }];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    expect(await adapter.deleteMedia("m1")).toEqual({ ok: false, problem: { kind: "in-use", message: "used", usedBy } });
    expect(await adapter.deleteMedia("m1")).toEqual({ ok: true, value: null });
  });

  test("a response list and a response are the API's answers; a deleted one is nothing, one already gone is not-found, a query refused is refused", async () => {
    const list = { responses: [{ id: 41, formId: "join-form", versionNumber: 2, submittedAt: "2026-10-05T09:00:00.000Z", excerpt: null }], next: null, forms: [{ formId: "join-form", count: 1 }] };
    const one = { id: 41, formId: "join-form", versionNumber: 2, submittedAt: "2026-10-05T09:00:00.000Z", fields: [], answers: { name: "<b>Ann</b>" } };
    const answers: Reply[] = [
      { status: 200, body: list },
      { status: 200, body: one },
      { status: 204 },
      { status: 404, body: { error: "not_found", message: "nothing" } },
      { status: 400, body: { error: "invalid_query", message: "no", parameter: "before" } },
    ];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    expect(await adapter.listResponses(7)).toEqual(list);
    expect(await adapter.getResponse(7, 41)).toEqual(one);
    expect(await adapter.deleteResponse(7, 41)).toBeUndefined();
    expect(await failureOf(adapter.deleteResponse(7, 41))).toEqual({ kind: "not-found", message: "nothing" });
    expect(await failureOf(adapter.listResponses(7, { before: 41 }))).toEqual({ kind: "refused", status: 400, code: "invalid_query", message: "no" });
  });

  test("a refusal no retry changes is thrown as refused, a missing page as not-found", async () => {
    const answers: Reply[] = [
      { status: 403, body: { error: "forbidden_origin", message: "not from here" } },
      { status: 415, body: { error: "unsupported_media_type", message: "json please" } },
      { status: 400, body: { error: "malformed_json", message: "bad" } },
      { status: 404, body: { error: "not_found", message: "nothing" } },
      // A refusal the operation is not described with is not turned into
      // one it is: a 409 to a page read.
      { status: 409, body: { error: "conflict", message: "odd", currentRevision: 1, lastSaveId: null } },
    ];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    expect(await failureOf(adapter.saveDraft(1, { revision: 0, document, saveId: "s" }))).toEqual({ kind: "refused", status: 403, code: "forbidden_origin", message: "not from here" });
    expect(await failureOf(adapter.createPage({ title: "T", slug: "t" }))).toMatchObject({ kind: "refused", status: 415, code: "unsupported_media_type" });
    expect(await failureOf(adapter.publish(1))).toMatchObject({ kind: "refused", status: 400, code: "malformed_json" });
    expect(await failureOf(adapter.getDraft(99))).toEqual({ kind: "not-found", message: "nothing" });
    expect(await failureOf(adapter.getPage(1))).toMatchObject({ kind: "refused", status: 409, code: "conflict" });
  });

  test("no answer that says what happened is an unknown outcome: no network, a 5xx, a page that is not the API's", async () => {
    const answers: Reply[] = [
      new TypeError("fetch failed"),
      { status: 500, body: { error: "internal_error", message: "failed" } },
      { status: 502, text: "<html>Bad gateway</html>" },
      { status: 200, text: "<html>Sign in</html>" },
      { status: 200, body: [] },
      { status: 201, body: { revision: 1 } },
      { status: 422, text: "<html>Nope</html>" },
    ];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    const save = () => adapter.saveDraft(1, { revision: 0, document, saveId: "s" });
    expect(await failureOf(save())).toMatchObject({ kind: "unknown", cause: "network", status: null });
    expect(await failureOf(save())).toMatchObject({ kind: "unknown", cause: "server", status: 500 });
    expect(await failureOf(save())).toMatchObject({ kind: "unknown", cause: "server", status: 502 });
    expect(await failureOf(save())).toMatchObject({ kind: "unknown", cause: "unreadable", status: 200 });
    expect(await failureOf(save())).toMatchObject({ kind: "unknown", cause: "unreadable", status: 200 });
    // A success, but not the one a save gets.
    expect(await failureOf(save())).toMatchObject({ kind: "unknown", cause: "unreadable", status: 201 });
    expect(await failureOf(save())).toMatchObject({ kind: "unknown", cause: "unreadable", status: 422 });
  });

  test("a call past its time, on the injected clock, is abandoned and its outcome unknown", async () => {
    const clock = new FakeClock();
    const { fetch, signals } = fakeFetch(() => "hang");
    const adapter = createRailsAdapter({ fetch, clock, timeoutMs: 10_000 });
    const pending = failureOf(adapter.saveDraft(1, { revision: 0, document, saveId: "s" }));
    await clock.advance(9_999);
    expect(signals[0]!.aborted).toBe(false);
    await clock.advance(1);
    expect(signals[0]!.aborted).toBe(true);
    expect(await pending).toMatchObject({ kind: "unknown", cause: "timeout", message: "PUT /pages/{id}/draft got no answer within 10 s." });
    expect(clock.pending).toBe(0);
  });

  test("a call its caller abandons is abandoned too, with its outcome unknown", async () => {
    const clock = new FakeClock();
    const { fetch, signals } = fakeFetch(() => "hang");
    const adapter = createRailsAdapter({ fetch, clock });
    const caller = new AbortController();
    const pending = failureOf(adapter.publish(1, {}, { signal: caller.signal }));
    await settle();
    caller.abort();
    expect(signals[0]!.aborted).toBe(true);
    expect(await pending).toMatchObject({ kind: "unknown", cause: "timeout", message: "POST /pages/{id}/publish was abandoned before its answer came." });
    expect(clock.pending).toBe(0);
  });

  test("an image's address is made absolute on the CMS's origin when the API is on another", async () => {
    const item = { id: "m1", alt: "", width: 3, height: 2, contentType: "image/png", byteSize: 70, filename: "a.png", url: "/rails/active_storage/blobs/proxy/x/a.png", createdAt: "2026-10-02T08:00:00.000Z" };
    const { fetch } = fakeFetch(() => ({ status: 200, body: { media: [item] } }));
    const [far] = await createRailsAdapter({ apiBase: "http://127.0.0.1:3901/api", fetch }).listMedia();
    const [near] = await createRailsAdapter({ apiBase: "/api", fetch }).listMedia();
    expect(far!.url).toBe("http://127.0.0.1:3901/rails/active_storage/blobs/proxy/x/a.png");
    expect(near!.url).toBe("/rails/active_storage/blobs/proxy/x/a.png");
  });
});
