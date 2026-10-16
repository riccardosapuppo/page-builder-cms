// Every key of Insert and of a "+" picker is a drag source, the keys that
// ask for something first (Image, Gallery, Video, the picture section)
// included: each is described for the keyboard; one that asks is dragged
// as a stand-in the page takes where its block may go and never keeps;
// dropped, it opens the picker at the drop place with its window, which
// adds the block there by one command, or nothing; the live region says
// what the drop will ask for, and the pointer turns to no-drop where the
// block cannot go. The pointer and the keys themselves are Chromium's
// (e2e/drag-asks.spec.ts): jsdom lays nothing out.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { counter, page } from "../../test/document-page.ts";
import type { PageDocument } from "../shared/document.ts";
import { WIDGETS } from "../widgets/registry.ts";
import { Canvas } from "./Canvas.tsx";
import { insertableWidgets } from "./insert.ts";
import { beginDrag, DragLayer } from "./drag/DragLayer.tsx";
import { closeInserter, openInserter } from "./InsertPicker.tsx";
import { Palette } from "./Palette.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { DRAG_WORDS, placeOfDrop, presetTile, widgetTile } from "./tiles.ts";

const root = (id: string) => document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;
const described = (key: HTMLElement) => document.getElementById(key.getAttribute("aria-describedby") ?? "")?.textContent;
const asking = WIDGETS.filter((w) => w.needs !== null);
// What Insert offers on a page of a storage that keeps no collection:
// every widget but a template's Field and Add to cart, and the Collection
// list.
const offered = insertableWidgets("page", false);

test("every key of Insert, the ones that ask first included, is a drag source, described for the keyboard", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<Palette />);
  expect(asking.map((w) => w.label)).toEqual(["Image", "Gallery", "Video"]);
  const blocks = [...document.querySelectorAll<HTMLElement>(".drawer-body button")];
  expect(offered.map((w) => w.type)).toEqual(WIDGETS.map((w) => w.type).filter((type) => type !== "field" && type !== "addToCart" && type !== "collectionList"));
  expect(blocks).toHaveLength(4 + offered.length);
  fireEvent.click(screen.getByRole("tab", { name: "Sections" }));
  const sections = [...document.querySelectorAll<HTMLElement>(".drawer-body button")];
  expect(sections.map((key) => key.textContent)).toEqual(["Heading and intro", "Picture beside text", "Three icon boxes"]);
  for (const key of [...blocks, ...sections]) {
    expect(key.hasAttribute("data-draggable"), key.textContent ?? "").toBe(true);
    expect(described(key)).toBe("Space picks it up instead, to place it elsewhere with the arrows.");
  }
  expect(DRAG_WORDS).toBe("Space picks it up instead, to place it elsewhere with the arrows.");
});

test("every key of a picker is a drag source too, described for the keyboard", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<Canvas />);
  fireEvent.click(screen.getByRole("button", { name: "Add a block after Heading" }));
  const keys = within(screen.getByRole("dialog", { name: "Add a block after Heading" })).getAllByRole("button").filter((key) => key.classList.contains("pkey"));
  expect(keys).toHaveLength(offered.length);
  for (const key of keys) {
    expect(key.hasAttribute("data-draggable")).toBe(true);
    expect(described(key)).toBe(DRAG_WORDS);
  }
});

test("a key that asks first is dragged as a stand-in of its type, which the page takes where the block may go and never keeps", () => {
  const cases = [
    ...asking.map((definition) => ({ tile: widgetTile(definition, counter("w"), () => null), to: { parentId: "c3", index: 1 }, asks: { kind: "widget", type: definition.type } })),
    { tile: presetTile("picture", counter("p"), () => null), to: { parentId: null, index: 1 }, asks: { kind: "picture" } },
  ];
  for (const { tile, to, asks } of cases) {
    const kit = editorKit({ document: page() });
    expect(tile.asks).toEqual(asks);
    const made = tile.make(kit.doc());
    expect(made.type).toBe(tile.type);
    expect(kit.store.getState().startDrag({ kind: "palette", block: made }).ok, tile.type).toBe(true);
    kit.store.getState().dragOver(to);
    expect(kit.store.getState().drag?.verdict, tile.type).toEqual({ allowed: true });
    kit.store.getState().cancelDrag();
    expect(kit.store.getState().past).toHaveLength(0);
  }
  expect(placeOfDrop({ parentId: "c3", index: 1 })).toEqual({ kind: "block", parentId: "c3", index: 1 });
  expect(placeOfDrop({ parentId: null, index: 2 })).toEqual({ kind: "section", index: 2 });
});

test("dropped, such a key opens the picker at the drop place with its window: Cancel adds nothing; the window's answer is added there by one command", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<Canvas />);
  const video = { kind: "widget", type: "video" } as const;
  // What the drag layer does on such a drop: after the divider of Join.
  act(() => openInserter(kit.env, { kind: "block", parentId: "c3", index: 1 }, null, video));
  let window = screen.getByRole("dialog", { name: "Add a video" });
  // The window says where the block will land, its column named.
  expect(window.querySelector(".dlg-foot-note")?.textContent).toBe("Lands on the yellow line on the page, after Divider in Column 1.");
  // The place is kept, its yellow line drawn in the column; the picker's
  // own keys wait behind the window.
  expect(root("c3").querySelector(":scope > .ins-slot-wrap")).not.toBeNull();
  expect(document.querySelector<HTMLElement>(".picker")?.hidden).toBe(true);
  fireEvent.click(within(window).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(root("c3").querySelector(":scope > .ins-slot-wrap")).toBeNull();
  expect(kit.store.getState().past).toHaveLength(0);
  expect(kit.ui.getState().dragSaid).toBe("Cancelled: nothing was added.");

  act(() => openInserter(kit.env, { kind: "block", parentId: "c3", index: 1 }, null, video));
  window = screen.getByRole("dialog", { name: "Add a video" });
  fireEvent.change(within(window).getByLabelText("Video address or id"), { target: { value: "https://www.youtube.com/watch?v=abcdefghijk" } });
  fireEvent.click(within(window).getByRole("button", { name: "Add video" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(kit.doc().sections[1]!.children[0]!.children.map((w) => w.type)).toEqual(["divider", "video", "quote", "gallery"]);
  expect(kit.doc().sections[1]!.children[0]!.children[1]!.props).toMatchObject({ provider: "youtube", videoId: "abcdefghijk" });
  expect(kit.store.getState().past).toHaveLength(1);
  expect(kit.lastCommand()).toMatchObject({ kind: "insert", label: "Added Video to Column 1 in Join" });
  expect(kit.ui.getState().dragSaid).toBe("Added Video to Column 1 in Join.");
});

test("a picker's own key dropped elsewhere moves the picker there, its window open", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<Canvas />);
  fireEvent.click(screen.getByRole("button", { name: "Add a block after Heading" }));
  const key = within(screen.getByRole("dialog", { name: "Add a block after Heading" })).getByRole("button", { name: "Video" });
  act(() => openInserter(kit.env, { kind: "block", parentId: "c3", index: 0 }, key, { kind: "widget", type: "video" }));
  expect(screen.getByRole("dialog", { name: "Add a video" })).toBeTruthy();
  expect(root("c1").querySelector(":scope > .ins-slot-wrap")).toBeNull();
  expect(root("c3").querySelector(":scope > .ins-slot-wrap")).not.toBeNull();
  act(() => closeInserter(kit.env, false));
});

function dragging(document: PageDocument) {
  const kit = editorKit({ document });
  kit.render(<DragLayer><div className="app"><Canvas /><StatusBar /></div></DragLayer>);
  return kit;
}

test("the live region says what a dropped key will ask for; with nowhere to start, the keyboard picks nothing up", () => {
  const gallery = WIDGETS.find((w) => w.type === "gallery")!;
  const kit = dragging(page());
  const tile = widgetTile(gallery, kit.env.newId, () => ({ parentId: "c3", index: 1 }));
  act(() => {
    expect(beginDrag(kit.env, tile, false)).toBeNull();
  });
  act(() => kit.store.getState().dragOver({ parentId: "c3", index: 1 }));
  const caption = document.querySelector(".live-caption")!;
  expect(caption.querySelector("strong")?.textContent).toBe("Gallery will be added to Column 1 in Join, after Divider.");
  expect(caption.querySelector("span")?.textContent).toBe("Release, or press Space, to add it, then choose its images. Shaded areas cannot hold widgets. Esc cancels.");
  act(() => {
    kit.store.getState().cancelDrag();
    kit.ui.setState({ dragMode: "keyboard" });
    expect(beginDrag(kit.env, tile, true)).toBeNull();
  });
  act(() => kit.store.getState().dragOver({ parentId: "c3", index: 1 }));
  expect(caption.querySelector("span")?.textContent).toBe("The arrows move it, Space adds it here, then choose its images, Esc cancels.");
  act(() => kit.store.getState().cancelDrag());

  // A page with no section: a widget has nowhere to start.
  const empty = editorKit({ document: { ...page(), sections: [] } });
  const nowhere = widgetTile(gallery, empty.env.newId, () => null);
  expect(beginDrag(empty.env, nowhere, true)).toMatchObject({ reason: "noTarget" });
  expect(empty.store.getState().drag).toBeNull();
  expect(empty.ui.getState().notice).toBe("Widgets go inside a column, so the section comes first: add one by its number of columns.");
});

test("over no place for the block, the pointer is the no-drop cursor; over a place that takes it, it is not", () => {
  const kit = dragging(page());
  const quote = WIDGETS.find((w) => w.type === "quote")!;
  const refused = () => document.documentElement.hasAttribute("data-drop-refused");
  expect(refused()).toBe(false);
  act(() => {
    expect(beginDrag(kit.env, widgetTile(quote, kit.env.newId, () => null), false)).toBeNull();
  });
  // Over nothing yet.
  expect(refused()).toBe(true);
  act(() => kit.store.getState().dragOver({ parentId: "c1", index: 1 }));
  expect(refused()).toBe(false);
  // A section's own band: no place for a widget.
  act(() => kit.store.getState().dragOver({ parentId: "hero", index: 0 }));
  expect(refused()).toBe(true);
  act(() => {
    kit.store.getState().cancelDrag();
    kit.ui.setState({ dragMode: null });
  });
  expect(refused()).toBe(false);
});
