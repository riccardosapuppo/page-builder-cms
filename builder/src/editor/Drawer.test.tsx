// The drawers: one open at a time; opened, a drawer takes the focus (what
// it marks, else its first key), unless something in it took it already;
// Esc in it, or its close button, closes it and gives the focus back to
// where it was before it opened; a menu or a window opened from it keeps
// its own Esc; the keymap's Alt+Shift chords open and close Insert and the
// Outline the same way. On a desktop each pushes the page aside, Insert
// too; in a tablet's window Insert floats over the canvas's left, and gives
// way to a block wholly under it.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { Canvas } from "./Canvas.tsx";
import { closeDrawer, DrawerShell, toggleDrawer } from "./Drawer.tsx";
import { useUi } from "./context.tsx";
import { EditorKeys } from "./keys.ts";

// The shell's drawers, each with a field it marks to take the focus, and
// the history's with one that takes it for itself.
function Drawers() {
  const drawer = useUi((u) => u.drawer);
  return (
    <>
      <button type="button" data-drawer="insert">Insert</button>
      {drawer === "insert" && <DrawerShell which="insert"><input aria-label="Search" data-autofocus /></DrawerShell>}
      {drawer === "outline" && <DrawerShell which="outline"><button type="button">First</button></DrawerShell>}
      {drawer === "history" && <DrawerShell which="history"><TakesFocus /></DrawerShell>}
    </>
  );
}

function TakesFocus() {
  const field = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => field.current?.focus(), []);
  return <><button type="button" data-autofocus>Save version</button><input ref={field} aria-label="Name" /></>;
}

test("one drawer at a time; opened, it takes the focus; Esc closes it and the focus goes back where it was", async () => {
  const kit = editorKit({ document: page() });
  kit.render(<div className="app"><Drawers /><button type="button">Before</button></div>);
  const before = screen.getByRole("button", { name: "Before" });
  act(() => before.focus());
  act(() => toggleDrawer(kit.env, "insert"));
  expect(screen.getByRole("complementary", { name: "Insert" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search" }));
  // Another drawer replaces it; the place the focus goes back to stays the
  // first one's.
  act(() => toggleDrawer(kit.env, "outline"));
  expect(screen.queryByRole("complementary", { name: "Insert" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(kit.ui.getState().drawer).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(before));
});

test("a drawer whose content took the focus keeps it there; its close button closes it", async () => {
  const kit = editorKit({ document: page() });
  kit.render(<div className="app"><Drawers /></div>);
  const key = screen.getByRole("button", { name: "Insert" });
  act(() => key.focus());
  act(() => toggleDrawer(kit.env, "history"));
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  expect(kit.ui.getState().historyOpen).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close History" }));
  expect(kit.ui.getState()).toMatchObject({ drawer: null, historyOpen: false });
  await waitFor(() => expect(document.activeElement).toBe(key));
});

test("closed from outside it, the focus stays where it is; a window opened from it keeps its own Esc", () => {
  const kit = editorKit({ document: page() });
  kit.render(<div className="app"><Drawers /><button type="button">Elsewhere</button></div>);
  act(() => toggleDrawer(kit.env, "insert"));
  const inside = screen.getByRole("textbox", { name: "Search" });
  // A window's Esc inside the drawer: not the drawer's.
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  inside.parentElement!.append(dialog);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(kit.ui.getState().drawer).toBe("insert");
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
  act(() => elsewhere.focus());
  act(() => closeDrawer(kit.env));
  expect(kit.ui.getState().drawer).toBeNull();
  expect(document.activeElement).toBe(elsewhere);
});

const block = (id: string) => document.querySelector<HTMLElement>(`.canvas [data-block-id="${id}"]`)!;

test("Esc after choosing another block in the Outline gives the focus to that block, which stays selected, not to the block the Outline was opened from", async () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<div className="app"><Canvas /><Drawers /><EditorKeys /></div>);
  act(() => block("h1").focus());
  act(() => toggleDrawer(kit.env, "outline"));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  // The Outline chooses another block, as its rows do.
  act(() => kit.store.getState().select("b1"));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(kit.ui.getState().drawer).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(block("b1")));
  expect(kit.store.getState().selection).toBe("b1");

  // The same block still chosen: the focus goes back to where it was.
  const clamp = () => document.querySelector<HTMLElement>('.canvas [data-block-id="b1"] > .clamp [data-key="head"]');
  act(() => clamp()!.focus());
  act(() => toggleDrawer(kit.env, "outline"));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(clamp()));
  expect(kit.store.getState().selection).toBe("b1");

  // Nothing chosen any more: the canvas, which selects nothing by itself.
  act(() => block("b1").focus());
  act(() => toggleDrawer(kit.env, "history"));
  act(() => kit.store.getState().select(null));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(document.querySelector(".canvas")));
  expect(kit.store.getState().selection).toBeNull();
});

// jsdom lays nothing out: the boxes a test wants are given to the elements.
function lay(element: Element | null, [left, top, right, bottom]: readonly [number, number, number, number]) {
  element!.getBoundingClientRect = () => ({ left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
}

// A tablet's window, 820 wide, with a finger (./layout-mode.ts): its media
// queries answered as a browser would; a browser with none is a desktop's.
function tabletWindow(): () => void {
  const kept = window.matchMedia;
  window.matchMedia = ((query: string) => ({ matches: query !== "(min-width: 1100px)" && query !== "(any-pointer: fine)", media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = kept;
  };
}

test("on a desktop each drawer pushes the page aside, Insert too; in a tablet's window Insert floats over the canvas's left, the others keeping their kind", () => {
  const kinds = () => {
    const kit = editorKit({ document: page() });
    const { unmount } = kit.render(<div className="app"><Drawers /></div>);
    const seen = (["insert", "outline", "history"] as const).map((which) => {
      act(() => toggleDrawer(kit.env, which));
      return document.querySelector(".drawer")!.classList.contains("drawer-push") ? "pushes" : "floats";
    });
    unmount();
    return seen;
  };
  expect(kinds()).toEqual(["pushes", "pushes", "pushes"]);
  const restore = tabletWindow();
  try {
    expect(kinds()).toEqual(["floats", "pushes", "pushes"]);
  } finally {
    restore();
  }
});

test("in a tablet's window, a block that takes the focus wholly under Insert makes Insert give way; one only partly under it, or out of view, leaves it open", async () => {
  const restore = tabletWindow();
  try {
    const kit = editorKit({ document: page(), selection: "h1" });
    kit.render(<div className="app"><Canvas /><Drawers /><EditorKeys /></div>);
    act(() => toggleDrawer(kit.env, "insert"));
    const insert = () => screen.queryByRole("complementary", { name: "Insert" });
    lay(document.querySelector(".canvas"), [0, 52, 820, 1132]);
    lay(insert(), [8, 60, 288, 1132]);

    // Partly under it: the clamp has moved to its other side, the block shows.
    lay(block("h1"), [50, 264, 394, 400]);
    act(() => block("h1").focus());
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(kit.ui.getState().drawer).toBe("insert");

    // Scrolled out of view: nothing of it to hide.
    lay(block("t1"), [50, 1200, 206, 1300]);
    act(() => block("t1").focus());
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(kit.ui.getState().drawer).toBe("insert");

    // Wholly under it: Insert closes, the focus stays on the block, and says so.
    lay(block("b1"), [50, 420, 206, 474]);
    act(() => block("b1").focus());
    await waitFor(() => expect(kit.ui.getState().drawer).toBeNull());
    expect(document.activeElement).toBe(block("b1"));
    expect(kit.ui.getState().notice).toBe("Insert closed: it was covering the block.");
    expect(kit.store.getState().selection).toBe("b1");
  } finally {
    restore();
  }
});

test("Alt+Shift+N and Alt+Shift+O open Insert and the Outline from the canvas, and close them again", async () => {
  const kit = editorKit({ document: page(), selection: "h1" });
  kit.render(<div className="app"><Canvas /><Drawers /><EditorKeys /></div>);
  const block = document.querySelector<HTMLElement>('.canvas [data-block-id="h1"]')!;
  act(() => block.focus());
  fireEvent.keyDown(block, { key: "N", code: "KeyN", altKey: true, shiftKey: true });
  expect(kit.ui.getState().drawer).toBe("insert");
  // From inside the drawer (not typing), its chord closes it: the focus
  // goes back to the block.
  const first = screen.getByRole("complementary", { name: "Insert" });
  fireEvent.keyDown(first, { key: "N", code: "KeyN", altKey: true, shiftKey: true });
  expect(kit.ui.getState().drawer).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(block));
  fireEvent.keyDown(block, { key: "O", code: "KeyO", altKey: true, shiftKey: true });
  expect(kit.ui.getState().drawer).toBe("outline");
  fireEvent.keyDown(document.activeElement!, { key: "O", code: "KeyO", altKey: true, shiftKey: true });
  expect(kit.ui.getState().drawer).toBeNull();
});
