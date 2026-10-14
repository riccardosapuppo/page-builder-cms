// The bar at the foot of a phone's window (./PhoneBar.tsx) and the grip of
// its sheets (./sheet-grip.tsx): one sheet at a time, More's own sheet and
// its Esc, Undo and Redo, the sheets closing when a text is written on the
// page, and a sheet made tall, back, or closed by its grip.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { makeDelete } from "../document/commands.ts";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { PhoneBar } from "./PhoneBar.tsx";
import { SheetGrip } from "./sheet-grip.tsx";

const current = { id: 7, kind: "page" as const, slug: "winter-series", home: false, published: null, revision: 3, links: { preview: "/preview/7", live: null } };
const key = (name: string) => screen.getByRole("button", { name });

// A phone's window: none of the wider layouts' widths match, and the
// pointer is a finger.
let kept: typeof window.matchMedia;
beforeEach(() => {
  kept = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)",
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = kept;
});

test("Insert, the Outline and Settings each rise as a sheet, one at a time, each key pressed while its sheet is up; More closes the one up", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<PhoneBar />);
  expect(screen.getByRole("navigation", { name: "Editor tools" })).toBeTruthy();
  fireEvent.click(key("Insert"));
  expect([kit.ui.getState().drawer, kit.ui.getState().sidebarOpen]).toEqual(["insert", false]);
  expect(key("Insert").getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(key("Settings"));
  expect([kit.ui.getState().drawer, kit.ui.getState().sidebarOpen]).toEqual([null, true]);
  expect([key("Insert").getAttribute("aria-pressed"), key("Settings").getAttribute("aria-pressed")]).toEqual(["false", "true"]);
  fireEvent.click(key("Outline"));
  expect([kit.ui.getState().drawer, kit.ui.getState().sidebarOpen]).toEqual(["outline", false]);
  // Pressed again, its sheet goes down.
  fireEvent.click(key("Outline"));
  expect(kit.ui.getState().drawer).toBe(null);
  fireEvent.click(key("Settings"));
  fireEvent.click(key("More"));
  expect([kit.ui.getState().drawer, kit.ui.getState().sidebarOpen]).toEqual([null, false]);
  const more = screen.getByRole("dialog", { name: "More" });
  expect(screen.getByRole("button", { name: "History" })).toBeTruthy();
  expect(screen.getByRole("radiogroup", { name: "Look at the page on" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Block edges" })).toBeTruthy();
  // Esc closes it, the focus back on its key.
  fireEvent.keyDown(more, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
  expect(document.activeElement).toBe(key("More"));
  // History from More: its sheet, More gone.
  fireEvent.click(key("More"));
  fireEvent.click(screen.getByRole("button", { name: "History" }));
  expect(kit.ui.getState().drawer).toBe("history");
  expect(screen.queryByRole("dialog", { name: "More" })).toBeNull();
});

test("Undo and Redo are off with nothing to take back or bring again, and each runs its step", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<PhoneBar />);
  expect([key("Undo").getAttribute("aria-disabled"), key("Redo").getAttribute("aria-disabled")]).toEqual(["true", "true"]);
  const made = makeDelete(kit.doc(), "q1");
  if (!made.ok) throw new Error(made.error.message);
  act(() => {
    kit.store.getState().dispatch(made.command);
  });
  expect(kit.block("q1")).toBeUndefined();
  expect(key("Undo").getAttribute("aria-disabled")).toBe(null);
  expect(key("Undo").getAttribute("title")).toMatch(/^Undo “/);
  fireEvent.click(key("Undo"));
  expect(kit.block("q1")).toBeDefined();
  fireEvent.click(key("Redo"));
  expect(kit.block("q1")).toBeUndefined();
});

test("a text written on the page closes the sheet up over it", () => {
  const kit = editorKit({ document: page(), session: { current } });
  // A phone's editor opens with its settings down (./layout-mode.ts).
  act(() => kit.ui.getState().setSidebarOpen(false));
  kit.render(<PhoneBar />);
  fireEvent.click(key("Settings"));
  expect(kit.ui.getState().sidebarOpen).toBe(true);
  act(() => kit.ui.setState({ editingText: { id: "t1", at: "end" } }));
  expect(kit.ui.getState().sidebarOpen).toBe(false);
  act(() => kit.ui.setState({ editingText: null }));
  fireEvent.click(key("Insert"));
  act(() => kit.ui.setState({ editingText: { id: "t1", at: "end" } }));
  expect(kit.ui.getState().drawer).toBe(null);
});

test("the grip: a press makes the sheet tall and back; a drag up makes it tall, a short drag down back, a long one closes it", () => {
  const kit = editorKit({ document: page(), session: { current } });
  const onClose = vi.fn();
  kit.render(<aside className="drawer"><SheetGrip name="Insert" onClose={onClose} /></aside>);
  const grip = screen.getByRole("button", { name: "Insert: full height" });
  expect(grip.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(grip);
  expect(kit.ui.getState().sheetTall).toBe(true);
  expect(grip.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(grip);
  expect(kit.ui.getState().sheetTall).toBe(false);
  const drag = (from: number, to: number) => {
    fireEvent.pointerDown(grip, { button: 0, pointerId: 1, clientY: from });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: (from + to) / 2 });
    fireEvent.pointerMove(grip, { pointerId: 1, clientY: to });
    fireEvent.pointerUp(grip, { pointerId: 1, clientY: to });
    // The click a drag's release makes is not a press.
    fireEvent.click(grip);
  };
  drag(400, 340);
  expect(kit.ui.getState().sheetTall).toBe(true);
  drag(100, 150);
  expect(kit.ui.getState().sheetTall).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  drag(100, 200);
  expect(onClose).toHaveBeenCalledTimes(1);
  // Opening or closing a sheet lets a tall one go.
  fireEvent.click(grip);
  expect(kit.ui.getState().sheetTall).toBe(true);
  act(() => kit.ui.getState().setDrawer("outline"));
  expect(kit.ui.getState().sheetTall).toBe(false);
});

test("in a wider window the grip is not drawn", () => {
  window.matchMedia = ((query: string) => ({ matches: query === "(min-width: 1100px)", media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<aside className="drawer"><SheetGrip name="Insert" onClose={() => {}} /></aside>);
  expect(screen.queryByRole("button", { name: "Insert: full height" })).toBeNull();
});
