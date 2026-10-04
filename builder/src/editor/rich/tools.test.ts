// A text asked to open (./tools.ts) whose editor is still on its way is
// asked no more once another block is chosen or a drag starts, keys and
// all; one whose editor is open is left to that editor, which closes
// itself or, when the page refuses its text, keeps it open.
import { expect, test } from "vitest";
import { editorKit } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { forgetLeftText, startEditing } from "./tools.ts";

const asked = { id: "t1", at: "end" as const, keys: [{ key: "o", shift: false }, { key: "Backspace", shift: false }] };

test("choosing another block, by any way, drops the text's request and the keys kept for it", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  const stop = forgetLeftText(kit.env);
  startEditing(kit.env, "t1", "end");
  expect(kit.store.getState().selection).toBe("t1");
  expect(kit.ui.getState().editingText).toEqual({ id: "t1", at: "end" });
  kit.ui.setState({ editingText: asked });
  // Something else changes on the page: the request stays.
  kit.store.getState().select("t1");
  expect(kit.ui.getState().editingText).toEqual(asked);
  kit.store.getState().select("h1");
  expect(kit.ui.getState().editingText).toBeNull();
  // Chosen again, the text is only selected.
  kit.store.getState().select("t1");
  expect(kit.ui.getState().editingText).toBeNull();
  // Nothing chosen at all.
  startEditing(kit.env, "t1", "end");
  kit.store.getState().select(null);
  expect(kit.ui.getState().editingText).toBeNull();
  stop();
  startEditing(kit.env, "t1", "end");
  kit.store.getState().select("h1");
  expect(kit.ui.getState().editingText).not.toBeNull();
});

test("a drag that starts drops the request; an editor already open keeps it, for the editor to close itself", () => {
  const kit = editorKit({ document: page(), selection: "t1" });
  const stop = forgetLeftText(kit.env);
  startEditing(kit.env, "t1", "end");
  expect(kit.store.getState().startDrag({ kind: "block", id: "t1" }).ok).toBe(true);
  expect(kit.store.getState().selection).toBe("t1");
  expect(kit.ui.getState().editingText).toBeNull();
  kit.store.getState().cancelDrag();
  kit.store.getState().select("t1");
  startEditing(kit.env, "t1", "end");
  kit.ui.setState({ textTools: { id: "t1", bold: false, italic: false, link: null, linkOpen: false, run: {} as never } });
  kit.store.getState().select("h1");
  expect(kit.ui.getState().editingText).toEqual({ id: "t1", at: "end" });
  stop();
});
