// The sample written by hand (./sample.ts): it goes through the same steps
// as a model's answer and the page takes every section of it, its steps to
// book among them, with the library's first image or without one; it
// streams on the clock, and stops when asked.
import { expect, test } from "vitest";
import type { Made } from "../document/commands.ts";
import { createEditorStore, type EditorStore } from "../store/editor-store.ts";
import { FakeClock } from "../../test/fake-clock.ts";
import { sampleAnswer, samplePlan, SAMPLE_BRIEF } from "./sample.ts";
import { writePage, type PageHooks } from "./write.ts";

async function write(media: Array<{ id: string; alt: string }>, stopAt?: number) {
  const clock = new FakeClock();
  let store: EditorStore | null = null;
  const hooks: PageHooks = {
    open: async (title) => {
      store = createEditorStore({ document: { schemaVersion: 1, title, sections: [] }, now: () => 0 });
      return null;
    },
    still: () => true,
    document: () => store!.getState().document,
    apply: (made: Made) => {
      if (!made.ok) return made.error.message;
      const outcome = store!.getState().dispatch(made.command);
      return outcome.ok ? null : outcome.error.message;
    },
  };
  const stop = new AbortController();
  let ids = 0;
  const writing = writePage({
    ask: sampleAnswer(samplePlan(media), clock, stop.signal),
    facts: { media, paths: ["/"], brief: SAMPLE_BRIEF },
    newId: () => `s${++ids}`,
    hooks,
    tell: () => undefined,
  });
  if (stopAt !== undefined) {
    await clock.advance(stopAt);
    stop.abort();
  }
  await clock.advance(60_000);
  return { result: await writing, page: () => store };
}

test("with the library's first image: every section of the sample goes in, nothing left out, the image behind its opening and two sections coming into view", async () => {
  const { result, page } = await write([{ id: "m1", alt: "Swimmers at the slipway" }]);
  expect(result).toMatchObject({ phase: "done", title: "Open day", notes: [], error: null });
  const doc = page()!.getState().document;
  expect(doc.sections.map((s) => s.props.label)).toEqual(["Opening", "The morning", "Questions", "Book"]);
  expect(doc.sections[0]!.props).toEqual({ label: "Opening", picture: { mediaId: "m1" } });
  expect(doc.sections[0]!.style.base).toEqual({ background: "text", veil: "dark", veilStrength: "strong" });
  expect(doc.sections[0]!.children).toHaveLength(1);
  expect(doc.sections.map((s) => s.style.base.motion ?? null)).toEqual([null, "rise", "fade", null]);
  // How to book, in three steps, before the form.
  const book = doc.sections[3]!.children[0]!.children;
  expect(book.map((block) => block.type)).toEqual(["heading", "steps", "form"]);
  expect((book[1]!.props as { items: Array<{ title: string }> }).items.map((step) => step.title)).toEqual(["Fill in the form", "Hear back from us", "Come to the slipway"]);
});

test("with an empty library: no picture to open with, a soft band instead, still nothing left out", async () => {
  const { result, page } = await write([]);
  expect(result.notes).toEqual([]);
  const opening = page()!.getState().document.sections[0]!;
  expect(opening.props).toEqual({ label: "Opening" });
  expect(opening.style.base).toEqual({ background: "soft" });
});

test("stopped as it streams: what came stays, nothing more", async () => {
  const { result, page } = await write([], 400);
  expect(result.phase).toBe("stopped");
  expect(page()!.getState().document.sections.length).toBeLessThan(4);
});
