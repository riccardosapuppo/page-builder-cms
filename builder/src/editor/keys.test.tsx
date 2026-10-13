// The keymap's listener (./keys.ts) on the canvas and the navigator: the
// arrows move the selection, Alt goes up and in, Esc lets go; Ctrl+D,
// Delete, Ctrl+Z and redo run their commands with the focus where each
// leaves it; copy and paste go through the browser's clipboard events; "?"
// opens the window that lists the keymap; nothing happens in a text field.
// Chromium presses every entry for real (e2e/keyboard.spec.ts).
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit, type Kit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { clipboardText, copyBlock } from "../document/clipboard.ts";
import type { SectionBlock } from "../shared/document.ts";
import { BlockMenu } from "./BlockMenu.tsx";
import { Canvas } from "./Canvas.tsx";
import { EditorKeys, waitForText } from "./keys.ts";
import { createUiStore } from "./ui-store.ts";
import { entryCaps, KEY_GROUPS, KEYMAP } from "./keymap.ts";
import { Navigator } from "./Navigator.tsx";
import { BlockPanel } from "./panels/EditPanel.tsx";
import { ShortcutsDialog } from "./ShortcutsDialog.tsx";

function shell(selection: string | null = null): Kit {
  const kit = editorKit({ document: page(), selection });
  kit.render(
    <div className="app">
      <Canvas />
      <Navigator />
      <EditorKeys />
      <BlockMenu />
      <ShortcutsDialog />
    </div>,
  );
  return kit;
}

const root = (id: string) => document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;
const focused = () => (document.activeElement as HTMLElement | null)?.dataset.blockId ?? (document.activeElement as HTMLElement | null)?.dataset.rowId;

// A key pressed on the focused element, as the browser sends it.
function press(key: string, mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}) {
  const target = document.activeElement ?? document.body;
  act(() => {
    fireEvent.keyDown(target, { key, ...mods });
  });
}

test("the arrows select the next and the previous block, Alt goes up and in, Esc lets go", async () => {
  const kit = shell("h1");
  act(() => root("h1").focus());
  press("ArrowDown");
  expect(kit.store.getState().selection).toBe("t1");
  await waitFor(() => expect(focused()).toBe("t1"));
  press("ArrowUp");
  expect(kit.store.getState().selection).toBe("h1");
  await waitFor(() => expect(focused()).toBe("h1"));
  press("ArrowUp", { altKey: true });
  expect(kit.store.getState().selection).toBe("c1");
  press("ArrowUp", { altKey: true });
  expect(kit.store.getState().selection).toBe("hero");
  await waitFor(() => expect(focused()).toBe("hero"));
  press("ArrowDown", { altKey: true });
  expect(kit.store.getState().selection).toBe("c1");
  press("Escape");
  expect(kit.store.getState().selection).toBeNull();
  await waitFor(() => expect(document.activeElement?.classList.contains("canvas")).toBe(true));
});

test("Ctrl+D, Delete, Ctrl+Z and redo run their commands, the focus where each leaves it", async () => {
  const kit = shell("t1");
  act(() => root("t1").focus());
  press("d", { ctrlKey: true });
  expect(kit.lastCommand()?.label).toBe("Duplicated Text in Hero");
  await waitFor(() => expect(focused()).toBe("n1"));
  press("Delete");
  expect(kit.lastCommand()?.label).toBe("Deleted Text in Hero");
  // The neighbour in its place.
  await waitFor(() => expect(focused()).toBe("b1"));
  press("z", { ctrlKey: true });
  // The block the undo touched.
  await waitFor(() => expect(focused()).toBe("n1"));
  expect(kit.doc().sections[0]!.children[0]!.children.map((w) => w.id)).toEqual(["h1", "t1", "n1", "b1"]);
  press("Z", { ctrlKey: true, shiftKey: true });
  expect(kit.doc().sections[0]!.children[0]!.children.map((w) => w.id)).toEqual(["h1", "t1", "b1"]);
  press("z", { ctrlKey: true });
  press("y", { ctrlKey: true });
  expect(kit.doc().sections[0]!.children[0]!.children.map((w) => w.id)).toEqual(["h1", "t1", "b1"]);
});

test("on the navigator the editing keys work on the selected row, and the focus stays in the tree", async () => {
  const kit = shell("q1");
  const row = document.querySelector<HTMLElement>('.tree [data-row-id="q1"]')!;
  act(() => row.focus());
  press("Delete");
  expect(kit.lastCommand()?.label).toBe("Deleted Quote in Join");
  await waitFor(() => expect(document.activeElement?.getAttribute("data-row-id")).toBe("g1"));
});

test("copy and paste go through the clipboard's events, and the copy lands after the selection", async () => {
  const kit = shell("b1");
  act(() => root("b1").focus());
  const carried = new Map<string, string>();
  const clipboardData = { setData: (type: string, value: string) => carried.set(type, value), getData: (type: string) => carried.get(type) ?? "" };
  const copied = fireEvent.copy(root("b1"), { clipboardData });
  expect(copied).toBe(false);
  expect(JSON.parse(carried.get("text/plain")!)).toMatchObject({ kind: "page-builder-cms/block", block: { id: "b1", type: "button" } });
  expect(kit.ui.getState().notice).toBe("Copied Button.");

  act(() => root("h1").focus());
  act(() => {
    fireEvent.paste(root("h1"), { clipboardData });
  });
  expect(kit.lastCommand()?.label).toBe("Pasted Button into Column 1 in Hero");
  expect(kit.doc().sections[0]!.children[0]!.children.map((w) => w.id)).toEqual(["h1", "n1", "t1", "b1"]);
  await waitFor(() => expect(focused()).toBe("n1"));

  // Text that is no block of this editor is said, and nothing is pasted.
  carried.set("text/plain", "Hello");
  act(() => {
    fireEvent.paste(root("n1"), { clipboardData });
  });
  expect(kit.ui.getState().notice).toBe("The clipboard holds no block from this editor.");
  expect(kit.doc().sections[0]!.children[0]!.children).toHaveLength(4);
});

test("a section pasted into a header or footer leaves its anchor behind, which a page would keep", () => {
  const visit: SectionBlock = { ...(copyBlock(page(), "join") as SectionBlock), props: { label: "Visit", anchor: "visit" } };
  const clipboardData = { setData: () => undefined, getData: () => clipboardText(visit) };
  const pasted = (kit: Kit) => kit.doc().sections.find((s) => s.props.label === "Visit");

  const onPage = shell("join");
  act(() => root("join").focus());
  act(() => {
    fireEvent.paste(root("join"), { clipboardData });
  });
  expect(pasted(onPage)?.props).toEqual({ label: "Visit", anchor: "visit" });
  cleanup();

  const header = { id: 7, kind: "header" as const, slug: null, home: false, published: null, revision: 0, links: { preview: "/preview/7", live: null } };
  const inPart = editorKit({ document: page(), selection: "join", session: { current: header } });
  inPart.render(<div className="app"><Canvas /><EditorKeys /></div>);
  act(() => root("join").focus());
  act(() => {
    fireEvent.paste(root("join"), { clipboardData });
  });
  expect(inPart.lastCommand()?.kind).toBe("paste");
  expect(pasted(inPart)?.props).toEqual({ label: "Visit" });
});

test("in a text field the keys are the field's: no block is deleted, no selection moves", () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<><BlockPanel id="h1" /><EditorKeys /></>);
  const text = screen.getByLabelText("Text");
  act(() => text.focus());
  press("Delete");
  press("ArrowDown");
  press("z", { ctrlKey: true });
  press("?", { shiftKey: true });
  expect(kit.store.getState().past).toHaveLength(0);
  expect(kit.store.getState().selection).toBe("h1");
  expect(kit.ui.getState().shortcutsOpen).toBe(false);
});

test("Ctrl+Shift+Enter publishes an empty header or footer, which takes it off every page, as the button does, but not an empty page", () => {
  const empty = { ...page(), sections: [] };
  const opened = {
    page: { id: 1, kind: "page" as const, slug: "winter", home: false, published: null, revision: 3, links: { preview: "/preview/1", live: null } },
    header: { id: 7, kind: "header" as const, slug: null, home: false, published: null, revision: 3, links: { preview: "/preview/7", live: null } },
  };
  for (const [kind, current] of Object.entries(opened)) {
    let publishes = 0;
    const kit = editorKit({ document: empty, session: { current: current as never, publish: async () => { publishes += 1; } } });
    kit.render(<div className="app"><Canvas /><EditorKeys /></div>);
    expect(fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true, shiftKey: true }), kind).toBe(false);
    expect(publishes, kind).toBe(kind === "header" ? 1 : 0);
    expect(kit.ui.getState().notice, kind).toBe(kind === "header" ? null : "Add a section first. An empty page has nothing to publish.");
    cleanup();
  }
});

test("in a text written on the canvas, Delete, Backspace and Ctrl+D are the text's; keeping a version, previewing and publishing still work", () => {
  let previews = 0;
  let publishes = 0;
  const kit = editorKit({
    document: page(),
    selection: "t1",
    session: {
      current: { id: 1, slug: "winter", home: false, published: null, revision: 3, links: { preview: "/preview/1", live: null } } as never,
      preview: () => {
        previews += 1;
      },
      publish: async () => {
        publishes += 1;
      },
    },
  });
  kit.render(<div className="app"><Canvas /><EditorKeys /><ShortcutsDialog /></div>);
  // The text being written, as the canvas's text editor makes it: an
  // editable element in the block's place, which cancels every Enter and
  // Esc for itself, as ProseMirror does.
  const text = document.createElement("div");
  text.setAttribute("contenteditable", "true");
  text.tabIndex = 0;
  text.className = "rte";
  text.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === "Escape") event.preventDefault();
  });
  root("t1").append(text);
  act(() => text.focus());
  for (const [key, mods] of [["Delete", {}], ["Backspace", {}], ["d", { ctrlKey: true }], ["ArrowDown", {}], ["?", { shiftKey: true }]] as const) {
    const passed = fireEvent.keyDown(text, { key, ...mods });
    // Not taken from the text: the browser's own (or the text editor's).
    expect(passed, key).toBe(true);
  }
  fireEvent.keyDown(text, { key: "Escape" });
  expect(kit.store.getState().past).toHaveLength(0);
  expect(kit.store.getState().selection).toBe("t1");
  expect(kit.ui.getState().shortcutsOpen).toBe(false);

  expect(fireEvent.keyDown(text, { key: "s", ctrlKey: true })).toBe(false);
  expect(kit.ui.getState()).toMatchObject({ historyOpen: true, namingVersion: true });
  expect(fireEvent.keyDown(text, { key: "P", code: "KeyP", altKey: true, shiftKey: true })).toBe(false);
  expect(previews).toBe(1);
  expect(fireEvent.keyDown(text, { key: "Enter", ctrlKey: true, shiftKey: true })).toBe(false);
  expect(publishes).toBe(1);
  // AltGr types a letter in the text: not a preview.
  const altGr = new KeyboardEvent("keydown", { key: "Ö", code: "KeyP", ctrlKey: true, altKey: true, shiftKey: true, bubbles: true, cancelable: true, modifierAltGraph: true } as KeyboardEventInit);
  text.dispatchEvent(altGr);
  expect(altGr.defaultPrevented).toBe(false);
  // Option and Shift with P type "∏" on a Mac: in a text, the character.
  expect(fireEvent.keyDown(text, { key: "∏", code: "KeyP", altKey: true, shiftKey: true })).toBe(true);
  expect(previews).toBe(1);
  // The drawers are not opened from inside a text.
  expect(fireEvent.keyDown(text, { key: "O", code: "KeyO", altKey: true, shiftKey: true })).toBe(true);
  expect(kit.ui.getState().drawer).toBe("history");
});

test("? opens the window, which lists every entry of the keymap with its keys, and finds them", () => {
  const kit = shell("h1");
  act(() => root("h1").focus());
  press("?", { shiftKey: true });
  const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
  const listed = [...dialog.querySelectorAll<HTMLElement>("[data-action]")].map((row) => ({
    action: row.dataset.action,
    label: row.querySelector("dt")?.textContent,
    keys: [...row.querySelectorAll("kbd")].map((k) => k.getAttribute("aria-label") ?? k.textContent),
  }));
  // Group by group, in the window's order, each entry as the table has it.
  expect(listed).toEqual(KEY_GROUPS.flatMap((group) => KEYMAP.filter((e) => e.group === group)).map((e) => ({
    action: e.action,
    label: e.label,
    keys: entryCaps(e).map((cap) => ("text" in cap ? cap.text : cap.name)),
  })));
  expect(listed).toHaveLength(KEYMAP.length);
  // The search keeps the entries whose words it matches.
  const search = within(dialog).getByRole("searchbox", { name: "Find a shortcut" });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: "paste" } });
  expect([...dialog.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["Paste after the selection"]);
  fireEvent.keyDown(search, { key: "Escape" });
  expect(kit.ui.getState().shortcutsOpen).toBe(false);
});

test("a right click opens the block's More: copy, paste after, duplicate, insert before and after, select its column, delete, each with its keys", async () => {
  const kit = shell();
  act(() => {
    fireEvent.contextMenu(root("q1"), { clientX: 300, clientY: 200 });
  });
  expect(kit.store.getState().selection).toBe("q1");
  const menu = screen.getByRole("menu", { name: "Quote actions" });
  const items = within(menu).getAllByRole("menuitem");
  expect(items.map((item) => [item.textContent, item.getAttribute("aria-keyshortcuts")])).toEqual([
    ["CopyCtrlC", "Control+C"], ["Paste afterCtrlV", "Control+V"], ["DuplicateCtrlD", "Control+D"],
    ["Insert before", null], ["Insert after+", "Plus"], ["Select Column 1AltUp arrow", "Alt+ArrowUp"],
    ["DeleteDel", "Delete Backspace"],
  ]);
  await waitFor(() => expect(document.activeElement).toBe(items[0]));

  // The browser's clipboard is out of reach here: the menu pastes the
  // block this tab copied.
  await act(async () => {
    fireEvent.click(items[0]!);
  });
  expect(kit.ui.getState().copied).toContain("\"id\":\"q1\"");
  act(() => {
    fireEvent.contextMenu(root("d1"), { clientX: 300, clientY: 200 });
  });
  await act(async () => {
    fireEvent.click(within(screen.getByRole("menu", { name: "Divider actions" })).getByRole("menuitem", { name: /Paste/ }));
  });
  expect(kit.lastCommand()?.label).toBe("Pasted Quote into Column 1 in Join");
  expect(kit.doc().sections[1]!.children[0]!.children.map((w) => w.type)).toEqual(["divider", "quote", "quote", "gallery"]);

  act(() => {
    fireEvent.contextMenu(root("g1"), { clientX: 300, clientY: 200 });
  });
  act(() => {
    fireEvent.click(within(screen.getByRole("menu", { name: "Gallery actions" })).getByRole("menuitem", { name: /Duplicate/ }));
  });
  expect(kit.lastCommand()?.label).toBe("Duplicated Gallery in Join");
  act(() => {
    fireEvent.contextMenu(root("g1"), { clientX: 300, clientY: 200 });
  });
  act(() => {
    fireEvent.click(within(screen.getByRole("menu", { name: "Gallery actions" })).getByRole("menuitem", { name: /Delete/ }));
  });
  expect(kit.lastCommand()?.label).toBe("Deleted Gallery in Join");
  expect(screen.queryByRole("menu")).toBeNull();

  // Select Column 1: the column the quote is in, selected and focused.
  act(() => {
    fireEvent.contextMenu(root("q1"), { clientX: 300, clientY: 200 });
  });
  act(() => {
    fireEvent.click(within(screen.getByRole("menu", { name: "Quote actions" })).getByRole("menuitem", { name: /^Select Column 1/ }));
  });
  expect(kit.store.getState().selection).toBe("c3");
  await waitFor(() => expect(focused()).toBe("c3"));
});

test("the menu key opens the block menu: the moves first, one that cannot be made saying why, then all of More's; a move is one command", async () => {
  const kit = shell();
  // The menu key fires the context menu at the focused block, with no
  // pointer position.
  act(() => {
    fireEvent.contextMenu(root("h1"), { clientX: 0, clientY: 0 });
  });
  const menu = screen.getByRole("menu", { name: "Heading: block menu" });
  const items = within(menu).getAllByRole("menuitem");
  expect(items.map((item) => [item.textContent, item.getAttribute("aria-disabled")])).toEqual([
    ["Move upFirst in Column 1", "true"], ["Move down", null],
    ["CopyCtrlC", null], ["Paste afterCtrlV", null], ["DuplicateCtrlD", null],
    ["Insert before", null], ["Insert after+", null], ["Select Column 1AltUp arrow", null],
    ["DeleteDel", null],
  ]);
  // The first that can be pressed takes the focus.
  await waitFor(() => expect(document.activeElement).toBe(items[1]));
  act(() => {
    fireEvent.click(items[0]!);
  });
  expect(kit.store.getState().past).toHaveLength(0);
  act(() => {
    fireEvent.click(items[1]!);
  });
  expect(kit.lastCommand()).toMatchObject({ kind: "move", label: "Moved Heading in Hero" });
  expect(kit.doc().sections[0]!.children[0]!.children.map((w) => w.id)).toEqual(["t1", "h1", "b1"]);
  expect(kit.store.getState().past).toHaveLength(1);
  await waitFor(() => expect(focused()).toBe("h1"));

  // A column moves left and right; a section has no column around it to
  // select, and a column takes no insert beside it.
  act(() => {
    fireEvent.contextMenu(root("c2"), { clientX: 0, clientY: 0 });
  });
  expect(within(screen.getByRole("menu", { name: "Column 2: block menu" })).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "Move left", "Move rightLast column", "CopyCtrlC", "Paste afterCtrlV", "DuplicateCtrlD", "Select HeroAltUp arrow", "DeleteDel",
  ]);
  act(() => {
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  });
  act(() => {
    fireEvent.contextMenu(root("hero"), { clientX: 0, clientY: 0 });
  });
  expect(within(screen.getByRole("menu", { name: "Hero: block menu" })).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
    "Move upFirst section", "Move down", "CopyCtrlC", "Paste afterCtrlV", "DuplicateCtrlD", "Insert before", "Insert after+", "DeleteDel",
  ]);
});

test("Escape closes the block's menu and gives the focus back to the block", async () => {
  shell();
  act(() => {
    fireEvent.contextMenu(root("i1"), { clientX: 300, clientY: 200 });
  });
  const menu = screen.getByRole("menu", { name: "Image actions" });
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  act(() => {
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(focused()).toBe("i1");
});

test("keys meant for a text whose editor is on its way wait for it, and never reach the block; Esc gives up; the typing keys still work", () => {
  const ui = createUiStore();
  ui.setState({ editingText: { id: "t", at: "end" } });
  const canvas = document.createElement("div");
  canvas.className = "canvas";
  const block = document.createElement("div");
  block.tabIndex = 0;
  canvas.append(block);
  document.body.append(canvas);
  let taken: boolean | null = null;
  block.addEventListener("keydown", (event) => {
    taken = waitForText({ ui }, event);
  });
  const key = (name: string, mods: KeyboardEventInit = {}) => {
    taken = null;
    const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...mods });
    block.dispatchEvent(event);
    return { taken, prevented: event.defaultPrevented };
  };
  expect(key("Backspace")).toEqual({ taken: true, prevented: true });
  expect(key("H", { shiftKey: true })).toEqual({ taken: true, prevented: true });
  expect(key(" ")).toEqual({ taken: true, prevented: true });
  // Taken from the block, and not typed: an arrow, a shortcut of the block's.
  expect(key("ArrowDown")).toEqual({ taken: true, prevented: true });
  expect(key("d", { ctrlKey: true })).toEqual({ taken: true, prevented: true });
  expect(ui.getState().editingText?.keys).toEqual([{ key: "Backspace", shift: false }, { key: "H", shift: true }, { key: " ", shift: false }]);
  // Keeping a version works while the text opens, as while typing.
  expect(key("s", { ctrlKey: true }).taken).toBe(false);
  // Once the editor is there, the keys are its own.
  ui.setState({ textTools: { id: "t", bold: false, italic: false, link: null, linkOpen: false, run: {} as never } });
  expect(key("Backspace").taken).toBe(false);
  ui.setState({ textTools: null });
  expect(key("Escape")).toEqual({ taken: true, prevented: true });
  expect(ui.getState().editingText).toBeNull();
  expect(key("Backspace").taken).toBe(false);
  canvas.remove();
});

test("with a modal dialog open, the editor behind it takes no key even with the focus lost to the page; Tab and Esc reach the dialog", () => {
  const kit = shell("h1");
  act(() => kit.ui.getState().setShortcutsOpen(true));
  const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
  act(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(document.activeElement).toBe(document.body);
  press("Delete");
  press("d", { ctrlKey: true });
  press("ArrowDown");
  expect(kit.store.getState().selection).toBe("h1");
  expect(kit.store.getState().past).toEqual([]);
  // Tab goes back into the dialog; Esc from the page closes it.
  press("Tab");
  expect(dialog.contains(document.activeElement)).toBe(true);
  act(() => (document.activeElement as HTMLElement | null)?.blur());
  press("Escape");
  expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
});

test("with a heading's line open, the keys on its clamp are the clamp's: none is kept back as if the line were on its way", () => {
  const kit = shell("h1");
  act(() => root("h1").focus());
  press("Enter");
  expect(kit.ui.getState().editingText).toEqual({ id: "h1", at: "end", open: true });
  // Tab from the line reaches the clamp, still inside the block: the line
  // stays open, and the clamp's keys work there.
  const head = within(root("h1")).getByRole("button", { name: "Heading: block menu" });
  act(() => head.focus());
  expect(kit.ui.getState().editingText?.id).toBe("h1");
  press("ArrowDown");
  expect(document.activeElement?.getAttribute("data-key")).toBe("grip");
  let tab = false;
  act(() => {
    tab = fireEvent.keyDown(document.activeElement!, { key: "Tab" });
  });
  expect(tab).toBe(true);
  expect(kit.ui.getState().editingText?.keys).toBeUndefined();
});

test("a heading is written where it stands, as a text: Enter opens its line, and a character typed on a selected heading or text starts the writing with it; an arrow or a key of the keymap stays its own", async () => {
  const kit = shell("h1");
  act(() => root("h1").focus());
  press("Enter");
  expect(kit.ui.getState().editingText).toEqual({ id: "h1", at: "end", open: true });
  const line = await screen.findByRole("textbox", { name: /^Heading/ });
  expect(line.textContent).toBe("Winter series");
  act(() => {
    fireEvent.keyDown(line, { key: "Escape" });
  });
  expect(kit.ui.getState().editingText).toBeNull();
  await waitFor(() => expect(focused()).toBe("h1"));

  // A character on the heading itself: its line opens with the character in.
  press("W", { shiftKey: true });
  const typed = await screen.findByRole("textbox", { name: /^Heading/ });
  expect(typed.textContent).toBe("Winter seriesW");
  act(() => {
    fireEvent.keyDown(typed, { key: "Escape" });
  });
  await waitFor(() => expect(focused()).toBe("h1"));

  // On a text, the editor is asked for, the character waiting for it. The
  // editor is a chunk of its own, which the canvas fetches once a text is
  // selected; it is waited for here, since an editor that suspends inside
  // the key's act is never drawn again in this environment, and whether an
  // earlier test had fetched it in time made this one pass or hang.
  press("ArrowDown");
  await waitFor(() => expect(focused()).toBe("t1"));
  await act(async () => {
    await import("./rich/TextEditor.tsx");
  });
  press("x");
  expect(kit.ui.getState().editingText?.id).toBe("t1");
  const text = await screen.findByRole("textbox", { name: /^Text/ });
  await waitFor(() => expect(text.textContent).toBe("Meet at the slipway.x"));
  act(() => {
    fireEvent.keyDown(text, { key: "Escape" });
  });
  await waitFor(() => expect(focused()).toBe("t1"));

  // An arrow moves the selection, and ? opens the shortcuts: no writing.
  press("ArrowUp");
  expect(kit.store.getState().selection).toBe("h1");
  await waitFor(() => expect(focused()).toBe("h1"));
  press("?", { shiftKey: true });
  expect(kit.ui.getState().editingText).toBeNull();
  expect(kit.ui.getState().shortcutsOpen).toBe(true);
});
