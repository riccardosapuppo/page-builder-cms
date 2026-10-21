// The Assistant's pages written aside (./assistant-aside.ts), on a storage
// of the test's own and a fake clock: a page made without being opened, at
// its address or the next free one; each command applied to its document in
// memory, shown to the preview as it grows, a few times a second at most;
// saved by an autosave of its own after its pause, and flushed at the
// page's end, then let go; a refusal said, nothing changed; a flush that
// does not end saved said, one whose answer was lost sent again until it is
// saved. Through ../assistant/write.ts, a run stopped midway keeps what was
// made, saved as the page's draft. Closing the tab while a page's edits are
// only here asks first, until its autosave is let go.
// @vitest-environment jsdom
import { expect, test } from "vitest";
import { FakeClock } from "../../test/fake-clock.ts";
import type { WrittenPage } from "../assistant/context.tsx";
import { writePage } from "../assistant/write.ts";
import { AssistantError } from "../assistant/providers.ts";
import { makeInsert, makeSetPage } from "../document/commands.ts";
import type { Block, PageDocument } from "../shared/document.ts";
import { StorageError, type DraftSave } from "../storage/adapter.ts";
import { asideHooks, asideSiteHooks, SHOW_MS } from "./assistant-aside.ts";
import { emptySession, type Session } from "./session.tsx";
import { createUiStore } from "./ui-store.ts";

const T = "2026-10-21T08:00:00.000Z";

// The storage: pages made at free addresses, their drafts at revisions,
// each save taken at the draft's revision; the next saves answered as the
// test says: kept, refused as a conflict, or with no answer at all.
function storage(taken: string[] = []) {
  const slugs = new Set(taken);
  const drafts = new Map<number, { revision: number; document: PageDocument }>();
  const asked: string[] = [];
  const saves: Array<{ id: number; revision: number; sections: string[] }> = [];
  const answers: Array<"conflict" | "lost"> = [];
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
        const draft = drafts.get(id)!;
        if (answer === "conflict" || save.revision !== draft.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: draft.revision + 1, lastSaveId: null } };
        drafts.set(id, { revision: draft.revision + 1, document: save.document });
        return { ok: true, value: { revision: draft.revision + 1, lastSaveId: save.saveId, updatedAt: T } };
      },
    },
  };
  return { session, drafts, asked, saves, answers };
}

const section = (id: string, label: string): Block => ({
  id, type: "section", props: { label }, style: { base: {} },
  children: [{ id: `${id}-c`, type: "column", props: {}, style: { base: {} }, children: [{ id: `${id}-h`, type: "heading", props: { level: 2, text: label }, style: { base: {} }, children: [] }] }],
} as unknown as Block);

function set(taken: string[] = []) {
  const clock = new FakeClock(Date.UTC(2026, 9, 21, 8));
  const kept = storage(taken);
  const shown: WrittenPage[] = [];
  const hooks = asideHooks({ session: kept.session, clock, library: null, show: (page) => shown.push(page) });
  const add = (id: string, label: string) => {
    const doc = hooks.document();
    return hooks.apply(makeInsert(doc, section(id, label), { parentId: null, index: doc.sections.length }));
  };
  return { clock, kept, shown, hooks, add };
}

test("a page made aside, at its address or the next free one; each command applied to its document in memory, shown to the preview as it grows, a few times a second at most", async () => {
  const { clock, kept, shown, hooks, add } = set(["open-day"]);
  expect(await hooks.open("Open day")).toBeNull();
  expect(kept.asked).toEqual(["open-day", "open-day-2"]);
  expect(hooks.made()).toEqual({ id: 11, slug: "open-day-2" });
  expect(hooks.still()).toBe(true);
  // Shown at once as it is made, empty.
  expect(shown.map((page) => [page.id, page.title, page.document.sections.length])).toEqual([[11, "Open day", 0]]);
  expect([add("s1", "Hero"), add("s2", "Book")]).toEqual([null, null]);
  expect(hooks.document().sections.map((one) => one.props.label)).toEqual(["Hero", "Book"]);
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
  const { clock, kept, hooks, add } = set();
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

test("an end that does not end saved is said: the page saved somewhere else; no answer, the save then sent again by itself until it is kept, and let go", async () => {
  const elsewhere = set();
  await elsewhere.hooks.open("Open day");
  elsewhere.add("s1", "Hero");
  elsewhere.kept.answers.push("conflict");
  expect(await elsewhere.hooks.end!()).toBe("the page was saved somewhere else meanwhile.");
  expect(elsewhere.clock.pending).toBe(0);

  const lost = set();
  await lost.hooks.open("Open day");
  lost.add("s1", "Hero");
  lost.kept.answers.push("lost");
  expect(await lost.hooks.end!()).toBe("no answer came about their save (The network failed.), and the editor is sending it again.");
  // Sent again after its wait, kept, then let go.
  await lost.clock.advance(2_000);
  expect(lost.kept.saves.map((save) => save.revision)).toEqual([0, 0]);
  expect(lost.kept.drafts.get(11)).toMatchObject({ revision: 1 });
  expect(lost.clock.pending).toBe(0);
});

test("closing the tab while the page's edits are only here asks first, as for the page open; saved, or let go at the page's end, it asks nothing", async () => {
  const { clock, hooks, add } = set();
  await hooks.open("Open day");
  const closing = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
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
  expect(kept.drafts.get(11)!.document.sections.map((one) => one.props.label)).toEqual(["Hero"]);
  expect(shown.at(-1)!.document.sections.map((one) => one.props.label)).toEqual(["Hero"]);
});

test("a new site's hooks: its pages written aside at their planned addresses; the addresses taken, the header as it is now", async () => {
  const clock = new FakeClock();
  const kept = storage();
  const ui = createUiStore({ parts: { header: { schemaVersion: 1, title: "Header", sticky: true, sections: [] }, footer: null } });
  const session = emptySession({ ...kept.session, pages: [{ id: 1, kind: "page", title: "Home", slug: "home", home: true, revision: 1, updatedAt: T, published: null, scheduled: null, links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null } }] });
  const hooks = asideSiteHooks({ session, ui, clock, library: null, show: () => undefined });
  expect(hooks.taken()).toEqual(["home"]);
  expect(hooks.header()?.sticky).toBe(true);
  const page = hooks.page({ slug: "classes" });
  expect(await page.open("Classes")).toBeNull();
  expect([kept.asked, page.made()]).toEqual([["classes"], { id: 11, slug: "classes" }]);
  expect(await page.end!()).toBeNull();
});
