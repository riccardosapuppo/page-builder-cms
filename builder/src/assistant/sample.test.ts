// The sample written by hand (./sample.ts): it goes through the same steps
// as a model's answer and the page takes every section of it, with the
// library's first image or without one; it streams on the clock, and stops
// when asked.
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

test("with the library's first image: every section of the sample goes in, nothing left out", async () => {
  const { result, page } = await write([{ id: "m1", alt: "Swimmers at the slipway" }]);
  expect(result).toMatchObject({ phase: "done", title: "Open day", notes: [], error: null });
  const doc = page()!.getState().document;
  expect(doc.sections.map((s) => s.props.label)).toEqual(["Opening", "The morning", "Questions", "Book"]);
  expect(doc.sections[0]!.props.columnWidths).toBe("3:2");
  expect(doc.sections[0]!.children[1]!.children[0]!.props).toEqual({ mediaId: "m1", alt: "Swimmers at the slipway" });
});

test("with an empty library: one column to open with, still nothing left out", async () => {
  const { result, page } = await write([]);
  expect(result.notes).toEqual([]);
  expect(page()!.getState().document.sections[0]!.children).toHaveLength(1);
});

test("stopped as it streams: what came stays, nothing more", async () => {
  const { result, page } = await write([], 400);
  expect(result.phase).toBe("stopped");
  expect(page()!.getState().document.sections.length).toBeLessThan(4);
});
