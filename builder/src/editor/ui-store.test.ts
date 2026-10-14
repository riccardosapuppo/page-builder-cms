// The interface's own store (./ui-store.ts): where the drawers and the
// sidebar share the canvas (a tablet's and a phone's windows), one panel at
// a time, the one opened last staying, whichever way it opened; in the
// approved layout the two stand together.
// @vitest-environment node
import { expect, test } from "vitest";
import { createUiStore } from "./ui-store.ts";

const shown = (ui: ReturnType<typeof createUiStore>) => [ui.getState().drawer, ui.getState().sidebarOpen];

test("with one panel at a time, the panel opened last stays: a drawer closes the sidebar, the sidebar a drawer, whichever way it is shown", () => {
  const ui = createUiStore({ onePanel: true, sidebarOpen: true });
  ui.getState().setDrawer("insert");
  expect(shown(ui)).toEqual(["insert", false]);
  ui.getState().setSidebarOpen(true);
  expect(shown(ui)).toEqual([null, true]);
  ui.getState().setDrawer("history");
  expect([...shown(ui), ui.getState().historyOpen]).toEqual(["history", false, true]);
  // Shown by a way of its own (Site style from the mark's menu, Enter on a
  // block): the drawer goes, History with its state.
  ui.setState({ sidebarOpen: true, tray: "site-style" });
  expect([...shown(ui), ui.getState().historyOpen]).toEqual([null, true, false]);
  // Closing one opens nothing.
  ui.getState().setSidebarOpen(false);
  expect(shown(ui)).toEqual([null, false]);
});

test("in the approved layout the two stand together; the rule taking hold keeps the drawer open", () => {
  const ui = createUiStore({ sidebarOpen: true });
  ui.getState().setDrawer("outline");
  expect(shown(ui)).toEqual(["outline", true]);
  ui.getState().setOnePanel(true);
  expect(shown(ui)).toEqual(["outline", false]);
  ui.getState().setOnePanel(false);
  ui.getState().setSidebarOpen(true);
  expect(shown(ui)).toEqual(["outline", true]);
});
