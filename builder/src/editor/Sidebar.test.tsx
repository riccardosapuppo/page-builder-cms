// The sidebar: its Page and Block tabs follow the selection, and either can
// be chosen by hand, the arrows moving between them; the Page tab holds the
// page's own settings and the way to the site style, which opens a level
// below and closes back to it; the sidebar hides and comes back, the focus
// going to the top bar's key and back in.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { Sidebar, toggleSidebar } from "./Sidebar.tsx";

const current = { id: 7, slug: "winter-series", home: false, published: null, revision: 3, links: { preview: "/preview/7", live: null } };
const tab = (name: "Page" | "Block") => screen.getByRole("tab", { name });

test("the tabs follow the selection, and either can be chosen by hand", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<Sidebar />);
  expect(screen.getByRole("complementary", { name: "Settings" })).toBeTruthy();
  // Nothing selected: the page's own settings.
  expect(tab("Page").getAttribute("aria-selected")).toBe("true");
  expect(screen.getByLabelText("Title")).toBeTruthy();
  act(() => kit.store.getState().select("q1"));
  expect(tab("Block").getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tablist", { name: "Quote properties" })).toBeTruthy();
  fireEvent.click(tab("Page"));
  expect(screen.getByLabelText("Address")).toBeTruthy();
  // The arrows move between the two, the tab stop with them.
  fireEvent.keyDown(tab("Page"), { key: "ArrowRight" });
  expect(tab("Block").getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tab("Block"));
  expect(tab("Page").tabIndex).toBe(-1);
  act(() => kit.store.getState().select(null));
  expect(tab("Page").getAttribute("aria-selected")).toBe("true");
  // Block by hand with nothing selected says how to choose one.
  fireEvent.click(tab("Block"));
  expect(screen.getByRole("tabpanel").textContent).toContain("Nothing is selected.");
});

test("Site style opens a level below Page, and closes back to it, the focus on the way in", async () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<Sidebar />);
  const link = screen.getByRole("button", { name: "Site style" });
  expect(document.getElementById(link.getAttribute("aria-describedby")!)?.textContent).toBe("Palette and type scale for every page");
  fireEvent.click(link);
  expect(kit.ui.getState().tray).toBe("site-style");
  const style = screen.getByRole("complementary", { name: "Site style" });
  expect(screen.queryByRole("tablist", { name: "Settings" })).toBeNull();
  fireEvent.click(within(style).getByRole("button", { name: "Close site style" }));
  expect(kit.ui.getState().tray).toBe("edit");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Site style" })));
});

test("hidden, the sidebar is gone and the focus goes to the top bar's key; shown, it comes back to its tab", async () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<><header className="topbar"><button type="button" data-sidebar="">Settings sidebar</button></header><Sidebar /></>);
  const hide = screen.getByRole("button", { name: "Hide the sidebar" });
  act(() => hide.focus());
  fireEvent.click(hide);
  expect(kit.ui.getState().sidebarOpen).toBe(false);
  expect(screen.queryByRole("complementary")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings sidebar" })));
  act(() => toggleSidebar(kit.ui));
  await waitFor(() => expect(document.activeElement).toBe(tab("Page")));
});
