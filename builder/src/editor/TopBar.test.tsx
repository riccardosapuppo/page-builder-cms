// The top bar: under the page's title, whether the page is live and how
// many of its saved changes are not (the draft's revision against the one
// the live version came from); the three drawers' keys, one drawer open at
// a time; the page switch, a small window with a search over the site's
// pages; the sidebar's key.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { PageSummary, Published } from "../storage/adapter.ts";
import type { OpenPage } from "./session.tsx";
import { TopBar } from "./TopBar.tsx";

const live: Published = { slug: "winter-series", versionNumber: 4, draftRevision: 3, publishedAt: "2026-09-28T07:02:00.000Z" };
const open = (changes: Partial<OpenPage>): OpenPage => ({ id: 1, slug: "winter-series", home: false, published: live, revision: 3, links: { preview: "/preview/1", live: "/winter-series" }, ...changes });
const status = () => document.querySelector(".tb-status")?.textContent;

test("the line under the title counts the saves visitors do not see yet, and describes the title's button", () => {
  for (const [current, said] of [
    [open({ published: null }), "Not published yet"],
    [open({}), "Published"],
    [open({ revision: 4 }), "Published, 1 change not live"],
    [open({ revision: 9 }), "Published, 6 changes not live"],
    [open({ slug: "winter" }), "Published, new address not live"],
  ] as const) {
    const kit = editorKit({ document: page(), session: { current } });
    const { unmount } = kit.render(<TopBar />);
    expect(status()).toBe(said);
    const title = screen.getByRole("button", { name: "Switch page. Open: Winter series" });
    expect(document.getElementById(title.getAttribute("aria-describedby")!)?.textContent).toBe(said);
    unmount();
  }
});

test("Insert, Outline and History each open their drawer and close it, one open at a time, with their keys named", () => {
  const kit = editorKit({ document: page(), session: { current: open({}) } });
  kit.render(<TopBar />);
  const key = (name: string) => screen.getByRole("button", { name });
  for (const name of ["Insert", "Outline", "History"]) expect(key(name).getAttribute("aria-pressed")).toBe("false");
  expect(key("Insert").getAttribute("title")).toBe("Insert: every block and ready-made section (Alt+Shift+N)");
  expect(key("Insert").getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+N");
  expect(key("Outline").getAttribute("aria-keyshortcuts")).toBe("Alt+Shift+O");
  fireEvent.click(key("Insert"));
  expect(kit.ui.getState().drawer).toBe("insert");
  expect(key("Insert").getAttribute("aria-pressed")).toBe("true");
  expect(key("Insert").getAttribute("aria-controls")).toBe("drawer_insert");
  fireEvent.click(key("Outline"));
  expect(kit.ui.getState().drawer).toBe("outline");
  expect(key("Insert").getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(key("History"));
  expect(kit.ui.getState()).toMatchObject({ drawer: "history", historyOpen: true });
  fireEvent.click(key("History"));
  expect(kit.ui.getState()).toMatchObject({ drawer: null, historyOpen: false });
  // Undo and redo, greyed with nothing to do.
  expect(screen.getByRole("button", { name: "Undo" }).getAttribute("aria-disabled")).toBe("true");
  expect(screen.getByRole("button", { name: "Redo" }).getAttribute("title")).toBe("Nothing to redo");
});

test("the page switch lists the site's pages with their addresses and whether they are live, finds them, and opens the one chosen", async () => {
  const opened: number[] = [];
  const summary = (id: number, title: string, slug: string, home: boolean, published: Published | null = null, revision = 1): PageSummary => ({
    id, title, slug, home, revision, updatedAt: "2026-10-02T08:00:00.000Z", published,
    links: { self: "", draft: "", versions: "", publish: "", preview: "", live: null },
  });
  const kit = editorKit({
    document: page(),
    session: {
      current: open({ revision: 5 }),
      cmsOrigin: "http://127.0.0.1:3900",
      pages: [
        summary(2, "Slack Water", "home", true, { ...live, slug: "home", draftRevision: 6 }, 6),
        summary(1, "Winter series", "winter-series", false, live, 3),
        summary(3, "Tide times", "tides", false),
      ],
      openPage: async (id) => {
        opened.push(id);
        return null;
      },
    },
  });
  kit.render(<TopBar />);
  const button = screen.getByRole("button", { name: "Switch page. Open: Winter series" });
  fireEvent.click(button);
  expect(button.getAttribute("aria-expanded")).toBe("true");
  const pages = screen.getByRole("dialog", { name: "Pages" });
  const search = within(pages).getByRole("searchbox", { name: "Find a page" });
  expect(document.activeElement).toBe(search);
  const rows = () => within(pages).queryAllByRole("button").filter((b) => b.classList.contains("page-row"));
  // The open page's count comes from this tab's saves, the others' from
  // the list.
  expect(rows().map((r) => r.textContent)).toEqual([
    "Slack Water127.0.0.1:3900Published",
    "Winter series/winter-series2 changes not live",
    "Tide times/tidesNot published yet",
  ]);
  expect(rows()[1]!.getAttribute("aria-current")).toBe("page");
  // The arrows go from the search down the pages and back.
  fireEvent.keyDown(search, { key: "ArrowDown" });
  expect(document.activeElement).toBe(rows()[0]);
  fireEvent.keyDown(rows()[0]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(rows()[1]);
  fireEvent.keyDown(rows()[1]!, { key: "ArrowUp" });
  fireEvent.keyDown(rows()[0]!, { key: "ArrowUp" });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: "TIDE" } });
  expect(rows().map((r) => r.querySelector("strong")?.textContent)).toEqual(["Tide times"]);
  fireEvent.change(search, { target: { value: "harbour" } });
  expect(within(pages).getByRole("status").textContent).toBe("No page is called “harbour”.");
  fireEvent.keyDown(search, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Pages" })).toBeNull();
  expect(document.activeElement).toBe(button);

  fireEvent.click(button);
  await act(async () => {
    fireEvent.click(within(screen.getByRole("dialog", { name: "Pages" })).getByRole("button", { name: /^Slack Water/ }));
  });
  expect(opened).toEqual([2]);
  expect(screen.queryByRole("dialog", { name: "Pages" })).toBeNull();
  // New page: the window goes, the New page window opens.
  fireEvent.click(button);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Pages" })).getByRole("button", { name: "New page" }));
  expect(screen.getByRole("dialog", { name: "New page" })).toBeTruthy();
});

test("the sidebar's key hides the sidebar and brings it back, pressed while it shows", () => {
  const kit = editorKit({ document: page(), session: { current: open({}) } });
  kit.render(<TopBar />);
  const key = screen.getByRole("button", { name: "Settings sidebar" });
  expect(key.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(key);
  expect(kit.ui.getState().sidebarOpen).toBe(false);
  expect(key.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(key);
  expect(kit.ui.getState().sidebarOpen).toBe(true);
});

test("the mark's menu opens the site style in the sidebar, the sidebar shown if it was hidden", () => {
  const kit = editorKit({ document: page(), session: { current: open({}) } });
  kit.ui.getState().setSidebarOpen(false);
  kit.render(<TopBar />);
  fireEvent.click(screen.getByRole("button", { name: "Page Builder CMS menu" }));
  fireEvent.click(within(screen.getByRole("menu", { name: "Page Builder CMS" })).getByRole("menuitem", { name: "Site style" }));
  expect(kit.ui.getState()).toMatchObject({ sidebarOpen: true, tray: "site-style" });
  expect(screen.queryByRole("menu")).toBeNull();
});
