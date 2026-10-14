// The Assistant in a block's panel (./AssistantTools.tsx), on a provider of
// the test's own: a suggestion is for what it was asked of. The heading's
// words written over, or the image replaced, the suggestion goes and is
// never taken; a question still on its way stops, and its answer is let go.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { makeSetProps, type Updates } from "../document/commands.ts";
import type { Answer, ProviderClient } from "../assistant/providers.ts";
import type { HeadingBlock, ImageBlock, PageDocument } from "../shared/document.ts";
import type { MediaItem } from "../storage/adapter.ts";
import { DescribeTool, RewriteTool } from "./AssistantTools.tsx";
import { useBlock } from "./panels/hooks.ts";

vi.mock("./picture.ts", () => ({ picture: async () => ({ mediaType: "image/jpeg", base64: "AAAA" }) }));

const DOC: PageDocument = {
  schemaVersion: 1,
  title: "Open day",
  sections: [{
    id: "s", type: "section", props: {}, style: { base: {} },
    children: [{
      id: "c", type: "column", props: {}, style: { base: {} },
      children: [
        { id: "h", type: "heading", props: { level: 1, text: "Start" }, children: [], style: { base: {} } },
        { id: "i", type: "image", props: { mediaId: "m1", alt: "One" }, children: [], style: { base: {} } },
      ],
    }],
  }],
};

const item = (id: string): MediaItem => ({ id, alt: id, width: 10, height: 10, contentType: "image/png", byteSize: 1, filename: `${id}.png`, url: `/media/${id}.png`, createdAt: "2026-10-14T00:00:00Z" });

// A provider whose answers the test gives, one per question, when it likes.
function setUp() {
  const waiting: Array<{ answer: (text: string) => void; signal: AbortSignal | undefined }> = [];
  const client: ProviderClient = {
    models: async () => [{ id: "m", name: "M" }],
    ask: (_key, _question, _written, signal) => new Promise<Answer>((done) => waiting.push({ answer: (text) => done({ text, usage: { input: 1, output: 1 } }), signal })),
  };
  const kit = editorKit({ document: structuredClone(DOC), providers: async () => client });
  kit.ui.getState().setMedia([item("m1"), item("m2")]);
  function Tools() {
    const heading = useBlock("h") as HeadingBlock;
    const image = useBlock("i") as ImageBlock;
    return <><RewriteTool block={heading} /><DescribeTool block={image} /></>;
  }
  kit.render(<Tools />);
  const answer = async (text: string) => {
    await act(async () => {
      await vi.waitFor(() => expect(waiting.length).toBeGreaterThan(0));
      waiting.shift()!.answer(text);
    });
  };
  // A change made beside the tool, as another field or a replaced image makes it.
  const set = (id: string, updates: Updates) => act(() => {
    const made = makeSetProps(kit.store.getState().document, id, updates);
    if (!made.ok) throw new Error(made.error.message);
    kit.store.getState().dispatch(made.command);
  });
  return { kit, waiting, answer, set };
}

const connect = async (kit: ReturnType<typeof editorKit>) => {
  await act(async () => {
    await kit.assistant.getState().connect("anthropic", "sk-not-a-real-key");
  });
};

test("a heading written again is not taken once its words are written over: the suggestion goes, the words written stay", async () => {
  const { kit, answer, set } = setUp();
  await connect(kit);
  fireEvent.click(screen.getByRole("button", { name: "Shorter" }));
  await answer(JSON.stringify({ text: "Begin" }));
  expect(screen.getByLabelText("The heading written again").textContent).toBe("Begin");
  set("h", { text: "Typed meanwhile" });
  expect(screen.queryByLabelText("The heading written again")).toBeNull();
  expect(screen.getByRole("button", { name: "Shorter" })).toBeTruthy();
  expect(kit.block("h")?.props).toMatchObject({ text: "Typed meanwhile" });
});

test("an image described is not taken once the image is replaced: the suggestion goes, and the new image keeps its own text", async () => {
  const { kit, answer, set } = setUp();
  await connect(kit);
  fireEvent.click(screen.getByRole("button", { name: "Write its alt text" }));
  await answer(JSON.stringify({ decorative: false, alt: "A buoy at dawn" }));
  expect(screen.getByLabelText("The alt text proposed").textContent).toBe("A buoy at dawn");
  set("i", { mediaId: "m2", alt: "Two" });
  expect(screen.queryByLabelText("The alt text proposed")).toBeNull();
  expect(screen.queryByRole("button", { name: "Use it" })).toBeNull();
  expect(kit.block("i")?.props).toEqual({ mediaId: "m2", alt: "Two" });
});

test("an image replaced while it is being described: the question stops, and its answer is let go", async () => {
  const { kit, waiting, set } = setUp();
  await connect(kit);
  fireEvent.click(screen.getByRole("button", { name: "Write its alt text" }));
  await act(async () => {
    await vi.waitFor(() => expect(waiting.length).toBe(1));
  });
  const question = waiting[0]!;
  set("i", { mediaId: "m2", alt: "Two" });
  expect(question.signal?.aborted).toBe(true);
  await act(async () => question.answer(JSON.stringify({ decorative: false, alt: "A buoy at dawn" })));
  expect(screen.queryByLabelText("The alt text proposed")).toBeNull();
  expect(kit.block("i")?.props).toEqual({ mediaId: "m2", alt: "Two" });
});
