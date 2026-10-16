// The top bar: under the page's title, whether the page is live and how
// many of its saved changes are not (the draft's revision against the one
// the live version came from); the three drawers' keys, one drawer open at
// a time; the page switch, a small window with a search over the site's
// pages, its header and footer, and its collections' templates; the
// sidebar's key.
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { newsCollection, templateOf } from "../../test/site-entries.ts";
import type { PageSummary, Published, Schedule } from "../storage/adapter.ts";
import { emptySession, type OpenPage } from "./session.tsx";
import { TopBar } from "./TopBar.tsx";

const live: Published = { slug: "winter-series", versionNumber: 4, draftRevision: 3, publishedAt: "2026-09-28T07:02:00.000Z" };
const open = (changes: Partial<OpenPage>): OpenPage => ({ id: 1, kind: "page", slug: "winter-series", home: false, published: live, revision: 3, links: { preview: "/preview/1", live: "/winter-series" }, ...changes });
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
    // Described by where the page is, then by this line.
    expect(document.getElementById(title.getAttribute("aria-describedby")!.split(" ").at(-1)!)?.textContent).toBe(said);
    unmount();
  }
});

test("a publish set for a time follows on the line, by the site's clock, whatever the browser's zone", () => {
  const scheduled: Schedule = { id: 3, at: "2026-10-05T06:15:00.000Z", revision: 9, versionNumber: 12, state: "pending", createdAt: "2026-10-02T08:00:00.000Z", settledAt: null, publishedVersionNumber: null };
  for (const [current, said] of [
    [open({ revision: 9, scheduled }), "Published, 6 changes not live · scheduled for Oct 5 at 7:15 AM"],
    [open({ published: null, scheduled }), "Not published yet · scheduled for Oct 5 at 7:15 AM"],
  ] as const) {
    const kit = editorKit({ document: page(), session: { current } });
    kit.ui.getState().setSite({ timeZone: "Europe/London" });
    const { unmount } = kit.render(<TopBar />);
    expect(status()).toBe(said);
    expect(document.querySelector(".tb-status")!.getAttribute("title")).toContain("A publish is scheduled for Oct 5 at 7:15 AM (UTC+1): the Publish menu cancels it.");
    unmount();
  }
});

// The kit's clock reads Fri Oct 2, 9:00:00 UTC. A publish set for the
// moment is the job still on its way; for more than half a minute ago, one
// the job did not carry out.
test("a publish set for a time that has passed, with the page still not live, says it should have gone live, once it is half a minute late", async () => {
  const scheduled: Schedule = { id: 3, at: "2026-10-02T09:00:00.000Z", revision: 9, versionNumber: 12, state: "pending", createdAt: "2026-10-02T08:00:00.000Z", settledAt: null, publishedVersionNumber: null };
  const kit = editorKit({ document: page(), session: { current: open({ revision: 9, scheduled }) } });
  kit.ui.getState().setSite({ timeZone: "Europe/London" });
  kit.render(<TopBar />);

  expect(status()).toBe("Published, 6 changes not live · scheduled for Oct 2 at 10:00 AM");
  await act(() => kit.clock.advance(29_000));
  expect(status()).toBe("Published, 6 changes not live · scheduled for Oct 2 at 10:00 AM");
  await act(() => kit.clock.advance(2_000));
  expect(status()).toBe("Published, 6 changes not live · should have gone live on Oct 2 at 10:00 AM");
  expect(document.querySelector(".tb-sched")!.classList.contains("tb-sched-late")).toBe(true);
  expect(document.querySelector(".tb-status")!.getAttribute("title")).toContain("The publish scheduled for Oct 2 at 10:00 AM (UTC+1) has not happened yet.");
  expect(kit.clock.pending, "the timer is spent, none is left behind").toBe(0);
});

test("a publish whose time is long past is said to be late from the first draw, and one in the future is not", () => {
  const at = (iso: string): Schedule => ({ id: 3, at: iso, revision: 9, versionNumber: 12, state: "pending", createdAt: "2026-10-01T08:00:00.000Z", settledAt: null, publishedVersionNumber: null });
  for (const [iso, said] of [
    ["2026-10-02T08:00:00.000Z", "Not published yet · should have gone live on Oct 2 at 9:00 AM"],
    ["2026-10-02T09:01:00.000Z", "Not published yet · scheduled for Oct 2 at 10:01 AM"],
  ] as const) {
    const kit = editorKit({ document: page(), session: { current: open({ published: null, scheduled: at(iso) }) } });
    kit.ui.getState().setSite({ timeZone: "Europe/London" });
    const { unmount } = kit.render(<TopBar />);
    expect(status()).toBe(said);
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
    id, kind: "page", title, slug, home, revision, updatedAt: "2026-10-02T08:00:00.000Z", published, scheduled: null,
    links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null },
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

test("the page switch lists the header and the footer apart, on every page, and opens them as it opens a page", async () => {
  const opened: number[] = [];
  const part = (id: number, kind: "header" | "footer", published: Published | null): PageSummary => ({
    id, kind, title: kind === "header" ? "Header" : "Footer", slug: null, home: false, revision: 2, updatedAt: "2026-10-12T08:00:00.000Z", published, scheduled: null,
    links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null },
  });
  const kit = editorKit({
    document: page(),
    session: {
      current: open({}),
      pages: [{ ...part(1, "header", live), kind: "page", title: "Winter series", slug: "winter-series", links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: "/winter-series" } }],
      parts: [part(4, "header", { ...live, slug: null, draftRevision: 2 }), part(5, "footer", null)],
      openPage: async (id) => {
        opened.push(id);
        return null;
      },
    },
  });
  kit.render(<TopBar />);
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Winter series" }));
  const pages = screen.getByRole("dialog", { name: "Pages" });
  const group = within(pages).getByRole("heading", { name: "On every page" });
  const parts = [...(group.nextElementSibling?.querySelectorAll<HTMLElement>(".page-row") ?? [])];
  expect(parts.map((r) => r.textContent)).toEqual(["HeaderEvery pagePublished", "FooterEvery pageNot published yet"]);
  // The search finds them by their names too.
  fireEvent.change(within(pages).getByRole("searchbox", { name: "Find a page" }), { target: { value: "foot" } });
  expect(within(pages).queryAllByRole("button").filter((b) => b.classList.contains("page-row")).map((r) => r.querySelector("strong")?.textContent)).toEqual(["Footer"]);
  await act(async () => {
    fireEvent.click(within(pages).getByRole("button", { name: /^Footer/ }));
  });
  expect(opened).toEqual([5]);
});

// The site's collections and their templates, as the canvas read them: News
// live, Club kit's template never published.
const COLLECTIONS = [
  newsCollection({ template: { ...templateOf(90, "News"), revision: 2, published: { slug: null, versionNumber: 3, draftRevision: 2, publishedAt: "2026-10-01T09:00:00.000Z" } } }),
  newsCollection({ id: 4, name: "Club kit", prefix: "shop", template: templateOf(91, "Kit page") }),
];
const KEEPS_COLLECTIONS = { ...emptySession().capabilities, collections: true };
const pageRows = (scope: HTMLElement) => within(scope).queryAllByRole("button").filter((b) => b.classList.contains("page-row"));

test("the page switch lists the collections' templates apart, after the header and the footer, each named by its collection, on every entry, live or not; the search finds them, the arrows reach them, and one opens as Edit the template opens it", async () => {
  const opened: number[] = [];
  const summary = (id: number, kind: PageSummary["kind"], title: string, slug: string | null): PageSummary => ({
    id, kind, title, slug, home: false, revision: 1, updatedAt: "2026-10-02T08:00:00.000Z", published: null, scheduled: null,
    links: { self: "", draft: "", versions: "", publish: "", schedules: "", preview: "", live: null },
  });
  const kit = editorKit({
    document: page(),
    session: {
      current: open({}),
      capabilities: KEEPS_COLLECTIONS,
      pages: [summary(1, "page", "Winter series", "winter-series"), summary(2, "page", "News", "news")],
      parts: [summary(4, "header", "Header", null), summary(5, "footer", "Footer", null)],
      openPage: async (id) => {
        opened.push(id);
        return null;
      },
    },
  });
  kit.ui.getState().setSiteEntries({ collections: COLLECTIONS, entries: new Map() });
  kit.ui.getState().setCollections({ collectionId: null });
  kit.render(<TopBar />);
  const title = screen.getByRole("button", { name: "Switch page. Open: Winter series" });
  fireEvent.click(title);
  const pages = screen.getByRole("dialog", { name: "Pages" });
  expect(within(pages).getAllByRole("heading").map((h) => h.textContent)).toEqual(["On every page", "Templates"]);
  const templates = within(pages).getByRole("list", { name: "Templates" });
  // Named by the collection, not by the template's own title.
  expect(pageRows(templates).map((r) => r.textContent)).toEqual(["NewsEvery entryPublished", "Club kitEvery entryNot published yet"]);
  expect(templates.compareDocumentPosition(within(pages).getByRole("list", { name: "On every page" })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();

  // The arrows go on from the footer to the templates.
  const footer = within(pages).getByRole("button", { name: /^Footer/ });
  footer.focus();
  fireEvent.keyDown(footer, { key: "ArrowDown" });
  expect(document.activeElement).toBe(pageRows(templates)[0]);

  // The search finds a template by its collection's name, as it finds a
  // page by its title.
  const search = within(pages).getByRole("searchbox", { name: "Find a page" });
  fireEvent.change(search, { target: { value: "KIT" } });
  expect(pageRows(pages).map((r) => r.querySelector("strong")?.textContent)).toEqual(["Club kit"]);
  fireEvent.change(search, { target: { value: "news" } });
  expect(pageRows(pages).map((r) => [r.querySelector("strong")?.textContent, r.querySelector("small")?.textContent])).toEqual([["News", "/news"], ["News", "Every entry"]]);
  fireEvent.change(search, { target: { value: "harbour" } });
  expect(within(pages).queryByRole("heading", { name: "Templates" })).toBeNull();

  // Opened as Edit the template opens it: by the page's opening, the
  // Collections screen closed if it was open, the window gone.
  fireEvent.change(search, { target: { value: "" } });
  await act(async () => {
    fireEvent.click(within(within(pages).getByRole("list", { name: "Templates" })).getByRole("button", { name: /^Club kit/ }));
  });
  expect(opened).toEqual([91]);
  expect(kit.ui.getState().collections).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Pages" })).toBeNull();
});

test("the template open is marked in the page switch, and pressed it only closes the window; the templates are listed only where the storage keeps collections and one exists", async () => {
  const opened: number[] = [];
  const template = open({ id: 90, kind: "template", slug: null, collection: { id: 3, name: "News", prefix: "news" } });
  const kit = editorKit({ document: page(), session: { current: template, capabilities: KEEPS_COLLECTIONS, openPage: async (id) => (opened.push(id), null) } });
  kit.ui.getState().setSiteEntries({ collections: COLLECTIONS, entries: new Map() });
  const { unmount } = kit.render(<TopBar />);
  const title = screen.getByRole("button", { name: "Switch page. Open: Winter series" });
  fireEvent.click(title);
  const row = within(screen.getByRole("list", { name: "Templates" })).getByRole("button", { name: /^News/ });
  expect(row.getAttribute("aria-current")).toBe("page");
  fireEvent.click(row);
  expect(opened).toEqual([]);
  expect(screen.queryByRole("dialog", { name: "Pages" })).toBeNull();
  expect(document.activeElement).toBe(title);
  unmount();

  for (const [capabilities, collections] of [[emptySession().capabilities, COLLECTIONS], [KEEPS_COLLECTIONS, []]] as const) {
    const plain = editorKit({ document: page(), session: { current: open({}), capabilities } });
    plain.ui.getState().setSiteEntries({ collections, entries: new Map() });
    const drawn = plain.render(<TopBar />);
    fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Winter series" }));
    expect(within(screen.getByRole("dialog", { name: "Pages" })).queryByRole("heading", { name: "Templates" })).toBeNull();
    drawn.unmount();
  }
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

test("where the storage serves no page (the browser demo), the line counts what is still to publish, not what visitors do not see", () => {
  const demo = { cmsOrigin: null, capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: false, collections: false, shop: false } };
  for (const [current, said, tip] of [
    [open({ published: null }), "Not published yet", undefined],
    [open({}), "Published", "Published <when>."],
    [open({ revision: 4 }), "Published, 1 change to publish", "Published <when>. Your 1 change since then is saved in this browser but not published yet: Publish keeps it."],
    [open({ revision: 9 }), "Published, 6 changes to publish", "Published <when>. Your 6 changes since then are saved in this browser but not published yet: Publish keeps them."],
    [open({ slug: "winter" }), "Published, new address to publish", "Published <when>. The page’s new address, /winter, is not published yet: Publish keeps it."],
  ] as const) {
    const kit = editorKit({ document: page(), session: { current, ...demo } });
    const { unmount } = kit.render(<TopBar />);
    expect(status()).toBe(said);
    // The time is shown in the browser's own zone: it is left out here.
    expect(document.querySelector(".tb-status")!.getAttribute("title")?.replace(/^Published [A-Z][a-z]{2} \d+ at \d+:\d+ [AP]M\./, "Published <when>.")).toBe(tip);
    expect(`${status()}${document.querySelector(".tb-status")!.getAttribute("title")}`).not.toMatch(/live|visitors/i);
    unmount();
  }
});
