// The autosave on a fake clock, against a fake CMS that keeps a draft by
// the CMS's own rules: a save goes through at the draft's revision, the
// same save sent again after it was stored is answered as saved, anything
// else is a conflict. Each test drives the edits and the network, then
// looks at what the server holds and what it received: the document, the
// revision, the saves it counted, how many requests were open at once.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import type { PageDocument } from "../shared/document.ts";
import { StorageError, type CallOptions, type Conflict, type Draft, type DraftSave, type DraftSaved, type Invalid, type Outcome, type StorageAdapter } from "./adapter.ts";
import { createAutosave, type AutosaveOptions, type SaveSnapshot } from "./autosave.ts";

// What the network does to the next request.
type Fate =
  // Stored by the rules and answered.
  | "answer"
  // Stored, but the answer never arrives.
  | "lose-answer"
  // Never reaches the server: the network fails.
  | "no-network"
  // The server fails (500) before storing anything.
  | "server-error"
  // The server refuses it with 403, storing nothing.
  | "refuse"
  // The server refuses the document with 422.
  | "invalid";

interface Received {
  saveId: string;
  revision: number;
  title: string;
  at: number;
}

class FakeCms {
  revision = 0;
  lastSaveId: string | null = null;
  document: PageDocument;
  updatedAt = "2026-10-02T08:00:00.000Z";
  readonly received: Received[] = [];
  // Saves that changed the draft, by their saveId.
  readonly stored: string[] = [];
  open = 0;
  mostOpen = 0;
  latencyMs = 100;
  private readonly fates: Fate[] = [];
  private readonly clock: FakeClock;

  constructor(clock: FakeClock, document: PageDocument) {
    this.clock = clock;
    this.document = document;
  }

  // The fates of the next requests, in order; after them, "answer".
  next(...fates: Fate[]): void {
    this.fates.push(...fates);
  }

  // Another tab saves.
  savedElsewhere(document: PageDocument): void {
    this.revision += 1;
    this.lastSaveId = `other-${this.revision}`;
    this.document = document;
  }

  private apply(save: DraftSave): Outcome<DraftSaved, Conflict | Invalid> {
    const answer = () => ({ ok: true as const, value: { revision: this.revision, lastSaveId: this.lastSaveId, updatedAt: this.updatedAt } });
    if (save.revision === this.revision) {
      this.revision += 1;
      this.lastSaveId = save.saveId;
      this.document = save.document;
      this.updatedAt = new Date(Date.UTC(2026, 9, 2, 8) + this.clock.now()).toISOString();
      this.stored.push(save.saveId);
      return answer();
    }
    if (this.lastSaveId === save.saveId && this.revision === save.revision + 1 && JSON.stringify(this.document) === JSON.stringify(save.document)) return answer();
    return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: this.revision, lastSaveId: this.lastSaveId } };
  }

  adapter(): Pick<StorageAdapter, "getDraft" | "saveDraft"> {
    return {
      getDraft: async (): Promise<Draft> => ({ revision: this.revision, lastSaveId: this.lastSaveId, updatedAt: this.updatedAt, document: this.document }),
      saveDraft: (_pageId: number, save: DraftSave, options?: CallOptions) => {
        const fate = this.fates.shift() ?? "answer";
        this.received.push({ saveId: save.saveId, revision: save.revision, title: save.document.title, at: this.clock.now() });
        this.open += 1;
        this.mostOpen = Math.max(this.mostOpen, this.open);
        return new Promise<Outcome<DraftSaved, Conflict | Invalid>>((resolve, reject) => {
          let closed = false;
          const close = () => {
            if (closed) return false;
            closed = true;
            this.open -= 1;
            return true;
          };
          // The browser closes an abandoned request.
          options?.signal?.addEventListener("abort", () => {
            if (close()) reject(new StorageError({ kind: "unknown", cause: "timeout", status: null, message: "abandoned" }));
          });
          this.clock.setTimeout(() => {
            if (fate === "lose-answer") {
              this.apply(save);
              return;
            }
            if (!close()) return;
            if (fate === "answer") resolve(this.apply(save));
            else if (fate === "no-network") reject(new StorageError({ kind: "unknown", cause: "network", status: null, message: "no network" }));
            else if (fate === "server-error") reject(new StorageError({ kind: "unknown", cause: "server", status: 500, message: "failed" }));
            else if (fate === "refuse") reject(new StorageError({ kind: "refused", status: 403, code: "forbidden_origin", message: "refused" }));
            else resolve({ ok: false, problem: { kind: "invalid", code: "invalid_document", message: "not valid", errors: [{ pointer: "/document/title", keyword: "minLength", blockPointer: null, message: "too short" }] } });
          }, this.latencyMs);
        });
      },
    };
  }
}

const page = (title: string): PageDocument => ({ schemaVersion: 1, title, sections: [] });

function setup(overrides: Partial<AutosaveOptions> = {}) {
  const clock = new FakeClock();
  const cms = new FakeCms(clock, page("Loaded"));
  let ids = 0;
  const phases: string[] = [];
  const autosave = createAutosave({
    adapter: cms.adapter(),
    pageId: 1,
    revision: 0,
    document: cms.document,
    clock,
    newSaveId: () => `save-${++ids}`,
    debounceMs: 1_000,
    maxWaitMs: 5_000,
    timeoutMs: 15_000,
    retryDelaysMs: [2_000, 4_000, 8_000],
    ...overrides,
  });
  autosave.subscribe((s) => {
    if (phases.at(-1) !== s.phase) phases.push(s.phase);
  });
  const now = (): SaveSnapshot => autosave.getSnapshot();
  return { clock, cms, autosave, phases, now };
}

describe("the autosave, on a fake clock", () => {
  test("edits wait for a pause, then leave as one save, and the tab is safe to close once it is answered", async () => {
    const { clock, cms, autosave, now, phases } = setup();
    autosave.edit(page("One"));
    await clock.advance(300);
    autosave.edit(page("Two"));
    await clock.advance(300);
    autosave.edit(page("Three"));
    expect(now()).toMatchObject({ phase: "waiting", unsavedEdits: 3, warnOnClose: true });
    await clock.advance(999);
    expect(cms.received).toEqual([]);
    await clock.advance(1);
    expect(cms.received).toEqual([{ saveId: "save-1", revision: 0, title: "Three", at: 1_600 }]);
    expect(now()).toMatchObject({ phase: "saving", sentAt: 1_600, attempt: 1 });
    await clock.advance(100);
    expect(cms.document.title).toBe("Three");
    expect(now()).toMatchObject({ phase: "saved", revision: 1, unsavedEdits: 0, savedEdits: 3, warnOnClose: false, outcomeUnknown: false });
    expect(now().savedAt).toBe(cms.updatedAt);
    expect(phases).toEqual(["waiting", "saving", "saved"]);
    expect(clock.pending).toBe(0);
  });

  test("the same document handed over again is no edit", async () => {
    const { clock, cms, autosave, now } = setup();
    const same = page("Once");
    autosave.edit(same);
    autosave.edit(same);
    await clock.advance(2_000);
    expect(cms.received).toHaveLength(1);
    expect(now()).toMatchObject({ phase: "saved", savedEdits: 1 });
  });

  test("a long run of edits with no pause is still saved, every maxWait", async () => {
    const { clock, cms, autosave } = setup();
    for (let i = 1; i <= 24; i += 1) {
      autosave.edit(page(`Edit ${i}`));
      await clock.advance(500);
    }
    // Twelve seconds of typing, an edit every half second and never a pause
    // of one: saves left at 5 s and at 10 s (the second one's wait started
    // with the first edit after the first save left), each with the edits
    // made so far.
    expect(cms.received.map((r) => [r.at, r.title])).toEqual([[5_000, "Edit 10"], [10_000, "Edit 20"]]);
    // Then the typing stops, and the pause sends the rest.
    await clock.advance(1_000);
    expect(cms.received.map((r) => [r.at, r.title]).at(-1)).toEqual([12_500, "Edit 24"]);
    expect(cms.document.title).toBe("Edit 24");
    expect(cms.mostOpen).toBe(1);
  });

  test("one save in flight: edits made meanwhile leave after its answer, from the revision it gave", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.latencyMs = 2_000;
    autosave.edit(page("A"));
    await clock.advance(1_000);
    expect(now().phase).toBe("saving");
    autosave.edit(page("B"));
    await clock.advance(200);
    autosave.edit(page("C"));
    // C's pause ends at 2.2 s, while A is still out: nothing else leaves.
    await clock.advance(1_700);
    expect(cms.received.map((r) => r.title)).toEqual(["A"]);
    expect(now()).toMatchObject({ phase: "saving", unsavedEdits: 3 });
    // A is answered at 3 s, and C leaves at once, from revision 1.
    await clock.advance(100);
    expect(cms.received.map((r) => [r.title, r.revision, r.at])).toEqual([["A", 0, 1_000], ["C", 1, 3_000]]);
    expect(now()).toMatchObject({ phase: "saving", revision: 1, unsavedEdits: 2, savedEdits: 1 });
    await clock.advance(2_000);
    expect(cms.mostOpen).toBe(1);
    expect(cms.stored).toEqual(["save-1", "save-2"]);
    expect(cms.document.title).toBe("C");
    expect(now()).toMatchObject({ phase: "saved", revision: 2, unsavedEdits: 0, savedEdits: 3 });
  });

  test("an answer lost on the way back: the same save goes again, and the server counts it once", async () => {
    const { clock, cms, autosave, now, phases } = setup();
    cms.next("lose-answer");
    autosave.edit(page("Kept"));
    await clock.advance(1_100);
    // Stored at 1.1 s, but the tab hears nothing.
    expect(cms.revision).toBe(1);
    expect(now()).toMatchObject({ phase: "saving", warnOnClose: true });
    await clock.advance(15_000 - 100);
    expect(now()).toMatchObject({ phase: "retrying", outcomeUnknown: true, warnOnClose: true, retryAt: 16_000 + 2_000, unsavedEdits: 1 });
    expect(now().failure).toMatchObject({ kind: "unknown", cause: "timeout" });
    expect(cms.open).toBe(0);
    await clock.advance(2_000 + 100);
    expect(cms.received.map((r) => [r.saveId, r.revision, r.title])).toEqual([["save-1", 0, "Kept"], ["save-1", 0, "Kept"]]);
    expect(cms.stored).toEqual(["save-1"]);
    expect(cms.revision).toBe(1);
    expect(now()).toMatchObject({ phase: "saved", revision: 1, outcomeUnknown: false, warnOnClose: false, retryAt: null, failure: null });
    expect(phases).toEqual(["waiting", "saving", "retrying", "saving", "saved"]);
  });

  test("an unknown outcome, then success, with edits made while it retried leaving after it", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.next("no-network", "server-error");
    autosave.edit(page("First"));
    await clock.advance(1_100);
    expect(now()).toMatchObject({ phase: "retrying", retryAt: 1_100 + 2_000, attempt: 1 });
    autosave.edit(page("Second"));
    await clock.advance(1_000);
    // The pause of Second ran out, but the first save is still owed an
    // outcome: nothing new leaves before it.
    expect(cms.received).toHaveLength(1);
    expect(now()).toMatchObject({ phase: "retrying", unsavedEdits: 2 });
    await clock.advance(1_100);
    // The retry at 3.1 s fails on the server: the next wait is longer.
    expect(now()).toMatchObject({ phase: "retrying", attempt: 2, retryAt: 3_200 + 4_000 });
    await clock.advance(4_100);
    expect(cms.received.map((r) => [r.saveId, r.revision, r.title])).toEqual([
      ["save-1", 0, "First"], ["save-1", 0, "First"], ["save-1", 0, "First"], ["save-2", 1, "Second"],
    ]);
    await clock.advance(100);
    expect(cms.stored).toEqual(["save-1", "save-2"]);
    expect(cms.document.title).toBe("Second");
    expect(now()).toMatchObject({ phase: "saved", revision: 2, unsavedEdits: 0, savedEdits: 2, outcomeUnknown: false });
  });

  test("the waits between retries grow and stop growing at the last, and retryNow sends at once", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.next("no-network", "no-network", "no-network", "no-network", "no-network");
    autosave.edit(page("Patient"));
    await clock.advance(1_100);
    const waits: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const { retryAt } = now();
      waits.push(retryAt! - clock.now());
      await clock.advance(retryAt! - clock.now() + 100);
    }
    expect(waits).toEqual([2_000, 4_000, 8_000, 8_000]);
    expect(now()).toMatchObject({ phase: "retrying", attempt: 5 });
    autosave.retryNow();
    expect(now()).toMatchObject({ phase: "saving", attempt: 6, retryAt: null });
    await clock.advance(100);
    expect(now().phase).toBe("saved");
    expect(new Set(cms.received.map((r) => r.saveId))).toEqual(new Set(["save-1"]));
    expect(cms.received).toHaveLength(6);
    expect(clock.pending).toBe(0);
  });

  test("a conflict stops saving; edits made meanwhile stay in the tab, and overwrite saves them over the other tab's", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.savedElsewhere(page("Theirs"));
    autosave.edit(page("Mine"));
    await clock.advance(1_100);
    expect(now()).toMatchObject({ phase: "conflict", conflict: { currentRevision: 1, lastSaveId: "other-1" }, warnOnClose: true, revision: 0 });
    autosave.edit(page("Mine, more"));
    await clock.advance(10_000);
    expect(cms.received.map((r) => r.title)).toEqual(["Mine"]);
    expect(now()).toMatchObject({ phase: "conflict", unsavedEdits: 2 });
    autosave.overwrite();
    expect(now().phase).toBe("saving");
    await clock.advance(100);
    expect(cms.received.map((r) => [r.title, r.revision])).toEqual([["Mine", 0], ["Mine, more", 1]]);
    expect(cms.document.title).toBe("Mine, more");
    expect(now()).toMatchObject({ phase: "saved", revision: 2, unsavedEdits: 0, conflict: null });
  });

  test("a conflict while an edit waits behind the save in flight: the edit is not sent, and reload takes the server's draft", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.latencyMs = 1_000;
    autosave.edit(page("A"));
    await clock.advance(1_000);
    autosave.edit(page("B, queued"));
    // The other tab's save lands before A does.
    cms.savedElsewhere(page("Theirs"));
    await clock.advance(1_000);
    expect(now()).toMatchObject({ phase: "conflict", unsavedEdits: 2, conflict: { currentRevision: 1 } });
    await clock.advance(5_000);
    expect(cms.received.map((r) => r.title)).toEqual(["A"]);
    const draft = await autosave.reload();
    expect(draft.document.title).toBe("Theirs");
    expect(now()).toMatchObject({ phase: "saved", revision: 1, unsavedEdits: 0, savedEdits: 0, warnOnClose: false, conflict: null });
    // The store puts the server's document in; that is no edit.
    autosave.edit(draft.document);
    await clock.advance(10_000);
    expect(cms.received).toHaveLength(1);
    expect(cms.document.title).toBe("Theirs");
    expect(clock.pending).toBe(0);
  });

  test("an unknown outcome, then a conflict: the conflict is definite and the retrying stops", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.next("no-network");
    autosave.edit(page("Mine"));
    await clock.advance(1_100);
    expect(now().outcomeUnknown).toBe(true);
    cms.savedElsewhere(page("Theirs"));
    await clock.advance(2_100);
    expect(now()).toMatchObject({ phase: "conflict", outcomeUnknown: false, retryAt: null, warnOnClose: true });
    expect(clock.pending).toBe(0);
  });

  test("a document the server refuses waits for the next edit, which is saved", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.next("invalid");
    autosave.edit(page("Refused"));
    await clock.advance(1_100);
    expect(now()).toMatchObject({ phase: "invalid", warnOnClose: true, errors: [{ pointer: "/document/title", keyword: "minLength" }] });
    await clock.advance(30_000);
    expect(cms.received).toHaveLength(1);
    autosave.edit(page("Fixed"));
    await clock.advance(1_100);
    expect(cms.received.map((r) => [r.saveId, r.title])).toEqual([["save-1", "Refused"], ["save-2", "Fixed"]]);
    expect(now()).toMatchObject({ phase: "saved", errors: [], unsavedEdits: 0, savedEdits: 2 });
  });

  test("a refusal after an unknown outcome keeps the outcome unknown, and retryNow sends the same save", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.next("lose-answer", "refuse");
    autosave.edit(page("Kept"));
    await clock.advance(16_000 + 2_100);
    expect(now()).toMatchObject({ phase: "refused", outcomeUnknown: true, warnOnClose: true });
    expect(now().failure).toMatchObject({ kind: "refused", status: 403 });
    await clock.advance(60_000);
    expect(cms.received).toHaveLength(2);
    autosave.retryNow();
    await clock.advance(100);
    expect(cms.received.map((r) => r.saveId)).toEqual(["save-1", "save-1", "save-1"]);
    expect(cms.stored).toEqual(["save-1"]);
    expect(now()).toMatchObject({ phase: "saved", revision: 1, outcomeUnknown: false, failure: null });
  });

  test("a first refusal stores nothing, and the next edit is a new save of the newest document", async () => {
    const { clock, cms, autosave, now } = setup();
    cms.next("refuse");
    autosave.edit(page("Refused"));
    await clock.advance(1_100);
    expect(now()).toMatchObject({ phase: "refused", outcomeUnknown: false, warnOnClose: true });
    autosave.edit(page("Again"));
    await clock.advance(1_100);
    expect(cms.received.map((r) => [r.saveId, r.title])).toEqual([["save-1", "Refused"], ["save-2", "Again"]]);
    expect(now().phase).toBe("saved");
  });

  test("flush sends what waits without the pause and resolves once it is saved; while retrying it resolves at once", async () => {
    const { clock, cms, autosave } = setup();
    autosave.edit(page("Publish me"));
    const flushed = autosave.flush();
    expect(cms.received.map((r) => r.at)).toEqual([0]);
    await clock.advance(100);
    await expect(flushed).resolves.toMatchObject({ phase: "saved", revision: 1 });

    cms.next("no-network");
    autosave.edit(page("Not yet"));
    const second = autosave.flush();
    await clock.advance(100);
    await expect(second).resolves.toMatchObject({ phase: "retrying", outcomeUnknown: true });
    await expect(autosave.flush()).resolves.toMatchObject({ phase: "retrying" });
  });

  test("dispose stops the timers and ignores the answer still to come", async () => {
    const { clock, cms, autosave, now } = setup();
    autosave.edit(page("Last"));
    await clock.advance(1_000);
    autosave.dispose();
    const before = now();
    await clock.advance(20_000);
    expect(cms.received).toHaveLength(1);
    expect(now()).toBe(before);
    expect(clock.pending).toBe(0);
  });
});

describe("the autosave's imports", () => {
  test("are the storage interface, the clock and the document's types, never the interface's code", () => {
    const source = readFileSync(new URL("./autosave.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import[^;]*?from\s+"([^"]+)";/gms)].map((m) => m[1]);
    expect(imports).toEqual(["./adapter.ts", "./clock.ts", "../shared/document.ts"]);
  });
});
