// While the store holds a drag, the canvas draws its preview: the dragged
// block as the indicator where it would land, the container framed and
// named, the sections a widget cannot go into shaded; the navigator shows
// the same place as a line; the live region says where the block will go,
// and why not when it cannot. Dropping makes one command; cancelling
// leaves the page as it was; a drag starts only once the text being typed
// is in. The pointer and the keys themselves are Chromium's
// (e2e/drag.spec.ts): jsdom lays nothing out.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { Canvas } from "../Canvas.tsx";
import { Navigator } from "../Navigator.tsx";
import { BlockPanel } from "../panels/EditPanel.tsx";
import { WIDGETS } from "../../widgets/registry.ts";
import { newWidget } from "../../widgets/types.ts";
import { beginDrag, DragLayer, dropSentence } from "./DragLayer.tsx";

const root = (id: string) => document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;

function drawn() {
  const kit = editorKit({ document: page(), selection: "q1" });
  kit.render(<DragLayer><div className="app"><Canvas /><Navigator /></div></DragLayer>);
  act(() => {
    kit.ui.setState({ dragMode: "pointer" });
    kit.store.getState().startDrag({ kind: "block", id: "q1" });
  });
  return kit;
}

test("the dragged block is drawn as a line where it would land, its column framed and the sections shaded", () => {
  const kit = drawn();
  act(() => kit.store.getState().dragOver({ parentId: "c1", index: 1 }));
  // The page holds the preview: the quote between the heading and the text.
  expect([...root("c1").children].filter((e) => e instanceof HTMLElement && e.dataset.blockId).map((e) => (e as HTMLElement).dataset.blockId)).toEqual(["h1", "q1", "t1", "b1"]);
  expect(root("q1").dataset.dragSlot).toBe("line");
  expect(root("q1").querySelector(":scope > .drop-slot .drop-label")?.textContent).toBe("Quote");
  expect(root("c1").querySelector(":scope > .ov-drop-target")?.textContent).toBe("Column 1");
  expect(root("c2").querySelector(":scope > .ov-drop")).not.toBeNull();
  expect(root("hero").querySelector(":scope > .ov-veil")?.textContent).toBe("Widgets go inside a column.");
  expect(document.querySelector(".canvas")?.classList.contains("canvas-drag-widget")).toBe(true);
  // The bar and the selection marks wait for the drop.
  expect(screen.queryByRole("toolbar")).toBeNull();
  // The page in the store has not changed.
  expect(kit.doc().sections[1]!.children[0]!.children.map((w) => w.id)).toEqual(["d1", "q1", "g1"]);

  const caption = document.querySelector(".live-caption")!;
  expect(caption.getAttribute("role")).toBe("status");
  expect(caption.querySelector("strong")?.textContent).toBe("Quote will move to Column 1 in Hero, after Heading.");
  expect(caption.querySelector("span")?.textContent).toBe("Release to drop it. Shaded areas cannot hold widgets. Esc cancels.");

  // The navigator shows the same place, as a line, its column open.
  const line = document.querySelector(".tree .t-insert");
  expect(line?.textContent).toBe("Quote");
  expect(line?.previousElementSibling?.getAttribute("data-row-id")).toBe("h1");
  expect(document.querySelector('.tree [data-row-id="c1"] > .t-row')?.classList.contains("t-target")).toBe(true);
});

test("a tile of the widget panel is added, not moved: the live region says so", () => {
  const kit = editorKit({ document: page() });
  kit.render(<DragLayer><div className="app"><Canvas /></div></DragLayer>);
  const divider = WIDGETS.find((w) => w.type === "divider")!;
  act(() => {
    kit.ui.setState({ dragMode: "pointer" });
    kit.store.getState().startDrag({ kind: "palette", block: newWidget(divider as never, "new-divider", undefined as never) });
  });
  act(() => kit.store.getState().dragOver({ parentId: "c1", index: 1 }));
  const caption = document.querySelector(".live-caption")!;
  expect(caption.querySelector("strong")?.textContent).toBe("Divider will be added to Column 1 in Hero, after Heading.");
  expect(caption.querySelector("span")?.textContent).toBe("Release to add it. Shaded areas cannot hold widgets. Esc cancels.");
});

test("over nothing that can take it, the live region says why; the block's own place keeps it", () => {
  const kit = drawn();
  act(() => kit.store.getState().dragOver(null));
  expect(document.querySelector(".live-caption strong")?.textContent).toBe("Nowhere to drop it here. Widgets go inside a column.");
  expect(root("q1").dataset.dragSlot).toBe("line");
  act(() => kit.store.getState().dragOver({ parentId: "c3", index: 1 }));
  expect(dropSentence(kit.store.getState().drag!)).toBe("Quote is where it was.");
});

test("the drop is one command; a cancel leaves the page and the history as they were", () => {
  const kit = drawn();
  act(() => kit.store.getState().dragOver({ parentId: "c2", index: 1 }));
  act(() => {
    kit.store.getState().drop();
    kit.ui.setState({ dragMode: null });
  });
  expect(kit.store.getState().past.map((e) => e.command.label)).toEqual(["Moved Quote to Column 2 in Hero"]);
  expect(kit.doc().sections[0]!.children[1]!.children.map((w) => w.id)).toEqual(["i1", "q1"]);
  expect(root("q1").dataset.dragSlot).toBeUndefined();
  expect(document.querySelector(".live-caption")?.classList.contains("live-caption-quiet")).toBe(true);

  const before = kit.doc();
  act(() => {
    kit.ui.setState({ dragMode: "keyboard" });
    kit.store.getState().startDrag({ kind: "block", id: "h1" });
  });
  act(() => kit.store.getState().dragOver({ parentId: "c3", index: 0 }));
  expect(document.querySelector(".live-caption span")?.textContent).toBe("The arrows move it, Space drops it here, Esc puts it back.");
  act(() => {
    kit.store.getState().cancelDrag();
    kit.ui.setState({ dragMode: null });
  });
  expect(kit.doc()).toBe(before);
  expect(kit.store.getState().past).toHaveLength(1);
  expect(root("h1").dataset.dragSlot).toBeUndefined();
});

test("a drag starts only once the text being typed is in, as a command of its own", () => {
  const kit = editorKit({ document: page(), selection: "q1" });
  kit.render(<BlockPanel id="q1" />);
  const quote = screen.getByLabelText("Quote");
  fireEvent.focus(quote);
  fireEvent.change(quote, { target: { value: "Cold, then very glad." } });
  expect(kit.ui.getState().pending.waiting).toBe(1);
  act(() => {
    expect(beginDrag(kit.env, { kind: "selection" }, true)).toBeNull();
  });
  expect(kit.store.getState().past.map((e) => e.command.label)).toEqual(["Changed Quote in Join"]);
  expect(kit.store.getState().drag?.base).toBe(kit.doc());
  expect(kit.ui.getState().dragMode).toBe("keyboard");
  act(() => kit.store.getState().dragOver({ parentId: "c2", index: 0 }));
  act(() => {
    kit.store.getState().drop();
  });
  expect(kit.store.getState().past.map((e) => e.command.label)).toEqual(["Changed Quote in Join", "Moved Quote to Column 2 in Hero"]);
  expect(kit.block("q1")?.props).toMatchObject({ text: "Cold, then very glad." });
});

test("with nothing selected there is nothing to drag, and the editor says so", () => {
  const kit = editorKit({ document: page() });
  expect(beginDrag(kit.env, { kind: "selection" }, false)).toMatchObject({ reason: "nothing" });
  expect(kit.store.getState().drag).toBeNull();
  expect(kit.ui.getState().notice).toBe("Select a block to move it.");
});
