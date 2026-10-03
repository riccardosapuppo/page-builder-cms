// The Rails adapter against a fetch that records what it is asked and
// answers what the test says: the request each operation sends, and what
// each kind of answer becomes. Against the real CMS, the same adapter runs
// the battery of contract.ts (rails.rails.test.ts).
import { describe, expect, test } from "vitest";
import { FakeClock, settle } from "../../test/fake-clock.ts";
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
    ["createPage", (a) => a.createPage({ title: "T", slug: "t" }), "POST", "/api/pages", { title: "T", slug: "t" }],
    ["getPage", (a) => a.getPage(7), "GET", "/api/pages/7", null],
    ["updatePage", (a) => a.updatePage(7, { home: true }), "PATCH", "/api/pages/7", { home: true }],
    ["getDraft", (a) => a.getDraft(7), "GET", "/api/pages/7/draft", null],
    ["saveDraft", (a) => a.saveDraft(7, { revision: 3, document, saveId: "s-1" }), "PUT", "/api/pages/7/draft", { revision: 3, document, saveId: "s-1" }],
    ["publishPage", (a) => a.publish(7), "POST", "/api/pages/7/publish", null],
    ["publishPage at a revision", (a) => a.publish(7, { revision: 4 }), "POST", "/api/pages/7/publish", { revision: 4 }],
    ["listVersions", (a) => a.listVersions(7), "GET", "/api/pages/7/versions", null],
    ["saveVersion", (a) => a.saveVersion(7), "POST", "/api/pages/7/versions", null],
    ["saveVersion with a name", (a) => a.saveVersion(7, { name: "Before" }), "POST", "/api/pages/7/versions", { name: "Before" }],
    ["getVersion", (a) => a.getVersion(7, 2), "GET", "/api/pages/7/versions/2", null],
    ["restoreVersion", (a) => a.restoreVersion(7, 2), "POST", "/api/pages/7/versions/2/restore", null],
    ["listMedia", (a) => a.listMedia(), "GET", "/api/media", null],
    ["setMediaAlt", (a) => a.setMediaAlt("abc_D-9", "A pier"), "PATCH", "/api/media/abc_D-9", { alt: "A pier" }],
    ["deleteMedia", (a) => a.deleteMedia("abc_D-9"), "DELETE", "/api/media/abc_D-9", null],
    ["getSiteStyle", (a) => a.getSiteStyle(), "GET", "/api/site-style", null],
    ["setSiteStyle", (a) => a.setSiteStyle({ palette: { primary: "sea" }, typeScale: "balanced" }), "PUT", "/api/site-style", { palette: { primary: "sea" }, typeScale: "balanced" }],
    ["getSite", (a) => a.getSite(), "GET", "/api/site", null],
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

  test("asks nobody for what its capabilities say it lacks", async () => {
    const { fetch, sent } = fakeFetch();
    const adapter = createRailsAdapter({ fetch });
    expect(adapter.capabilities).toEqual({ publish: true, schedule: false, responses: false, imageVariants: false });
    expect(await failureOf(adapter.schedulePublish(1, { at: "2026-10-03T08:00:00.000Z" }))).toMatchObject({ kind: "unsupported", operation: "schedule" });
    expect(await failureOf(adapter.cancelScheduledPublish(1))).toMatchObject({ kind: "unsupported", operation: "schedule" });
    expect(await failureOf(adapter.listResponses())).toMatchObject({ kind: "unsupported", operation: "responses" });
    expect(sent).toEqual([]);
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

  test("an image in use is an Outcome naming who uses it; a deleted one is null", async () => {
    const usedBy = { pages: [{ id: 1, title: "Home", slug: "home" }], versions: [{ pageId: 1, number: 2 }] };
    const answers: Reply[] = [{ status: 409, body: { error: "media_in_use", message: "used", usedBy } }, { status: 204 }];
    const { fetch } = fakeFetch(() => answers.shift()!);
    const adapter = createRailsAdapter({ fetch });
    expect(await adapter.deleteMedia("m1")).toEqual({ ok: false, problem: { kind: "in-use", message: "used", usedBy } });
    expect(await adapter.deleteMedia("m1")).toEqual({ ok: true, value: null });
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
