// The drawers: one open at a time; opened, a drawer takes the focus (what
// it marks, else its first key), unless something in it took it already;
// Esc in it, or its close button, closes it and gives the focus back to
// where it was before it opened; a menu or a window opened from it keeps
// its own Esc; the keymap's Alt+Shift chords open and close Insert and the
// Outline the same way.
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
  act(() => toggleDrawer(kit.ui, "insert"));
  expect(screen.getByRole("complementary", { name: "Insert" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search" }));
  // Another drawer replaces it; the place the focus goes back to stays the
  // first one's.
  act(() => toggleDrawer(kit.ui, "outline"));
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
  act(() => toggleDrawer(kit.ui, "history"));
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  expect(kit.ui.getState().historyOpen).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close History" }));
  expect(kit.ui.getState()).toMatchObject({ drawer: null, historyOpen: false });
  await waitFor(() => expect(document.activeElement).toBe(key));
});

test("closed from outside it, the focus stays where it is; a window opened from it keeps its own Esc", () => {
  const kit = editorKit({ document: page() });
  kit.render(<div className="app"><Drawers /><button type="button">Elsewhere</button></div>);
  act(() => toggleDrawer(kit.ui, "insert"));
  const inside = screen.getByRole("textbox", { name: "Search" });
  // A window's Esc inside the drawer: not the drawer's.
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  inside.parentElement!.append(dialog);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(kit.ui.getState().drawer).toBe("insert");
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
  act(() => elsewhere.focus());
  act(() => closeDrawer(kit.ui));
  expect(kit.ui.getState().drawer).toBeNull();
  expect(document.activeElement).toBe(elsewhere);
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
