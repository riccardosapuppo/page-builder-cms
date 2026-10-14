// A page written from a brief (./write.ts), on a real editor store and an
// answer of the test's own that comes in pieces: the page is made from the
// plan's title, each section goes in as a command of the Assistant's, a
// button whose section never came goes, and a stop, a failure or another
// page opened midway keep what is in and add nothing more.
import { expect, test } from "vitest";
import type { Made } from "../document/commands.ts";
import { createEditorStore, type EditorStore } from "../store/editor-store.ts";
import type { PageDocument } from "../shared/document.ts";
import { AssistantError, type Answer } from "./providers.ts";
import { writePage, type PageHooks, type Writing } from "./write.ts";

const FACTS = { media: [], paths: ["/"], brief: "An open day." };

const words = (text: string) => ({ kind: "text", paragraphs: [text] });
const section = (label: string, blocks: unknown[], anchor = "") => ({ label, anchor, background: "none", widths: "equal", columns: [{ align: "left", blocks }] });
const PLAN = {
  title: "Open day",
  description: "Swim with us on 12 April.",
  sections: [
    section("Hero", [{ kind: "heading", level: 1, text: "Open day", display: true }, { kind: "button", label: "Book", target: "#join" }, { kind: "button", label: "Prices", target: "#prices" }]),
    section("Empty", [{ kind: "image", mediaId: "none", alt: "" }]),
    section("Join", [words("Write to us.")], "join"),
  ],
};

function editor(opened = true) {
  let store: EditorStore | null = null;
  let still = true;
  const titles: string[] = [];
  const hooks: PageHooks = {
    open: async (title) => {
      titles.push(title);
      if (!opened) return "The page could not be made.";
      const doc: PageDocument = { schemaVersion: 1, title, sections: [] };
      store = createEditorStore({ document: doc, now: () => 0 });
      return null;
    },
    still: () => still,
    document: () => store!.getState().document,
    apply: (made: Made) => {
      if (!made.ok) return made.error.message;
      const outcome = store!.getState().dispatch(made.command);
      return outcome.ok ? null : outcome.error.message;
    },
  };
  return { hooks, titles, page: () => store, leave: () => (still = false) };
}

let ids = 0;
const newId = () => `x${++ids}`;

// An answer that writes `text` in pieces of `size`, then ends as asked.
function answer(text: string, size = 7, end: (written: number) => Answer | Error = () => ({ text, usage: { input: 10, output: 20 } }), between?: (at: number) => void) {
  return async (written: (piece: string) => void): Promise<Answer> => {
    let at = 0;
    for (; at < text.length; at += size) {
      written(text.slice(at, at + size));
      between?.(at);
      await Promise.resolve();
    }
    const ending = end(at);
    if (ending instanceof Error) throw ending;
    return ending;
  };
}

test("the page is made from the plan's title; each section goes in as the Assistant's own step; a button whose section never came goes", async () => {
  const { hooks, titles, page } = editor();
  const told: Writing["phase"][] = [];
  const result = await writePage({ ask: answer(JSON.stringify(PLAN)), facts: FACTS, newId, hooks, tell: (writing) => told.push(writing.phase) });
  expect(titles).toEqual(["Open day"]);
  const state = page()!.getState();
  expect(state.document.description).toBe("Swim with us on 12 April.");
  expect(state.document.sections.map((s) => s.props.label)).toEqual(["Hero", "Join"]);
  expect(state.document.sections[0]!.children[0]!.children.map((b) => b.props)).toEqual([
    { level: 1, text: "Open day" },
    { label: "Book", href: "#join" },
  ]);
  expect(state.past.map((entry) => entry.command.label)).toEqual([
    "Assistant changed the page description",
    "Assistant added section Hero",
    "Assistant added section Join",
    "Assistant deleted Button in Hero",
  ]);
  expect(result).toEqual({
    phase: "done",
    title: "Open day",
    sections: [{ label: "Hero", kept: true }, { label: "Empty", kept: false }, { label: "Join", kept: true }],
    notes: [
      "Left out an image that is not in the site's library.",
      "Left out the section “Empty”: nothing in it could be kept.",
      "Took out the button “Prices”: the section it leads to was not written.",
    ],
    usage: { input: 10, output: 20 },
    error: null,
  });
  expect(told[0]).toBe("asking");
  expect(told).toContain("writing");
  expect(told.at(-1)).toBe("done");
});

test("stopped while writing: the sections that had come stay, nothing more is asked", async () => {
  const { hooks, page } = editor();
  const text = JSON.stringify(PLAN);
  const cut = text.indexOf("\"label\":\"Join\"");
  const result = await writePage({
    ask: answer(text.slice(0, cut), 7, () => new AssistantError("Stopped.", "stopped")),
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(result.phase).toBe("stopped");
  expect(result.error).toBeNull();
  expect(page()!.getState().document.sections.map((s) => s.props.label)).toEqual(["Hero"]);
});

test("refused before a word: no page is made, and the reason is said", async () => {
  const { hooks, titles } = editor();
  const result = await writePage({
    ask: async () => {
      throw new AssistantError("Anthropic did not accept this key.", "key");
    },
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(titles).toEqual([]);
  expect(result).toMatchObject({ phase: "failed", error: "Anthropic did not accept this key.", sections: [] });
});

test("another page opened midway: nothing more lands, on it or anywhere", async () => {
  const { hooks, page, leave } = editor();
  const text = JSON.stringify(PLAN);
  const result = await writePage({
    // Once Hero is on the page, as a person would open another page.
    ask: answer(text, 7, undefined, () => {
      if ((page()?.getState().document.sections.length ?? 0) >= 1) leave();
    }),
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(result.phase).toBe("failed");
  expect(result.error).toBe("Another page was opened: the Assistant stopped writing to this one.");
  expect(page()!.getState().document.sections.map((s) => s.props.label)).toEqual(["Hero"]);
});

test("a page that cannot be made: nothing is written, and the reason is said", async () => {
  const { hooks } = editor(false);
  const result = await writePage({ ask: answer(JSON.stringify(PLAN)), facts: FACTS, newId, hooks, tell: () => undefined });
  expect(result).toMatchObject({ phase: "failed", error: "The page could not be made.", title: null });
});

test("an answer that ends before it is whole: what came is on the page, and it is said", async () => {
  const { hooks, page } = editor();
  const text = JSON.stringify(PLAN);
  const result = await writePage({ ask: answer(text.slice(0, text.lastIndexOf("]"))), facts: FACTS, newId, hooks, tell: () => undefined });
  expect(result.phase).toBe("done");
  expect(result.notes).toContain("The answer ended before it was whole: what came is on the page.");
  expect(page()!.getState().document.sections).toHaveLength(2);
});

test("stopped while the new page is still being made: the sections that had come wait no longer, and none lands", async () => {
  const { hooks, page } = editor();
  let opened: () => void = () => undefined;
  const slow: PageHooks = { ...hooks, open: (title) => new Promise((done) => (opened = () => void hooks.open(title).then(done))) };
  const stop = new AbortController();
  const text = JSON.stringify(PLAN);
  const result = writePage({
    // Every section comes, then the answer waits until it is stopped.
    ask: async (written) => {
      written(text);
      await new Promise((done) => stop.signal.addEventListener("abort", done));
      throw new AssistantError("Stopped.", "stopped");
    },
    facts: FACTS, newId, hooks: slow, tell: () => undefined, signal: stop.signal,
  });
  await new Promise((done) => setTimeout(done, 0));
  stop.abort();
  opened();
  expect((await result).phase).toBe("stopped");
  expect(page()!.getState().document.sections).toEqual([]);
});

test("an answer that fails after a button's section was named but never written: the button still goes, as at a whole answer's end", async () => {
  const { hooks, page } = editor();
  const text = JSON.stringify(PLAN);
  // Hero, whose Book button leads to #join, comes; then the provider fails.
  const cut = text.indexOf("\"label\":\"Empty\"");
  const result = await writePage({
    ask: answer(text.slice(0, cut), 7, () => new AssistantError("Anthropic is busy just now. Try again in a minute.", "busy")),
    facts: FACTS, newId, hooks, tell: () => undefined,
  });
  expect(result.phase).toBe("failed");
  const hero = page()!.getState().document.sections[0]!.children[0]!.children;
  expect(hero.map((block) => block.type)).toEqual(["heading"]);
  expect(result.notes).toEqual([
    "Took out the button “Book”: the section it leads to was not written.",
    "Took out the button “Prices”: the section it leads to was not written.",
  ]);
});
