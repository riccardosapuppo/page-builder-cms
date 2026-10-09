// The sidebar: its Page and Block tabs follow the selection, and either can
// be chosen by hand, the arrows moving between them; the Page tab holds the
// page's own settings and the ways to the header and footer (where the
// storage keeps a change of them) and to the site style, which open a level
// below and close back to it; the sidebar hides and comes back, the focus
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
  expect(screen.getByRole("button", { name: "Quote" }).getAttribute("aria-expanded")).toBe("true");
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

test("while a block is dragged its settings wait: what moves and where from, its groups closed with their values and out of reach, the Page tab inert; all back once it is put down", () => {
  const kit = editorKit({ document: page(), session: { current }, selection: "b1" });
  kit.render(<Sidebar />);
  // Before: the Button's own group open, its fields at hand.
  const panel = () => screen.getByRole("tabpanel");
  expect(within(panel()).getAllByRole("textbox").length).toBeGreaterThan(0);
  expect(within(panel()).getAllByRole("button", { expanded: true }).length).toBeGreaterThan(0);

  act(() => {
    expect(kit.store.getState().startDrag({ kind: "block", id: "b1" }).ok).toBe(true);
  });
  expect(panel().querySelector(".ed-title strong")?.textContent).toBe("Button");
  expect(within(panel()).getByText("Moving, from Hero, column 1")).toBeTruthy();
  expect(within(panel()).getByText("Settings wait while you move the block. Drop it, or press Esc.")).toBeTruthy();
  // Its groups, closed, each with its value, none a key or a field.
  const groups = [...panel().querySelectorAll(".grp")].map((group) => [group.querySelector(".grp-name")?.textContent, group.querySelector(".grp-sum-words")?.textContent]);
  expect(groups).toEqual([["Button", "Join"], ["Colors", "Buoy, theme text"], ["Alignment", "Left"], ["Shown on", "Every device"]]);
  expect(within(panel()).queryAllByRole("textbox")).toHaveLength(0);
  expect(within(panel()).queryAllByRole("button")).toHaveLength(0);
  expect(panel().querySelectorAll("[aria-expanded]")).toHaveLength(0);
  // The Page tab can be looked at; nothing in it can be reached.
  fireEvent.click(tab("Page"));
  expect(panel().querySelector(".sb-wait")?.hasAttribute("inert")).toBe(true);
  fireEvent.click(tab("Block"));

  // Esc puts the block back: the settings are the block's again.
  act(() => kit.store.getState().cancelDrag());
  expect(within(panel()).getAllByRole("textbox").length).toBeGreaterThan(0);
  expect(within(panel()).queryByText(/Settings wait/)).toBeNull();
  expect(panel().querySelector(".sb-wait")).toBeNull();
});

test("a new block from Insert on its way to the page has no settings yet: the sidebar names it and waits", () => {
  const kit = editorKit({ document: page(), session: { current }, selection: "b1" });
  kit.render(<Sidebar />);
  act(() => {
    expect(kit.store.getState().startDrag({ kind: "palette", block: { id: "fresh", type: "quote", props: { text: "Bring a cap." }, style: { base: {} }, children: [] } }).ok).toBe(true);
  });
  expect(screen.getByRole("tabpanel").querySelector(".ed-title strong")?.textContent).toBe("Quote");
  expect(within(screen.getByRole("tabpanel")).getByText("Adding to the page")).toBeTruthy();
  expect(within(screen.getByRole("tabpanel")).queryAllByRole("textbox")).toHaveLength(0);
  expect(screen.getByText("Settings wait while you add the block. Drop it, or press Esc.")).toBeTruthy();
});

test("a tab chosen by hand holds for its selection only: the next one is followed, and the choice does not come back with the first", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<Sidebar />);
  act(() => kit.store.getState().select("q1"));
  fireEvent.click(tab("Page"));
  expect(kit.ui.getState().sideTab).toEqual({ tab: "page", selection: "q1" });
  act(() => kit.store.getState().select("h1"));
  expect(tab("Block").getAttribute("aria-selected")).toBe("true");
  expect(kit.ui.getState().sideTab).toBeNull();
  act(() => kit.store.getState().select("q1"));
  expect(tab("Block").getAttribute("aria-selected")).toBe("true");
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
  fireEvent.click(within(style).getByRole("button", { name: "Back to Page" }));
  expect(kit.ui.getState().tray).toBe("edit");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Site style" })));

  // Opened from a block's panel, it goes back to the Page tab too, the
  // block still selected.
  act(() => kit.store.getState().select("q1"));
  expect(tab("Block").getAttribute("aria-selected")).toBe("true");
  fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Site style" }));
  expect(kit.ui.getState().tray).toBe("site-style");
  fireEvent.click(within(screen.getByRole("complementary", { name: "Site style" })).getByRole("button", { name: "Back to Page" }));
  expect(tab("Page").getAttribute("aria-selected")).toBe("true");
  expect(kit.store.getState().selection).toBe("q1");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Site style" })));
});

test("Header and footer opens a level below Page beside Site style, on the site's name, and closes back to it, the focus on the way in", async () => {
  const capabilities = { publish: true, schedule: false, responses: false, headerFooter: true, imageVariants: false, livePages: true };
  const kit = editorKit({ document: page(), session: { current, capabilities } });
  kit.ui.getState().setSite({ name: "Slack Water", menu: [], action: null, footer: { lead: "Lead.", text: "Text." }, timeZone: "Europe/London", revision: 0, updatedAt: null });
  kit.render(<Sidebar />);
  const link = screen.getByRole("button", { name: "Header and footer" });
  expect(document.getElementById(link.getAttribute("aria-describedby")!)?.textContent).toBe("Name, menu, button and footer of every page");
  // Beside Site style, at the foot of the Page tab.
  expect([...screen.getByRole("tabpanel").querySelectorAll(".sb-link")].map((b) => b.getAttribute("aria-label"))).toEqual(["Header and footer", "Site style"]);
  fireEvent.click(link);
  expect(kit.ui.getState().tray).toBe("header-footer");
  const panel = screen.getByRole("complementary", { name: "Header and footer" });
  await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText("Site name")));
  // A change left waiting is said on the way in, once back on the Page tab.
  fireEvent.change(within(panel).getByLabelText("Site name"), { target: { value: "Northshore" } });
  fireEvent.click(within(panel).getByRole("button", { name: "Back to Page" }));
  expect(kit.ui.getState().tray).toBe("edit");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Header and footer" })));
  expect(document.getElementById(screen.getByRole("button", { name: "Header and footer" }).getAttribute("aria-describedby")!)?.textContent).toBe("Changes not saved yet");
});

test("a storage that keeps no change of the header and footer has no way to them", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<Sidebar />);
  expect(kit.ui.getState().tray).toBe("edit");
  expect(screen.queryByRole("button", { name: "Header and footer" })).toBeNull();
  expect(screen.getByRole("button", { name: "Site style" })).toBeTruthy();
});

test("over the site style too, the sidebar's close button hides the sidebar, which comes back on the site style", async () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<><header className="topbar"><button type="button" data-sidebar="">Settings sidebar</button></header><Sidebar /></>);
  fireEvent.click(screen.getByRole("button", { name: "Site style" }));
  const hide = within(screen.getByRole("complementary", { name: "Site style" })).getByRole("button", { name: "Hide the sidebar" });
  act(() => hide.focus());
  fireEvent.click(hide);
  expect(kit.ui.getState()).toMatchObject({ sidebarOpen: false, tray: "site-style" });
  expect(screen.queryByRole("complementary")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings sidebar" })));
  act(() => toggleSidebar(kit.ui));
  expect(screen.getByRole("complementary", { name: "Site style" })).toBeTruthy();
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
