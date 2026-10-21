// The Assistant's pages written aside (./assistant-aside.ts), on a storage
// of the test's own and a fake clock: a page made without being opened, at
// its address or the next free one; each command applied to its document in
// memory, shown to the preview as it grows, a few times a second at most;
// saved by an autosave of its own after its pause, and flushed at the
// page's end, then let go; a refusal said, nothing changed. A page whose
// last changes are not saved as it ends (refused, saved somewhere else, no
// answer) is said and kept as this tab holds it, its autosave alive and
// closing the tab asking first: one whose answer was lost is sent again by
// itself, and let go once saved after all, kept still if that save is
// refused or meets another; a change of it (a new site's buttons led
// elsewhere) is tried again; settled, its save on its way is answered and
// none goes after. Through ../assistant/write.ts, a run stopped midway
// keeps what was made, saved as the page's draft. Closing the tab while a
// page's edits are only here asks first, until its autosave is let go.
// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import type { PendingPage, WrittenPage } from "../assistant/context.tsx";
import { writePage } from "../assistant/write.ts";
import { AssistantError } from "../assistant/providers.ts";
import { makeInsert, makeSetPage } from "../document/commands.ts";
import type { Block, PageDocument } from "../shared/document.ts";
import { StorageError, type DraftSave } from "../storage/adapter.ts";
import { asideHooks, asideSiteHooks, KEPT_HERE, SHOW_MS, type PendingPages } from "./assistant-aside.ts";
import { emptySession, type Session } from "./session.tsx";
import { createUiStore } from "./ui-store.ts";

const T = "2026-10-21T08:00:00.000Z";

// The storage: pages made at free addresses, their drafts at revisions,
// each save taken at the draft's revision; the next saves answered as the
// test says: kept, refused as a conflict, refused outright (a 403), or
// with no answer at all.
function storage(taken: string[] = []) {
  const slugs = new Set(taken);
  const drafts = new Map<number, { revision: number; document: PageDocument }>();
  const asked: string[] = [];
  const saves: Array<{ id: number; revision: number; sections: string[] }> = [];
  const answers: Array<"conflict" | "lost" | "refused"> = [];
  let next = 10;
  const session: Pick<Session, "makePageAside" | "drafts" | "cmsOrigin"> = {
    cmsOrigin: "http://127.0.0.1:3900",
    async makePageAside({ title, slug }) {
      asked.push(slug);
      if (slugs.has(slug)) return { ok: false, errors: [{ pointer: "/slug", keyword: "taken", blockPointer: null, message: "is already the address of another page" }] };
      if (slug === "broken") return { ok: false, errors: [{ pointer: "", keyword: "unknown", blockPointer: null, message: "The page could not be made: the CMS did not answer." }] };
      slugs.add(slug);
      const id = ++next;
      const document: PageDocument = { schemaVersion: 1, title, sections: [] };
      drafts.set(id, { revision: 0, document });
      return { ok: true, id, revision: 0, document };
    },
    drafts: {
      getDraft: async (id) => ({ ...drafts.get(id)!, lastSaveId: null, updatedAt: T }),
      async saveDraft(id, save: DraftSave) {
        saves.push({ id, revision: save.revision, sections: save.document.sections.map((section) => section.props.label ?? "") });
        const answer = answers.shift();
        if (answer === "lost") throw new StorageError({ kind: "unknown", cause: "network", status: null, message: "The network failed." });
        if (answer === "refused") throw new StorageError({ kind: "refused", status: 403, code: "forbidden", message: "Saving is not allowed here." });
        const draft = drafts.get(id)!;
        if (answer === "conflict" || save.revision !== draft.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: draft.revision + 1, lastSaveId: null } };
        drafts.set(id, { revision: draft.revision + 1, document: save.document });
        return { ok: true, value: { revision: draft.revision + 1, lastSaveId: save.saveId, updatedAt: T } };
      },
    },
  };
  return { session, drafts, asked, saves, answers };
}

// Where the pages whose last changes were not saved are kept, as the
// Assistant's state keeps them (../assistant/context.tsx): those saved
// after all heard of. Every one still kept is let go after each test, so
// that none of them asks about a tab closed in the next.
const registries: Array<Map<number, PendingPage>> = [];
function registry() {
  const kept = new Map<number, PendingPage>();
  const saved: number[] = [];
  registries.push(kept);
  const pending: PendingPages = {
    get: (id) => kept.get(id),
    keep: (page) => void kept.set(page.id, page),
    saved: (id) => {
      kept.delete(id);
      saved.push(id);
    },
  };
  return { kept, saved, pending };
}
afterEach(() => {
  for (const kept of registries.splice(0)) for (const page of kept.values()) page.letGo();
});

// Whether closing the tab now asks first.
const closing = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

const section = (id: string, label: string): Block => ({
  id, type: "section", props: { label }, style: { base: {} },
  children: [{ id: `${id}-c`, type: "column", props: {}, style: { base: {} }, children: [{ id: `${id}-h`, type: "heading", props: { level: 2, text: label }, style: { base: {} }, children: [] }] }],
} as unknown as Block);

function set(taken: string[] = []) {
  const clock = new FakeClock(Date.UTC(2026, 9, 21, 8));
  const kept = storage(taken);
  const held = registry();
  const shown: WrittenPage[] = [];
  const hooks = asideHooks({ session: kept.session, clock, library: null, show: (page) => shown.push(page), pending: held.pending });
  const add = (id: string, label: string) => {
    const doc = hooks.document();
    return hooks.apply(makeInsert(doc, section(id, label), { parentId: null, index: doc.sections.length }));
  };
  return { clock, kept, held, shown, hooks, add };
}

const labels = (document: PageDocument) => document.sections.map((one) => one.props.label);

test("a page made aside, at its address or the next free one; each command applied to its document in memory, shown to the preview as it grows, a few times a second at most", async () => {
  const { clock, kept, shown, hooks, add } = set(["open-day"]);
  expect(await hooks.open("Open day")).toBeNull();
  expect(kept.asked).toEqual(["open-day", "open-day-2"]);
  expect(hooks.made()).toEqual({ id: 11, slug: "open-day-2" });
  expect(hooks.still()).toBe(true);
  // Shown at once as it is made, empty.
  expect(shown.map((page) => [page.id, page.title, page.document.sections.length])).toEqual([[11, "Open day", 0]]);
  expect([add("s1", "Hero"), add("s2", "Book")]).toEqual([null, null]);
  expect(labels(hooks.document())).toEqual(["Hero", "Book"]);
  // The two that came within SHOW_MS, shown once, together.
  expect(shown).toHaveLength(1);
  await clock.advance(SHOW_MS);
  expect(shown.map((page) => page.document.sections.length)).toEqual([0, 2]);
  expect(shown[1]!.document).toBe(hooks.document());
  // Its end shows it once more, as it ends.
  expect(await hooks.end!()).toBeNull();
  expect(shown).toHaveLength(3);
});

test("saved through an autosave of its own, after its pause; flushed at the page's end and let go, no timer left", async () => {
  const { clock, kept, held, hooks, add } = set();
  await hooks.open("Open day");
  add("s1", "Hero");
  // Nothing goes before the pause.
  expect(kept.saves).toEqual([]);
  await clock.advance(1_000);
  expect(kept.saves).toEqual([{ id: 11, revision: 0, sections: ["Hero"] }]);
  add("s2", "Book");
  expect(hooks.apply(makeSetPage(hooks.document(), { description: "Trial swims." }))).toBeNull();
  // The end saves at once what waits, and says the page is saved.
  expect(await hooks.end!()).toBeNull();
  expect(kept.saves).toEqual([{ id: 11, revision: 0, sections: ["Hero"] }, { id: 11, revision: 1, sections: ["Hero", "Book"] }]);
  expect(kept.drafts.get(11)).toMatchObject({ revision: 2, document: { description: "Trial swims.", sections: [{ props: { label: "Hero" } }, { props: { label: "Book" } }] } });
  expect(clock.pending).toBe(0);
  // Saved: nothing kept.
  expect(held.kept.size).toBe(0);
});

test("a command the page refuses, or one not made, is said, and changes nothing; a page that cannot be made is said, and so is one with no free address", async () => {
  const { hooks, add } = set();
  await hooks.open("Open day");
  add("s1", "Hero");
  const before = hooks.document();
  // The same id again: refused by the page's rules.
  expect(add("s1", "Hero again")).toMatch(/s1/);
  expect(hooks.apply({ ok: false, error: { kind: "invalid", message: "There is nothing to change." } as never })).toBe("There is nothing to change.");
  expect(hooks.document()).toBe(before);
  expect(await hooks.end!()).toBeNull();

  const broken = set().hooks;
  expect(await broken.open("Broken")).toBe("The page could not be made: the CMS did not answer.");
  expect(broken.made()).toBeNull();
  const full = set(["gym", "gym-2", "gym-3", "gym-4", "gym-5"]);
  expect(await full.hooks.open("Gym")).toBe("No free address was found for the new page.");
  expect(full.kept.asked).toEqual(["gym", "gym-2", "gym-3", "gym-4", "gym-5"]);
});

test("a page whose last save is refused as it ends is said and kept as this tab holds it: its autosave alive, closing the tab asking first, nothing sent again by itself; changed (a new site's buttons led elsewhere), it is tried again, and once saved let go", async () => {
  const { clock, kept, held, hooks, add } = set();
  await hooks.open("Open day");
  add("s1", "Hero");
  kept.answers.push("refused");
  expect(await hooks.end!()).toBe(`the CMS refused them: Saving is not allowed here. ${KEPT_HERE}`);
  expect(KEPT_HERE).toBe("Open it to try again; they are kept in this tab until then.");
  const page = held.kept.get(11)!;
  expect([page.id, page.title, labels(page.document()), page.revision()]).toEqual([11, "Open day", ["Hero"], 0]);
  expect(page.document()).toBe(hooks.document());
  expect(closing()).toBe(true);
  // A refusal stays one until something changes: nothing goes by itself.
  await clock.advance(60_000);
  expect(kept.saves).toHaveLength(1);
  expect(held.kept.has(11)).toBe(true);
  // Changed as this tab holds it: tried again at once, saved, and let go.
  expect(await page.change({ ...page.document(), description: "Trial swims." })).toBe(true);
  expect(kept.drafts.get(11)).toMatchObject({ revision: 1, document: { description: "Trial swims.", sections: [{ props: { label: "Hero" } }] } });
  expect(held.saved).toEqual([11]);
  expect(held.kept.size).toBe(0);
  expect(closing()).toBe(false);
  expect(clock.pending).toBe(0);
});

test("a page saved somewhere else as it ends is said and kept too, closing the tab asking first, never sent again over the other save", async () => {
  const { clock, kept, held, hooks, add } = set();
  await hooks.open("Open day");
  add("s1", "Hero");
  kept.answers.push("conflict");
  expect(await hooks.end!()).toBe(`the page was saved somewhere else meanwhile. ${KEPT_HERE}`);
  expect(labels(held.kept.get(11)!.document())).toEqual(["Hero"]);
  expect(closing()).toBe(true);
  await clock.advance(60_000);
  expect(kept.saves).toHaveLength(1);
  expect(held.saved).toEqual([]);
});

test("a page whose last save had no answer is said and kept, the save sent again by itself: saved after all, it is let go and said so; refused when sent again, or met by another save, it is kept still", async () => {
  const lost = set();
  await lost.hooks.open("Open day");
  lost.add("s1", "Hero");
  lost.kept.answers.push("lost");
  expect(await lost.hooks.end!()).toBe(`no answer came about their save (The network failed.), and the editor is sending it again. ${KEPT_HERE}`);
  expect(lost.held.kept.has(11)).toBe(true);
  expect(closing()).toBe(true);
  // Sent again after its wait, kept: let go, and said saved after all.
  await lost.clock.advance(2_000);
  expect(lost.kept.saves.map((save) => save.revision)).toEqual([0, 0]);
  expect(lost.kept.drafts.get(11)).toMatchObject({ revision: 1 });
  expect([lost.held.saved, lost.held.kept.size]).toEqual([[11], 0]);
  expect(closing()).toBe(false);
  expect(lost.clock.pending).toBe(0);

  for (const then of ["refused", "conflict"] as const) {
    const again = set();
    await again.hooks.open("Open day");
    again.add("s1", "Hero");
    again.kept.answers.push("lost", then);
    await again.hooks.end!();
    await again.clock.advance(2_000);
    expect(again.kept.saves).toHaveLength(2);
    // The second answer is a sure one: kept still, as this tab holds it.
    expect(again.held.saved).toEqual([]);
    expect(labels(again.held.kept.get(11)!.document())).toEqual(["Hero"]);
    expect(closing()).toBe(true);
    again.held.kept.get(11)!.letGo();
    again.held.kept.clear();
  }
  expect(closing()).toBe(false);
});

test("a page kept, settled before it is opened: what waits is sent, its save on its way answered; then none goes any more, its document kept, closing the tab still asking first until it is let go", async () => {
  // Refused as it ended, then changed: settled, the change is sent at once and saved.
  const refused = set();
  await refused.hooks.open("Open day");
  refused.add("s1", "Hero");
  refused.kept.answers.push("refused");
  await refused.hooks.end!();
  const page = refused.held.kept.get(11)!;
  refused.kept.answers.push("refused");
  const changed = page.change({ ...page.document(), description: "Trial swims." });
  await page.settle();
  expect(await changed).toBe(false);
  expect(refused.kept.saves).toHaveLength(2);
  expect(page.document().description).toBe("Trial swims.");

  // No answer as it ended: settled, the save is never sent again.
  const lost = set();
  await lost.hooks.open("Open day");
  lost.add("s1", "Hero");
  lost.kept.answers.push("lost");
  await lost.hooks.end!();
  const kept = lost.held.kept.get(11)!;
  await kept.settle();
  await lost.clock.advance(60_000);
  expect(lost.kept.saves).toHaveLength(1);
  expect(lost.clock.pending).toBe(0);
  expect([lost.held.kept.has(11), lost.held.saved]).toEqual([true, []]);
  expect(labels(kept.document())).toEqual(["Hero"]);
  expect(closing()).toBe(true);
  kept.letGo();
  page.letGo();
  expect(closing()).toBe(false);
});

test("closing the tab while the page's edits are only here asks first, as for the page open; saved, or let go at the page's end, it asks nothing", async () => {
  const { clock, hooks, add } = set();
  await hooks.open("Open day");
  expect(closing()).toBe(false);
  add("s1", "Hero");
  expect(closing()).toBe(true);
  await clock.advance(1_000);
  expect(closing()).toBe(false);
  add("s2", "Book");
  expect(closing()).toBe(true);
  expect(await hooks.end!()).toBeNull();
  expect(closing()).toBe(false);
});

test("written by ../assistant/write.ts and stopped midway: what was made stays, saved as the page's draft, and the preview was shown it", async () => {
  const { kept, shown, hooks } = set();
  const stop = new AbortController();
  const plan = JSON.stringify({
    title: "Open day",
    description: "",
    sections: [
      { label: "Hero", anchor: "", background: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 1, text: "Open day", display: true }] }] },
      { label: "Book", anchor: "", background: "none", widths: "equal", columns: [{ align: "left", blocks: [{ kind: "heading", level: 2, text: "Book", display: false }] }] },
    ],
  });
  const written = await writePage({
    ask: async (piece) => {
      piece(plan.slice(0, plan.indexOf("\"label\":\"Book\"")));
      await new Promise((done) => setTimeout(done, 0));
      stop.abort();
      throw new AssistantError("Stopped.", "stopped");
    },
    facts: { media: [], paths: [], brief: "An open day." },
    newId: (() => {
      let n = 0;
      return () => `n${++n}`;
    })(),
    hooks,
    tell: () => undefined,
    signal: stop.signal,
  });
  expect(written).toMatchObject({ phase: "stopped", title: "Open day" });
  expect(written.unsaved).toBeUndefined();
  expect(labels(kept.drafts.get(11)!.document)).toEqual(["Hero"]);
  expect(labels(shown.at(-1)!.document)).toEqual(["Hero"]);
});

test("a new site's hooks: its pages written aside at their planned addresses; the addresses taken, the header as it is now; a page kept with its last changes not saved is changed as this tab holds it, any other through the editor", async () => {
  const clock = new FakeClock();
  const kept = storage();
  const held = registry();
  const changed: number[] = [];
  const ui = createUiStore({ parts: { header: { schemaVersion: 1, title: "Header", sticky: true, sections: [] }, footer: null } });
  const session = emptySession({
    ...kept.session,
    pages: [{ id: 1, kind: "page", title: "Home", slug: "home", home: true, revision: 1, updatedAt: T, published: null, scheduled: null, links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null } }],
    changeDraft: async (id) => (changed.push(id), null),
  });
  const hooks = asideSiteHooks({ session, ui, clock, library: null, show: () => undefined, pending: held.pending });
  expect(hooks.taken()).toEqual(["home"]);
  expect(hooks.header()?.sticky).toBe(true);
  const page = hooks.page({ slug: "classes" });
  expect(await page.open("Classes")).toBeNull();
  expect([kept.asked, page.made()]).toEqual([["classes"], { id: 11, slug: "classes" }]);
  expect(page.apply(makeInsert(page.document(), section("s1", "Hero"), { parentId: null, index: 0 }))).toBeNull();
  kept.answers.push("refused");
  expect(await page.end!()).toBe(`the CMS refused them: Saving is not allowed here. ${KEPT_HERE}`);
  // The site's clean-up: the page kept is changed as this tab holds it, and
  // tried again (saved now), never read from its draft; another page goes
  // through the editor.
  const relink = (doc: PageDocument) => ({ document: { ...doc, description: "Relinked." }, label: "Assistant led buttons to the pages made" });
  expect(await hooks.changePage(11, relink)).toBeNull();
  expect(kept.drafts.get(11)).toMatchObject({ revision: 1, document: { description: "Relinked.", sections: [{ props: { label: "Hero" } }] } });
  expect([held.saved, changed]).toEqual([[11], []]);
  expect(await hooks.changePage(1, relink)).toBeNull();
  expect(changed).toEqual([1]);
  // Nothing to change on the page kept: nothing tried.
  kept.answers.push("refused");
  const other = hooks.page({ slug: "join" });
  await other.open("Join");
  other.apply(makeInsert(other.document(), section("s2", "Join"), { parentId: null, index: 0 }));
  await other.end!();
  expect(await hooks.changePage(12, () => null)).toBeNull();
  expect(kept.saves.filter((save) => save.id === 12)).toHaveLength(1);
});
