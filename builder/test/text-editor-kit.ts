// What the tests of the canvas's text editor share (src/editor/rich/): a
// page with a text block, the editor store and the interface's store
// around it on a fake clock, and the text editor opened on that block as
// the canvas opens it (TextSession, on an element inside the block's
// root), with what jsdom lacks for ProseMirror stood in: the next frame,
// and the rectangles of a range, which jsdom does not lay out.
import { createUiStore, type UiStore } from "../src/editor/ui-store.ts";
import { TextSession } from "../src/editor/rich/text-session.ts";
import type { PageDocument } from "../src/shared/document.ts";
import { validateDocument } from "../src/shared/validate.ts";
import { createEditorStore, type EditorStore } from "../src/store/editor-store.ts";
import { counter } from "./document-page.ts";
import { FakeClock } from "./fake-clock.ts";

export function standInLayout(): void {
  globalThis.requestAnimationFrame ??= (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0) as unknown as number;
  globalThis.cancelAnimationFrame ??= (handle: number) => clearTimeout(handle);
  const none = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getBoundingClientRect = none;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
}

const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

// A page of one section: a text ("t") and a heading ("h") in its column.
export function textPage(doc: unknown = { type: "doc", content: [paragraph("Cold water")] }): PageDocument {
  const checked = validateDocument({
    schemaVersion: 1,
    title: "Rich text",
    sections: [{
      id: "s", type: "section", props: { label: "Story" }, style: { base: {} },
      children: [{
        id: "c", type: "column", props: {}, style: { base: {} },
        children: [
          { id: "t", type: "text", props: { doc }, children: [], style: { base: {} } },
          { id: "h", type: "heading", props: { level: 2, text: "Alpha" }, children: [], style: { base: {} } },
        ],
      }],
    }],
  });
  if (!checked.valid) throw new Error(`the text page is not valid: ${JSON.stringify(checked.errors.slice(0, 3))}`);
  return checked.document;
}

export interface TextKit {
  clock: FakeClock;
  store: EditorStore;
  ui: UiStore;
  env: { store: EditorStore; ui: UiStore; clock: FakeClock; newId: () => string };
  // The text block's root, the editor's element inside it, a button of the
  // block's own bar, and a button elsewhere in the editor.
  root: HTMLElement;
  bar: HTMLButtonElement;
  outside: HTMLButtonElement;
  session: TextSession;
  // The text the page holds now.
  stored(): unknown;
  close(): void;
}

export function openTextKit(document: PageDocument = textPage()): TextKit {
  const clock = new FakeClock(Date.UTC(2026, 9, 3, 9));
  const store = createEditorStore({ document, now: () => clock.now() });
  store.getState().select("t");
  const ui = createUiStore();
  ui.setState({ editingText: { id: "t", at: "end" } });
  const root = window.document.createElement("div");
  root.dataset.blockId = "t";
  root.tabIndex = 0;
  const element = window.document.createElement("div");
  const bar = window.document.createElement("button");
  const outside = window.document.createElement("button");
  root.append(element, bar);
  window.document.body.append(root, outside);
  const env = { store, ui, clock, newId: counter("n") };
  const session = new TextSession(env, "t", element, "Text in Story", "end");
  return {
    clock, store, ui, env, root, bar, outside, session,
    stored: () => {
      const column = store.getState().document.sections[0]?.children[0];
      const block = column?.children.find((b) => b.id === "t");
      return block?.type === "text" ? block.props.doc : undefined;
    },
    close: () => {
      session.dispose();
      root.remove();
      outside.remove();
    },
  };
}
