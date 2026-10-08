// The behaviour every storage adapter must show, written against the
// interface of adapter.ts and nothing else, so it runs unchanged on each:
// the Rails adapter now (rails.rails.test.ts, against a CMS the run starts
// for itself), the browser's in stage 6 (with two pages of one browser as
// the two tabs). It knows no test runner either: the runner hands it its
// expect, and runs each case as a test of its own.
//
// A case says which optional operations it needs; a runner skips, and
// counts as skipped, a case its adapter's capabilities lack. The cases of
// form responses have a visitor send the forms through the runner
// (ContractEnv.sendForm), since no adapter sends them. The scheduling
// cases run on the real clock: one waits a few seconds for a publish set
// to happen, watching the page until it does.
//
// Every case makes the pages it uses, under names no other case takes, so
// the cases share one store and run in any order. The media library and
// the site style are one per store: a case reads the library for the
// items it made, and puts the site style back as it found it.
import {
  errorsByBlock,
  isStorageError,
  OPTIONAL_OPERATIONS,
  RESPONSES_PER_PART,
  StorageError,
  type DraftSave,
  type Failure,
  type OptionalOperation,
  type Outcome,
  type PageSummary,
  type StorageAdapter,
} from "./adapter.ts";
import { createAutosave, type Autosave, type SavePhase, type SaveSnapshot } from "./autosave.ts";
import type { FormBlock, FormField, PageDocument, SectionBlock, WidgetBlock } from "../shared/document.ts";

// The part of a test runner's expect the battery uses (Vitest's fits).
export interface Expectation {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toMatchObject(expected: object): void;
  toBeGreaterThan(expected: number): void;
  toContain(expected: unknown): void;
  toContainEqual(expected: unknown): void;
  toHaveLength(expected: number): void;
  toMatch(expected: RegExp): void;
  readonly not: Expectation;
}
export type Expect = (actual: unknown, message?: string) => Expectation;

export interface ContractEnv {
  // The adapter under test, as one tab of the editor.
  adapter: StorageAdapter;
  // Another tab on the same storage.
  openTab(): StorageAdapter;
  expect: Expect;
  // A name no other case has used, in lowercase letters, digits and
  // hyphens, to start an address with.
  unique(prefix: string): string;
  // The bytes at the address a library item gives.
  readBytes(url: string): Promise<Uint8Array>;
  // A visitor sends a form of a live page: from the page's live address,
  // the form block's id, and the answers by field name (a ticked box:
  // "yes"). What a visitor does, outside the editor's storage, so the
  // runner does it; only the cases that need responses ask for it, and a
  // send the storage does not keep fails the case.
  sendForm(live: string, formId: string, answers: Readonly<Record<string, string>>): Promise<void>;
}

export interface ContractCase {
  name: string;
  needs: readonly OptionalOperation[];
  run(env: ContractEnv): Promise<void>;
}

// --------------------------------------------------------------- helpers

function value<T, P>(outcome: Outcome<T, P>, what: string): T {
  if (!outcome.ok) throw new Error(`${what} was refused: ${JSON.stringify(outcome.problem)}`);
  return outcome.value;
}

function refusal<T, P>(outcome: Outcome<T, P>, what: string): P {
  if (outcome.ok) throw new Error(`${what} went through: ${JSON.stringify(outcome.value)}`);
  return outcome.problem;
}

async function failure(promise: Promise<unknown>, what: string): Promise<Failure> {
  try {
    await promise;
  } catch (error) {
    if (isStorageError(error)) return error.failure;
    throw error;
  }
  throw new Error(`${what} did not fail`);
}

const HOUR = 3_600_000;

// A time `ms` from now on the real clock, as the API writes times.
const inMs = (ms: number): string => new Date(Date.now() + ms).toISOString();

// Asks `read` again every half second until it gives something, and gives
// that; fails after `withinMs` saying what it waited for.
async function until<T>(read: () => Promise<T | null | undefined>, withinMs: number, what: string): Promise<T> {
  const end = Date.now() + withinMs;
  for (;;) {
    const got = await read();
    if (got !== null && got !== undefined) return got;
    if (Date.now() > end) throw new Error(`waited ${withinMs / 1000} s for ${what}`);
    await new Promise((done) => setTimeout(done, 500));
  }
}

let blocks = 0;
const id = (kind: string) => `${kind}${++blocks}`;

function heading(text: string, level = 2): WidgetBlock {
  return { id: id("h"), type: "heading", props: { level: level as 1 | 2 | 3 | 4, text }, children: [], style: { base: {} } };
}

function section(...widgets: WidgetBlock[]): SectionBlock {
  return { id: id("s"), type: "section", props: {}, style: { base: {} }, children: [{ id: id("c"), type: "column", props: {}, style: { base: {} }, children: widgets }] };
}

function form(items: FormField[], formId = id("f")): FormBlock {
  return { id: formId, type: "form", props: { items, submitLabel: "Send", confirmation: "Thank you." }, children: [], style: { base: {} } };
}

function documentOf(title: string, ...sections: SectionBlock[]): PageDocument {
  return { schemaVersion: 1, title, sections };
}

async function newPage(env: ContractEnv, prefix: string): Promise<{ id: number; slug: string; revision: number }> {
  const slug = env.unique(prefix);
  const created = value(await env.adapter.createPage({ title: `Page ${slug}`, slug }), "creating a page");
  return { id: created.page.id, slug, revision: created.draft.revision };
}

async function saved(adapter: StorageAdapter, pageId: number, save: DraftSave, what = "the save"): Promise<number> {
  return value(await adapter.saveDraft(pageId, save), what).revision;
}

// A 3 by 2 PNG: green, a yellow middle column.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGOQi/Z5e4hBLtqHAc4CAEGqBnOYU6sVAAAAAElFTkSuQmCC";
export const PNG_BYTES = Uint8Array.from(atob(PNG_BASE64), (c) => c.charCodeAt(0));

function png(name: string): File {
  return new File([PNG_BYTES], name, { type: "image/png" });
}

async function upload(env: ContractEnv, name: string, alt?: string) {
  const file = png(name);
  return value(await env.adapter.uploadMedia({ file, width: 3, height: 2, ...(alt === undefined ? {} : { alt }) }), `uploading ${name}`);
}

// Waits for the autosave to reach one of the phases, on the real clock.
function phaseOf(autosave: Autosave, phases: readonly SavePhase[], withinMs = 20_000): Promise<SaveSnapshot> {
  return new Promise((resolve, reject) => {
    const check = (snapshot: SaveSnapshot) => {
      if (!phases.includes(snapshot.phase)) return false;
      clearTimeout(timer);
      stop();
      resolve(snapshot);
      return true;
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`the autosave stayed "${autosave.getSnapshot().phase}", not ${phases.join(" or ")}, for ${withinMs / 1000} s`));
    }, withinMs);
    const stop = autosave.subscribe(check);
    check(autosave.getSnapshot());
  });
}

// An autosave on the real clock with short waits, through a counter of the
// saves it sends and of how many are open at once.
function watchedAutosave(adapter: StorageAdapter, pageId: number, revision: number, document: PageDocument, wrap?: (save: StorageAdapter["saveDraft"]) => StorageAdapter["saveDraft"]) {
  const sent: DraftSave[] = [];
  let open = 0;
  let mostOpen = 0;
  const saveDraft = wrap ? wrap(adapter.saveDraft.bind(adapter)) : adapter.saveDraft.bind(adapter);
  const autosave = createAutosave({
    adapter: {
      getDraft: adapter.getDraft.bind(adapter),
      saveDraft: async (id, save, options) => {
        sent.push(save);
        open += 1;
        mostOpen = Math.max(mostOpen, open);
        try {
          return await saveDraft(id, save, options);
        } finally {
          open -= 1;
        }
      },
    },
    pageId,
    revision,
    document,
    debounceMs: 20,
    maxWaitMs: 200,
    timeoutMs: 15_000,
    retryDelaysMs: [50],
  });
  return { autosave, sent, mostOpen: () => mostOpen };
}

// ----------------------------------------------------------------- cases

export const STORAGE_CONTRACT: readonly ContractCase[] = [
  // ------------------------------------------------------------- pages
  {
    name: "a new page is listed with its address, its revision and its links, and nothing live",
    needs: [],
    async run(env) {
      const slug = env.unique("listed");
      const created = value(await env.adapter.createPage({ title: "Listed page", slug }), "creating a page");
      env.expect(created.page).toMatchObject({ title: "Listed page", slug, home: false });
      env.expect(created.published).toBe(null);
      env.expect(created.links.live).toBe(null);
      const listed = (await env.adapter.listPages()).find((p) => p.id === created.page.id);
      env.expect(listed).toMatchObject({ title: "Listed page", slug, home: false, revision: created.draft.revision, published: null } satisfies Partial<PageSummary>);
      env.expect((await env.adapter.getPage(created.page.id)).page).toEqual(created.page);
    },
  },
  {
    name: "a new page's draft holds an empty document with its title",
    needs: [],
    async run(env) {
      const page = await newPage(env, "empty");
      const draft = await env.adapter.getDraft(page.id);
      env.expect(draft.revision).toBe(page.revision);
      env.expect(draft.document).toEqual({ schemaVersion: 1, title: `Page ${page.slug}`, sections: [] });
    },
  },
  {
    name: "a page is refused at the field at fault: an address taken, reserved or malformed, an empty title",
    needs: [],
    async run(env) {
      const taken = env.unique("taken");
      value(await env.adapter.createPage({ title: "First", slug: taken }), "the first page");
      for (const [request, pointer] of [
        [{ title: "Second", slug: taken }, "/slug"],
        [{ title: "Reserved", slug: "api" }, "/slug"],
        [{ title: "Malformed", slug: "Not An Address" }, "/slug"],
        [{ title: "", slug: env.unique("untitled") }, "/title"],
      ] as const) {
        const problem = refusal(await env.adapter.createPage(request), `creating ${JSON.stringify(request)}`);
        env.expect(problem.kind, JSON.stringify(request)).toBe("invalid");
        // One field at fault, which may break more than one rule.
        env.expect([...new Set(problem.errors.map((e) => e.pointer))], JSON.stringify(request)).toEqual([pointer]);
      }
    },
  },
  {
    name: "a save at the draft's revision is kept, and the revision goes up by one",
    needs: [],
    async run(env) {
      const page = await newPage(env, "saved");
      const document = documentOf("Saved page", section(heading("Tide times", 1)));
      const answer = value(await env.adapter.saveDraft(page.id, { revision: page.revision, document, saveId: "contract-save-1" }), "the save");
      env.expect(answer).toMatchObject({ revision: page.revision + 1, lastSaveId: "contract-save-1" });
      const draft = await env.adapter.getDraft(page.id);
      env.expect(draft).toMatchObject({ revision: page.revision + 1, lastSaveId: "contract-save-1", document });
      env.expect((await env.adapter.getPage(page.id)).page.title).toBe("Saved page");
    },
  },
  {
    name: "a save from a revision another tab has moved past is a conflict naming where the draft is and whose save took it there",
    needs: [],
    async run(env) {
      const page = await newPage(env, "conflict");
      const other = env.openTab();
      const theirs = documentOf("Theirs", section(heading("From the other tab")));
      const moved = await saved(other, page.id, { revision: page.revision, document: theirs, saveId: "other-tab-1" });
      const problem = refusal(
        await env.adapter.saveDraft(page.id, { revision: page.revision, document: documentOf("Mine"), saveId: "this-tab-1" }),
        "the save from the old revision",
      );
      env.expect(problem).toMatchObject({ kind: "conflict", currentRevision: moved, lastSaveId: "other-tab-1" });
      env.expect((await env.adapter.getDraft(page.id)).document).toEqual(theirs);
    },
  },
  {
    name: "the same save sent again after its answer was lost is answered as saved, and stored once",
    needs: [],
    async run(env) {
      const page = await newPage(env, "retry");
      const save = { revision: page.revision, document: documentOf("Sent twice", section(heading("Once"))), saveId: "lost-answer-1" };
      const first = value(await env.adapter.saveDraft(page.id, save), "the first send");
      const again = value(await env.adapter.saveDraft(page.id, structuredClone(save)), "the same save, sent again");
      env.expect(again.revision).toBe(first.revision);
      env.expect(again.lastSaveId).toBe("lost-answer-1");
      env.expect((await env.adapter.getDraft(page.id)).revision).toBe(page.revision + 1);
    },
  },
  {
    name: "the same saveId with another document is a conflict, not a save",
    needs: [],
    async run(env) {
      const page = await newPage(env, "same-id");
      const sent = documentOf("What was stored");
      await saved(env.adapter, page.id, { revision: page.revision, document: sent, saveId: "reused-1" });
      const problem = refusal(
        await env.adapter.saveDraft(page.id, { revision: page.revision, document: documentOf("Something else"), saveId: "reused-1" }),
        "another document under the same saveId",
      );
      env.expect(problem).toMatchObject({ kind: "conflict", currentRevision: page.revision + 1, lastSaveId: "reused-1" });
      env.expect((await env.adapter.getDraft(page.id)).document).toEqual(sent);
    },
  },
  {
    name: "a document the schema refuses is invalid, each error on its block at its field, and nothing is stored",
    needs: [],
    async run(env) {
      const page = await newPage(env, "invalid");
      const wrong = heading("Too deep a level");
      (wrong.props as { level: number }).level = 9;
      const document = documentOf("Invalid", section(heading("Fine"), wrong));
      const problem = refusal(await env.adapter.saveDraft(page.id, { revision: page.revision, document, saveId: "invalid-1" }), "the invalid save");
      env.expect(problem.kind).toBe("invalid");
      if (problem.kind !== "invalid") return;
      env.expect(problem.code).toBe("invalid_document");
      env.expect(errorsByBlock(document, problem.errors).map((e) => [e.blockId, e.field])).toEqual([[wrong.id, "/props/level"]]);
      env.expect((await env.adapter.getDraft(page.id)).revision).toBe(page.revision);
    },
  },
  {
    name: "a document with two blocks of one id is refused at the second, by the application rules",
    needs: [],
    async run(env) {
      const page = await newPage(env, "twins");
      const first = heading("First");
      const second = { ...heading("Second"), id: first.id };
      const document = documentOf("Twins", section(first, second));
      const problem = refusal(await env.adapter.saveDraft(page.id, { revision: page.revision, document, saveId: "twins-1" }), "the save with two ids");
      if (problem.kind !== "invalid") throw new Error(`expected invalid, got ${problem.kind}`);
      env.expect(problem.errors.map((e) => [e.pointer, e.keyword])).toEqual([["/document/sections/0/children/0/children/1/id", "uniqueId"]]);
      env.expect(errorsByBlock(document, problem.errors)).toEqual([{ blockId: first.id, field: "/id", keyword: "uniqueId", message: problem.errors[0]!.message }]);
    },
  },
  {
    name: "a page's next address and the home mark are set, and a taken address refused",
    needs: [],
    async run(env) {
      const page = await newPage(env, "moving");
      const next = env.unique("moved");
      const changed = value(await env.adapter.updatePage(page.id, { slug: next }), "the new address");
      env.expect(changed.page.slug).toBe(next);
      env.expect(changed.published).toBe(null);
      const home = value(await env.adapter.updatePage(page.id, { home: true }), "the home mark");
      env.expect(home.page.home).toBe(true);
      env.expect(value(await env.adapter.updatePage(page.id, { home: false }), "the home mark taken off").page.home).toBe(false);
      const otherPage = await newPage(env, "holder");
      const problem = refusal(await env.adapter.updatePage(page.id, { slug: otherPage.slug }), "an address another page has");
      env.expect([...new Set(problem.errors.map((e) => e.pointer))]).toEqual(["/slug"]);
    },
  },
  {
    name: "what does not exist is not found",
    needs: [],
    async run(env) {
      env.expect(await failure(env.adapter.getDraft(987_654_321), "the draft of no page")).toMatchObject({ kind: "not-found" });
      const page = await newPage(env, "versionless");
      env.expect(await failure(env.adapter.getVersion(page.id, 999), "a version never made")).toMatchObject({ kind: "not-found" });
      env.expect(await failure(env.adapter.setMediaAlt("NoSuchImage0000", "x"), "the alt of no image")).toMatchObject({ kind: "not-found" });
    },
  },

  // ---------------------------------------------------------- versions
  {
    name: "Save version keeps the draft under its name, newest first, and a version reads back with its document",
    needs: [],
    async run(env) {
      const page = await newPage(env, "versions");
      const first = documentOf("Version one", section(heading("One")));
      const second = documentOf("Version two", section(heading("Two")));
      const r1 = await saved(env.adapter, page.id, { revision: page.revision, document: first, saveId: "versions-1" });
      const named = value(await env.adapter.saveVersion(page.id, { name: "Before the change" }), "the named version");
      env.expect(named).toMatchObject({ reason: "manual", name: "Before the change", restoredFrom: null, published: false });
      await saved(env.adapter, page.id, { revision: r1, document: second, saveId: "versions-2" });
      const unnamed = value(await env.adapter.saveVersion(page.id), "the unnamed version");
      env.expect(unnamed).toMatchObject({ reason: "manual", name: null });
      env.expect(unnamed.number).toBeGreaterThan(named.number);
      // Kept by the person; automatic ones may sit between them.
      const manual = (await env.adapter.listVersions(page.id)).filter((v) => v.reason === "manual");
      env.expect(manual.map((v) => [v.number, v.name])).toEqual([[unnamed.number, null], [named.number, "Before the change"]]);
      env.expect((await env.adapter.getVersion(page.id, named.number)).document).toEqual(first);
      const tooLong = refusal(await env.adapter.saveVersion(page.id, { name: "x".repeat(81) }), "a name of 81 characters");
      env.expect(tooLong.errors.map((e) => e.pointer)).toEqual(["/name"]);
    },
  },
  {
    name: "a restore puts a version's document in the draft, keeps the draft it replaced, and the tab still on the old revision gets a conflict",
    needs: [],
    async run(env) {
      const page = await newPage(env, "restore");
      const old = documentOf("The old one", section(heading("Old")));
      const now = documentOf("The new one", section(heading("New")));
      const r1 = await saved(env.adapter, page.id, { revision: page.revision, document: old, saveId: "restore-1" });
      const kept = value(await env.adapter.saveVersion(page.id, { name: "Old" }), "the version to restore");
      const r2 = await saved(env.adapter, page.id, { revision: r1, document: now, saveId: "restore-2" });
      const restored = value(await env.adapter.restoreVersion(page.id, kept.number), "the restore");
      env.expect(restored.draft.document).toEqual(old);
      env.expect(restored.draft.revision).toBeGreaterThan(r2);
      env.expect(restored.version).toMatchObject({ reason: "restore", restoredFrom: kept.number });
      env.expect(restored.kept?.reason).toBe("before-restore");
      env.expect((await env.adapter.getVersion(page.id, restored.kept!.number)).document).toEqual(now);
      const late = refusal(await env.adapter.saveDraft(page.id, { revision: r2, document: now, saveId: "restore-3" }), "a save from before the restore");
      env.expect(late).toMatchObject({ kind: "conflict", currentRevision: restored.draft.revision, lastSaveId: null });
    },
  },

  // -------------------------------------------------------- publishing
  {
    name: "publishing puts the draft live as a version, under the page's address",
    needs: ["publish"],
    async run(env) {
      const page = await newPage(env, "live");
      const document = documentOf("Live page", section(heading("On the water", 1)));
      const revision = await saved(env.adapter, page.id, { revision: page.revision, document, saveId: "live-1" });
      const result = value(await env.adapter.publish(page.id, { revision }), "the publish");
      env.expect(result.published).toMatchObject({ slug: page.slug, versionNumber: result.version.number });
      env.expect(result.version).toMatchObject({ reason: "publish", published: true });
      env.expect(result.links.live).toBe(`/${page.slug}`);
      env.expect((await env.adapter.getVersion(page.id, result.version.number)).document).toEqual(document);
      const listed = (await env.adapter.listPages()).find((p) => p.id === page.id);
      env.expect(listed?.published).toEqual(result.published);
    },
  },
  {
    name: "publishing at a revision the draft has moved past is a conflict, and nothing goes live",
    needs: ["publish"],
    async run(env) {
      const page = await newPage(env, "stale-publish");
      const r1 = await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("Seen"), saveId: "stale-1" });
      const r2 = await saved(env.openTab(), page.id, { revision: r1, document: documentOf("Not seen"), saveId: "stale-2" });
      const problem = refusal(await env.adapter.publish(page.id, { revision: r1 }), "the publish of a revision since moved");
      env.expect(problem).toMatchObject({ kind: "conflict", currentRevision: r2, lastSaveId: "stale-2" });
      env.expect((await env.adapter.getPage(page.id)).published).toBe(null);
    },
  },
  {
    name: "what is live names the draft revision it came from, so the saves since are the changes not live",
    needs: ["publish"],
    async run(env) {
      const page = await newPage(env, "not-live");
      const r1 = await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("Live"), saveId: "not-live-1" });
      const first = value(await env.adapter.publish(page.id, { revision: r1 }), "the publish");
      env.expect(first.published.draftRevision).toBe(r1);
      const r2 = await saved(env.adapter, page.id, { revision: r1, document: documentOf("Not live"), saveId: "not-live-2" });
      const r3 = await saved(env.openTab(), page.id, { revision: r2, document: documentOf("Not live either"), saveId: "not-live-3" });
      const read = await env.adapter.getPage(page.id);
      env.expect(read.published?.draftRevision).toBe(r1);
      // Each save moves the revision up by one, so the difference counts them.
      env.expect(read.draft.revision - r1).toBe(2);
      const listed = (await env.adapter.listPages()).find((p) => p.id === page.id);
      env.expect([listed?.revision, listed?.published?.draftRevision]).toEqual([r3, r1]);
      const second = value(await env.adapter.publish(page.id, { revision: r3 }), "the second publish");
      env.expect(second.published.draftRevision).toBe(r3);
      const after = await env.adapter.getPage(page.id);
      env.expect(after.published?.draftRevision).toBe(after.draft.revision);
    },
  },

  // --------------------------------------------------------- scheduling
  {
    name: "a publish set for a time waits on the page, listed, with the draft it was set from kept as a scheduled version",
    needs: ["schedule"],
    async run(env) {
      const page = await newPage(env, "scheduled");
      const document = documentOf("Set for later", section(heading("At the turn of the tide", 1)));
      const revision = await saved(env.adapter, page.id, { revision: page.revision, document, saveId: "scheduled-1" });
      const at = inMs(HOUR);
      const result = value(await env.adapter.schedulePublish(page.id, { revision, at }), "the schedule");
      env.expect(result.schedule).toMatchObject({ at, revision, state: "pending", settledAt: null, publishedVersionNumber: null });
      env.expect(result.version).toMatchObject({ number: result.schedule.versionNumber, reason: "scheduled", published: false });
      env.expect(result.replaced).toBe(null);
      env.expect((await env.adapter.getVersion(page.id, result.schedule.versionNumber)).document).toEqual(document);
      const read = await env.adapter.getPage(page.id);
      env.expect(read.scheduled).toEqual(result.schedule);
      env.expect(read.published).toBe(null);
      env.expect((await env.adapter.listPages()).find((p) => p.id === page.id)?.scheduled).toEqual(result.schedule);
      env.expect(await env.adapter.listSchedules(page.id)).toEqual([result.schedule]);
    },
  },
  {
    name: "a second schedule replaces the first; a cancel settles one, and cancelling one no longer pending says what became of it",
    needs: ["schedule"],
    async run(env) {
      const page = await newPage(env, "rescheduled");
      const revision = await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("Twice set", section(heading("Twice"))), saveId: "rescheduled-1" });
      const first = value(await env.adapter.schedulePublish(page.id, { revision, at: inMs(HOUR) }), "the first schedule").schedule;
      const second = value(await env.adapter.schedulePublish(page.id, { revision, at: inMs(2 * HOUR) }), "the second schedule");
      env.expect(second.replaced).toMatchObject({ id: first.id, state: "replaced" });
      env.expect((await env.adapter.getPage(page.id)).scheduled?.id).toBe(second.schedule.id);

      const cancelled = value(await env.adapter.cancelScheduledPublish(page.id, second.schedule.id), "the cancel");
      env.expect(cancelled).toMatchObject({ id: second.schedule.id, state: "cancelled" });
      env.expect(cancelled.settledAt).not.toBe(null);
      env.expect((await env.adapter.getPage(page.id)).scheduled).toBe(null);
      env.expect(refusal(await env.adapter.cancelScheduledPublish(page.id, second.schedule.id), "cancelling it again")).toMatchObject({ kind: "not-pending", schedule: { state: "cancelled" } });
      env.expect(refusal(await env.adapter.cancelScheduledPublish(page.id, first.id), "cancelling the replaced one")).toMatchObject({ kind: "not-pending", schedule: { state: "replaced" } });
      env.expect((await env.adapter.listSchedules(page.id)).map((s) => [s.id, s.state])).toEqual([[second.schedule.id, "cancelled"], [first.id, "replaced"]]);
      env.expect(await failure(env.adapter.cancelScheduledPublish(page.id, 987_654_321), "cancelling one never made")).toMatchObject({ kind: "not-found" });
    },
  },
  {
    name: "a time already past or more than a year away, and a revision already live, are refused at their field; a revision moved past is a conflict",
    needs: ["schedule", "publish"],
    async run(env) {
      const page = await newPage(env, "unschedulable");
      const r1 = await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("Seen"), saveId: "unschedulable-1" });
      for (const at of [inMs(-60_000), inMs(370 * 24 * HOUR)]) {
        const problem = refusal(await env.adapter.schedulePublish(page.id, { revision: r1, at }), `a schedule for ${at}`);
        env.expect([problem.kind, problem.kind === "invalid" ? problem.errors.map((e) => e.pointer) : []], at).toEqual(["invalid", ["/at"]]);
      }
      const r2 = await saved(env.openTab(), page.id, { revision: r1, document: documentOf("Not seen"), saveId: "unschedulable-2" });
      env.expect(refusal(await env.adapter.schedulePublish(page.id, { revision: r1, at: inMs(HOUR) }), "a schedule of a revision moved past"))
        .toMatchObject({ kind: "conflict", currentRevision: r2, lastSaveId: "unschedulable-2" });
      value(await env.adapter.publish(page.id, { revision: r2 }), "the publish");
      const live = refusal(await env.adapter.schedulePublish(page.id, { revision: r2, at: inMs(HOUR) }), "a schedule of what is live");
      env.expect([live.kind, live.kind === "invalid" ? live.errors.map((e) => e.pointer) : []]).toEqual(["invalid", ["/revision"]]);
      env.expect(await env.adapter.listSchedules(page.id)).toEqual([]);
    },
  },
  {
    name: "at its time, a scheduled publish puts live the draft as it was when set, not as it is then",
    needs: ["schedule"],
    async run(env) {
      const page = await newPage(env, "goes-live");
      const scheduled = documentOf("Live at its time", section(heading("High water", 1)));
      const revision = await saved(env.adapter, page.id, { revision: page.revision, document: scheduled, saveId: "goes-live-1" });
      const set = value(await env.adapter.schedulePublish(page.id, { revision, at: inMs(3_000) }), "the schedule").schedule;
      await saved(env.adapter, page.id, { revision, document: documentOf("Edited since", section(heading("Not for now", 1))), saveId: "goes-live-2" });

      const live = await until(async () => (await env.adapter.getPage(page.id)).published, 30_000, "the page to go live");
      env.expect(live.draftRevision).toBe(revision);
      env.expect(Date.parse(live.publishedAt)).toBeGreaterThan(Date.parse(set.at) - 1);
      env.expect((await env.adapter.getVersion(page.id, live.versionNumber)).document).toEqual(scheduled);
      env.expect((await env.adapter.listSchedules(page.id))[0]).toMatchObject({ id: set.id, state: "published", publishedVersionNumber: live.versionNumber });
      env.expect((await env.adapter.getPage(page.id)).scheduled).toBe(null);
    },
  },

  // ------------------------------------------------------------- media
  {
    name: "an uploaded image is in the library with its size, type and alt text, and its address gives back the same bytes",
    needs: [],
    async run(env) {
      const name = `${env.unique("shore")}.png`;
      const progress: number[] = [];
      const item = value(
        await env.adapter.uploadMedia({ file: png(name), width: 3, height: 2, alt: "A green shore" }, { onProgress: (sent) => progress.push(sent) }),
        "the upload",
      );
      env.expect(item).toMatchObject({ alt: "A green shore", width: 3, height: 2, contentType: "image/png", byteSize: PNG_BYTES.length, filename: name });
      env.expect((await env.adapter.listMedia()).find((m) => m.id === item.id)).toEqual(item);
      env.expect([...(await env.readBytes(item.url))]).toEqual([...PNG_BYTES]);
      env.expect(progress.at(-1)).toBe(PNG_BYTES.length);
    },
  },
  {
    name: "a file that is not an allowed image is refused at the file: a type never sent, and bytes that are not what they claim",
    needs: [],
    async run(env) {
      const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "drawing.svg", { type: "image/svg+xml" });
      const notSent = refusal(await env.adapter.uploadMedia({ file: svg, width: 10, height: 10 }), "an SVG");
      env.expect(notSent.errors.map((e) => e.pointer)).toEqual(["/file"]);
      const fake = new File(["plain text, not a picture"], "fake.png", { type: "image/png" });
      const notImage = refusal(await env.adapter.uploadMedia({ file: fake, width: 10, height: 10 }), "text named .png");
      env.expect(notImage.errors.map((e) => e.pointer)).toEqual(["/file"]);
      const listed = await env.adapter.listMedia();
      env.expect(listed.filter((m) => m.filename === "drawing.svg" || m.filename === "fake.png")).toEqual([]);
    },
  },
  {
    name: "an image's proposed alt text changes, and one of two lines is refused at the alt text",
    needs: [],
    async run(env) {
      const item = await upload(env, `${env.unique("alt")}.png`);
      env.expect(item.alt).toBe("");
      const changed = value(await env.adapter.setMediaAlt(item.id, "Boats at the slipway"), "the new alt text");
      env.expect(changed).toEqual({ ...item, alt: "Boats at the slipway" });
      const problem = refusal(await env.adapter.setMediaAlt(item.id, "Two\nlines"), "an alt text of two lines");
      env.expect(problem.errors.map((e) => e.pointer)).toEqual(["/alt"]);
      env.expect((await env.adapter.listMedia()).find((m) => m.id === item.id)?.alt).toBe("Boats at the slipway");
    },
  },
  {
    name: "an image no page shows is deleted and leaves the library",
    needs: [],
    async run(env) {
      const item = await upload(env, `${env.unique("unused")}.png`);
      env.expect(value(await env.adapter.deleteMedia(item.id), "the delete")).toBe(null);
      env.expect((await env.adapter.listMedia()).map((m) => m.id)).not.toContain(item.id);
      env.expect(await failure(env.adapter.deleteMedia(item.id), "deleting it again")).toMatchObject({ kind: "not-found" });
    },
  },
  {
    name: "an image a draft shows is not deleted: the refusal names the page and the version that show it",
    needs: [],
    async run(env) {
      const item = await upload(env, `${env.unique("used")}.png`, "A pier");
      const page = await newPage(env, "with-image");
      const image: WidgetBlock = { id: id("i"), type: "image", props: { mediaId: item.id, alt: "A pier at low tide" }, children: [], style: { base: {} } };
      await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("With an image", section(image)), saveId: "image-1" });
      const kept = value(await env.adapter.saveVersion(page.id, { name: "With the pier" }), "a version showing it");
      const problem = refusal(await env.adapter.deleteMedia(item.id), "deleting an image in use");
      env.expect(problem.kind).toBe("in-use");
      env.expect(problem.usedBy.pages).toEqual([{ id: page.id, title: "With an image", slug: page.slug }]);
      env.expect(problem.usedBy.versions).toContainEqual({ pageId: page.id, number: kept.number });
      env.expect((await env.adapter.listMedia()).map((m) => m.id)).toContain(item.id);
    },
  },
  {
    name: "a document showing an image the library does not have is refused at that image",
    needs: [],
    async run(env) {
      const page = await newPage(env, "missing-image");
      const image: WidgetBlock = { id: id("i"), type: "image", props: { mediaId: "NoSuchImage0000", alt: "Nothing" }, children: [], style: { base: {} } };
      const document = documentOf("Missing image", section(image));
      const problem = refusal(await env.adapter.saveDraft(page.id, { revision: page.revision, document, saveId: "missing-1" }), "the save");
      if (problem.kind !== "invalid") throw new Error(`expected invalid, got ${problem.kind}`);
      env.expect(errorsByBlock(document, problem.errors).map((e) => [e.blockId, e.field, e.keyword])).toEqual([[image.id, "/props/mediaId", "mediaExists"]]);
    },
  },

  // -------------------------------------------------------- site style
  {
    name: "the site style takes one of its choices, keeps it, and refuses a tone that is not one at its slot",
    needs: [],
    async run(env) {
      const before = await env.adapter.getSiteStyle();
      const slots = Object.keys(before.choices.palette);
      env.expect(slots.length).toBeGreaterThan(0);
      env.expect(before.choices.typeScales.length).toBeGreaterThan(1);
      const slot = slots.find((s) => (before.choices.palette[s] ?? []).length > 1);
      if (slot === undefined) throw new Error("no palette slot has two tones to choose between");
      const tone = before.choices.palette[slot]!.find((t) => t.color !== before.palette[slot])!.color;
      const scale = before.choices.typeScales.find((t) => t.name !== before.typeScale)!.name;
      try {
        const changed = value(await env.adapter.setSiteStyle({ palette: { ...before.palette, [slot]: tone }, typeScale: scale }), "the new style");
        env.expect(changed).toMatchObject({ palette: { ...before.palette, [slot]: tone }, typeScale: scale });
        env.expect(await env.adapter.getSiteStyle()).toMatchObject({ palette: { [slot]: tone }, typeScale: scale });
        const problem = refusal(await env.adapter.setSiteStyle({ palette: { ...before.palette, [slot]: "no-such-tone" }, typeScale: before.typeScale }), "a tone not among the choices");
        env.expect(problem.errors.map((e) => e.pointer)).toEqual([`/palette/${slot}`]);
      } finally {
        value(await env.adapter.setSiteStyle({ palette: before.palette, typeScale: before.typeScale }), "putting the style back");
      }
    },
  },

  // -------------------------------------------------------- the theme
  {
    name: "the theme's header and footer are read as every page draws them, the same twice",
    needs: [],
    async run(env) {
      const site = await env.adapter.getSite();
      env.expect(site.name.length).toBeGreaterThan(0);
      env.expect(site.menu.every((link) => link.label.length > 0 && link.href.length > 0)).toBe(true);
      env.expect(site.action === null || (site.action.label.length > 0 && site.action.href.length > 0)).toBe(true);
      env.expect(typeof site.footer.lead).toBe("string");
      env.expect(typeof site.footer.text).toBe("string");
      env.expect(await env.adapter.getSite()).toEqual(site);
    },
  },

  // ---------------------------------------------------- form responses
  {
    name: "a form sent from the live page is kept with the version and the fields it was sent with, listed newest first and counted by form",
    needs: ["publish", "responses"],
    async run(env) {
      const page = await newPage(env, "answers");
      const fields: FormField[] = [
        { name: "name", kind: "text", label: "Your name", required: true, maxLength: 80 },
        { name: "email", kind: "email", label: "Email", required: false },
        { name: "swim", kind: "checkbox", label: "I can swim 200 meters", required: false },
      ];
      const join = form(fields);
      const call = form([{ name: "notes", kind: "textarea", label: "Notes", required: false, maxLength: 500 }]);
      const r1 = await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("Join", section(join, call)), saveId: "answers-1" });
      const first = value(await env.adapter.publish(page.id, { revision: r1 }), "the publish");
      const live = first.links.live!;
      await env.sendForm(live, join.id, { name: "Ann <Diver>", email: "ann@example.org", swim: "yes" });
      // The form changes, and goes live again: the first answer keeps the
      // field as it was.
      const renamed = form([{ ...fields[0]!, label: "Full name" }, fields[1]!], join.id);
      const r2 = await saved(env.adapter, page.id, { revision: r1, document: documentOf("Join", section(renamed, call)), saveId: "answers-2" });
      const second = value(await env.adapter.publish(page.id, { revision: r2 }), "the second publish");
      await env.sendForm(live, join.id, { name: "Bo", email: "" });
      await env.sendForm(live, call.id, { notes: "Cold   water\nis fine" });

      const list = await env.adapter.listResponses(page.id);
      env.expect(list.responses.map((r) => [r.formId, r.versionNumber, r.excerpt])).toEqual([
        [call.id, second.version.number, { label: "Notes", text: "Cold water is fine", truncated: false }],
        [join.id, second.version.number, { label: "Full name", text: "Bo", truncated: false }],
        [join.id, first.version.number, { label: "Your name", text: "Ann <Diver>", truncated: false }],
      ]);
      env.expect(list.next).toBe(null);
      const counts = [{ formId: call.id, count: 1 }, { formId: join.id, count: 2 }].sort((a, b) => (a.formId < b.formId ? -1 : 1));
      env.expect(list.forms).toEqual(counts);

      const [newest, middle, oldest] = list.responses;
      env.expect(await env.adapter.getResponse(page.id, oldest!.id)).toEqual({
        id: oldest!.id, formId: join.id, versionNumber: first.version.number, submittedAt: oldest!.submittedAt,
        fields, answers: { name: "Ann <Diver>", email: "ann@example.org", swim: true },
      });
      env.expect((await env.adapter.getResponse(page.id, middle!.id)).fields).toEqual(renamed.props.items);
      env.expect((await env.adapter.getResponse(page.id, newest!.id)).answers).toEqual({ notes: "Cold   water\nis fine" });
      const byForm = await env.adapter.listResponses(page.id, { form: join.id });
      env.expect(byForm.responses.map((r) => r.id)).toEqual([middle!.id, oldest!.id]);
      env.expect(byForm.forms).toEqual(counts);
    },
  },
  {
    name: "the responses come a part at a time, newest first, and next continues them to the end",
    needs: ["publish", "responses"],
    async run(env) {
      const page = await newPage(env, "many-answers");
      const join = form([{ name: "name", kind: "text", label: "Name", required: true, maxLength: 80 }]);
      const revision = await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("Many", section(join)), saveId: "many-1" });
      const live = value(await env.adapter.publish(page.id, { revision }), "the publish").links.live!;
      const sent = RESPONSES_PER_PART + 2;
      for (let i = 1; i <= sent; i += 1) await env.sendForm(live, join.id, { name: `Visitor ${i}` });

      const head = await env.adapter.listResponses(page.id);
      env.expect(head.responses).toHaveLength(RESPONSES_PER_PART);
      env.expect(head.next).toBe(head.responses[RESPONSES_PER_PART - 1]!.id);
      const tail = await env.adapter.listResponses(page.id, { before: head.next! });
      env.expect(tail.next).toBe(null);
      const names = [...head.responses, ...tail.responses].map((r) => r.excerpt?.text);
      env.expect(names).toEqual(Array.from({ length: sent }, (_, i) => `Visitor ${sent - i}`));
      env.expect(tail.forms).toEqual([{ formId: join.id, count: sent }]);
    },
  },
  {
    name: "a response deleted is gone from the list and cannot be read, deleting it again is not found, and a response is found only under its own page",
    needs: ["publish", "responses"],
    async run(env) {
      const page = await newPage(env, "deleted-answer");
      const join = form([{ name: "name", kind: "text", label: "Name", required: true, maxLength: 80 }]);
      const revision = await saved(env.adapter, page.id, { revision: page.revision, document: documentOf("Deleted", section(join)), saveId: "deleted-1" });
      const live = value(await env.adapter.publish(page.id, { revision }), "the publish").links.live!;
      await env.sendForm(live, join.id, { name: "Ann" });
      await env.sendForm(live, join.id, { name: "Bo" });
      const [bo, ann] = (await env.adapter.listResponses(page.id)).responses;

      await env.adapter.deleteResponse(page.id, ann!.id);
      const after = await env.adapter.listResponses(page.id);
      env.expect(after.responses.map((r) => r.id)).toEqual([bo!.id]);
      env.expect(after.forms).toEqual([{ formId: join.id, count: 1 }]);
      env.expect(await failure(env.adapter.getResponse(page.id, ann!.id), "reading a deleted response")).toMatchObject({ kind: "not-found" });
      env.expect(await failure(env.adapter.deleteResponse(page.id, ann!.id), "deleting it again")).toMatchObject({ kind: "not-found" });

      const other = await newPage(env, "not-its-page");
      env.expect(await failure(env.adapter.getResponse(other.id, bo!.id), "reading it under another page")).toMatchObject({ kind: "not-found" });
      env.expect(await failure(env.adapter.deleteResponse(other.id, bo!.id), "deleting it under another page")).toMatchObject({ kind: "not-found" });
      env.expect(await env.adapter.listResponses(other.id)).toEqual({ responses: [], next: null, forms: [] });
      env.expect((await env.adapter.getResponse(page.id, bo!.id)).answers).toEqual({ name: "Bo" });
    },
  },

  // ------------------------------------------------------ capabilities
  {
    name: "what the capabilities declare absent is refused as unsupported, and what they declare present is not",
    needs: [],
    async run(env) {
      // Every optional operation is called, on a page that does not exist,
      // so the case does as much on an adapter that has them all as on one
      // that has none: one the adapter has answers that there is no such
      // page; one it lacks is refused before anything is looked up.
      const nowhere = 987_654_321;
      const calls: Record<OptionalOperation, () => Promise<unknown>> = {
        publish: () => env.adapter.publish(nowhere),
        schedule: () => env.adapter.schedulePublish(nowhere, { revision: 0, at: inMs(HOUR) }),
        responses: () => env.adapter.listResponses(nowhere),
      };
      for (const operation of OPTIONAL_OPERATIONS) {
        const expected = env.adapter.capabilities[operation] ? { kind: "not-found" } : { kind: "unsupported", operation };
        env.expect(await failure(calls[operation](), operation), operation).toMatchObject(expected);
      }
      env.expect(Object.keys(env.adapter.capabilities).sort()).toEqual([...OPTIONAL_OPERATIONS, "imageVariants"].sort());
    },
  },

  // ---------------------------------------------- the autosave on top
  {
    name: "the autosave saves a run of edits through the adapter, one request at a time, each from the revision the last one gave",
    needs: [],
    async run(env) {
      const page = await newPage(env, "autosave");
      const start = await env.adapter.getDraft(page.id);
      const { autosave, sent, mostOpen } = watchedAutosave(env.adapter, page.id, start.revision, start.document);
      let last = start.document;
      for (let i = 1; i <= 12; i += 1) {
        last = documentOf(`Edit ${i}`, section(heading(`Edit ${i}`)));
        autosave.edit(last);
        await new Promise((done) => setTimeout(done, i % 4 === 0 ? 60 : 5));
      }
      const settled = await autosave.flush();
      autosave.dispose();
      const draft = await env.adapter.getDraft(page.id);
      env.expect(settled).toMatchObject({ phase: "saved", unsavedEdits: 0, savedEdits: 12, revision: draft.revision });
      env.expect(draft.document).toEqual(last);
      env.expect(mostOpen()).toBe(1);
      env.expect(sent.length).toBeGreaterThan(1);
      // Each save started from the revision the one before it reached.
      env.expect(sent.map((s) => s.revision)).toEqual(sent.map((_, i) => start.revision + i));
      env.expect(draft.revision).toBe(start.revision + sent.length);
    },
  },
  {
    name: "the autosave sends a save whose answer was lost again, with the same saveId, and the store counts it once",
    needs: [],
    async run(env) {
      const page = await newPage(env, "lost");
      const start = await env.adapter.getDraft(page.id);
      let lose = true;
      const { autosave, sent } = watchedAutosave(env.adapter, page.id, start.revision, start.document, (saveDraft) => async (id, save, options) => {
        const outcome = await saveDraft(id, save, options);
        if (!lose) return outcome;
        // Stored, but the answer never reaches the tab.
        lose = false;
        throw new StorageError({ kind: "unknown", cause: "network", status: null, message: "the answer was lost" });
      });
      const document = documentOf("Kept once", section(heading("Kept once")));
      autosave.edit(document);
      const first = await autosave.flush();
      env.expect(first).toMatchObject({ phase: "retrying", outcomeUnknown: true, warnOnClose: true });
      const after = await phaseOf(autosave, ["saved", "conflict", "invalid", "refused"]);
      autosave.dispose();
      env.expect(after).toMatchObject({ phase: "saved", outcomeUnknown: false, warnOnClose: false, revision: start.revision + 1 });
      env.expect(sent.map((s) => s.saveId)).toEqual([sent[0]!.saveId, sent[0]!.saveId]);
      env.expect(await env.adapter.getDraft(page.id)).toMatchObject({ revision: start.revision + 1, document });
    },
  },
  {
    name: "the autosave stops on another tab's save, and goes on by keeping this tab's document or by reloading the other's",
    needs: [],
    async run(env) {
      const page = await newPage(env, "two-tabs");
      const start = await env.adapter.getDraft(page.id);
      const other = env.openTab();
      const { autosave } = watchedAutosave(env.adapter, page.id, start.revision, start.document);
      const r1 = await saved(other, page.id, { revision: start.revision, document: documentOf("Other tab, first"), saveId: "two-tabs-other-1" });

      const mine = documentOf("This tab");
      autosave.edit(mine);
      env.expect(await autosave.flush()).toMatchObject({ phase: "conflict", conflict: { currentRevision: r1, lastSaveId: "two-tabs-other-1" }, warnOnClose: true });
      autosave.overwrite();
      env.expect(await autosave.flush()).toMatchObject({ phase: "saved", revision: r1 + 1 });
      env.expect((await env.adapter.getDraft(page.id)).document).toEqual(mine);

      const theirs = documentOf("Other tab, second");
      await saved(other, page.id, { revision: r1 + 1, document: theirs, saveId: "two-tabs-other-2" });
      autosave.edit(documentOf("This tab, again"));
      env.expect((await autosave.flush()).phase).toBe("conflict");
      const reloaded = await autosave.reload();
      autosave.dispose();
      env.expect(reloaded.document).toEqual(theirs);
      env.expect(autosave.getSnapshot()).toMatchObject({ phase: "saved", unsavedEdits: 0, revision: r1 + 2 });
      env.expect((await env.adapter.getDraft(page.id)).document).toEqual(theirs);
    },
  },
];
