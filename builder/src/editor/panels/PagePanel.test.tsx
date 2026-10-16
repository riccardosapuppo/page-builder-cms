// The page's panel, the sidebar's Page tab: its groups, Title and address
// and Search results, both open until closed; title and description by the
// page command; the address through the storage adapter, whose refusal
// shows on the Address field; the server's 422 on the title on its field,
// its group opened for it.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { describedText, editorKit, groupNames } from "../../../test/editor-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { errorsByBlock } from "../../storage/adapter.ts";
import footerStarter from "../../../../cms/config/parts/footer.json";
import headerStarter from "../../../../cms/config/parts/header.json";
import type { PageDocument } from "../../shared/document.ts";
import { PagePanel } from "./EditPanel.tsx";

const current = { id: 7, kind: "page" as const, slug: "winter-series", home: false, published: null, revision: 3, links: { preview: "/preview/7", live: null } };

test("title and description change the page by the page command", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<PagePanel />);
  const title = screen.getByLabelText("Title");
  fireEvent.change(title, { target: { value: "Winter swims" } });
  fireEvent.blur(title);
  expect(kit.doc().title).toBe("Winter swims");
  expect(kit.lastCommand()).toMatchObject({ kind: "page", label: "Changed the page title", subject: null });

  const description = screen.getByLabelText("Description");
  fireEvent.change(description, { target: { value: "" } });
  fireEvent.blur(description);
  expect(kit.doc()).not.toHaveProperty("description");
  expect(kit.lastCommand()?.label).toBe("Removed the page description");
});

test("a title the page refuses stays in its field, held: what asks for it waits and is told why, until the field gives the page one it takes; a field that goes lets it go", () => {
  const kit = editorKit({ document: page(), session: { current } });
  const view = kit.render(<PagePanel />);
  const title = screen.getByLabelText("Title");
  const before = kit.doc().title;
  fireEvent.change(title, { target: { value: "W".repeat(121) } });
  fireEvent.blur(title);
  // Refused: said under the field, the page's title as it was.
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(kit.doc().title).toBe(before);
  // Asked for by something else, it is still held, and the reason said.
  let given = true;
  act(() => {
    given = kit.ui.getState().pending.deliver();
  });
  expect(given).toBe(false);
  expect(kit.ui.getState().notice).toMatch(/^Title cannot be kept yet: .+\. It stays in its field until the page can take it\.$/);
  expect(kit.ui.getState().pending.waiting).toBe(1);

  // A title the page takes: handed over, nothing held.
  fireEvent.focus(title);
  fireEvent.change(title, { target: { value: "Winter swims" } });
  fireEvent.blur(title);
  expect(kit.doc().title).toBe("Winter swims");
  expect(kit.ui.getState().pending.waiting).toBe(0);

  // Refused again, then the panel goes: the field lets go of it.
  fireEvent.focus(title);
  fireEvent.change(title, { target: { value: "W".repeat(121) } });
  fireEvent.blur(title);
  expect(kit.ui.getState().pending.waiting).toBe(1);
  view.unmount();
  expect(kit.ui.getState().pending.waiting).toBe(0);
});

test("the page's settings come in two groups, both open; closed, each says its value; the person's choice is kept for the page", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.render(<PagePanel />);
  expect(groupNames()).toEqual(["Title and address", "Search results"]);
  expect([...document.querySelectorAll(".grp-head")].map((h) => h.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
  // The panel names the page and where it lives.
  expect(document.querySelector(".ed-title")?.textContent).toBe("Winter series/winter-series, not published yet");
  fireEvent.click(screen.getByRole("button", { name: "Title and address" }));
  fireEvent.click(screen.getByRole("button", { name: "Search results" }));
  expect(describedText(screen.getByRole("button", { name: "Title and address" }))).toBe("Winter series, /winter-series");
  expect(describedText(screen.getByRole("button", { name: "Search results" }))).toBe("Short, cold swims from November to March.");
  expect(kit.ui.getState().openGroups).toEqual({ page: { title: false, search: false } });
});

test("a page not published yet shows the address it will have on the CMS, as the design does", () => {
  const kit = editorKit({ document: page(), session: { current, cmsOrigin: "http://127.0.0.1:3900" } });
  kit.render(<PagePanel />);
  expect(describedText(screen.getByLabelText("Address"))).toBe("127.0.0.1:3900/winter-series");
});

test("the address goes through the adapter, and its refusal shows on the Address field", async () => {
  const asked: string[] = [];
  const kit = editorKit({
    document: page(),
    session: {
      current,
      setSlug: async (slug) => {
        asked.push(slug);
        return [{ pointer: "/slug", keyword: "taken", blockPointer: null, message: "is already the address of another page" }];
      },
    },
  });
  kit.render(<PagePanel />);
  const address = screen.getByLabelText("Address");
  fireEvent.change(address, { target: { value: "/notices" } });
  fireEvent.keyDown(address, { key: "Enter" });
  await waitFor(() => expect(address.getAttribute("aria-invalid")).toBe("true"));
  expect(asked).toEqual(["notices"]);
  expect(describedText(address)).toContain("is already the address of another page");
  // The address is the page's, not the document's: no command was made.
  expect(kit.store.getState().past).toHaveLength(0);
});

test("the server's 422 on the title opens its group, closed before, and shows on the Title field", () => {
  const kit = editorKit({ document: page(), session: { current } });
  kit.ui.getState().setGroupOpen("page", "title", false);
  kit.render(<PagePanel />);
  expect(screen.queryByLabelText("Title")).toBeNull();
  act(() => kit.ui.getState().setServerErrors(errorsByBlock(kit.doc(), [{ pointer: "/document/title", keyword: "maxLength", blockPointer: null, message: "is longer than 120 characters" }])));
  const title = screen.getByLabelText("Title");
  expect(title.getAttribute("aria-invalid")).toBe("true");
  expect(describedText(title)).toContain("Up to 120 characters.");
});

const published = (slug: string) => ({ slug, versionNumber: 2, draftRevision: 3, publishedAt: "2026-10-02T08:00:00.000Z" });
// A storage that keeps a publish and serves nothing, with no CMS: the
// browser demo's.
const demo = { cmsOrigin: null, capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: false, collections: false, shop: false } };

test("where the storage serves pages, the Address says where visitors find the page, and where the old address leads", () => {
  for (const [open, hint] of [
    [{ ...current, home: true, published: published("home") }, "This is the home page: visitors find it at the site’s root address, /."],
    [{ ...current, published: published("winter-series") }, "Visitors find the page at /winter-series."],
    [{ ...current, published: published("old-name") }, "Live at /old-name; the next publish moves it to /winter-series, and the old address leads to the new one."],
  ] as const) {
    const kit = editorKit({ document: page(), session: { current: open } });
    kit.render(<PagePanel />);
    expect(describedText(screen.getByLabelText("Address")), hint).toBe(hint);
    cleanup();
  }
  const kit = editorKit({ document: page(), session: { current: { ...current, home: true } } });
  kit.render(<PagePanel />);
  expect(document.querySelector(".ed-title")?.textContent).toBe("Winter seriesThe home page, the first one visitors see");
  expect(describedText(screen.getByLabelText("Description"))).toBe("Search engines show it under the title. Up to 160 characters.");
});

test("where the storage serves no page (the browser demo), the Page panel promises no address, no redirect and no search result", () => {
  for (const [open, hint] of [
    [{ ...current, home: true, published: published("home") }, "This is the home page. In the full system, visitors find it at the site’s root address, /."],
    [current, "In the full system, the page will be at /winter-series once it is published."],
    [{ ...current, published: published("winter-series") }, "Published in this browser as /winter-series."],
    [{ ...current, published: published("old-name") }, "Published in this browser as /old-name; the next publish uses /winter-series."],
  ] as const) {
    const kit = editorKit({ document: page(), session: { current: open, ...demo } });
    kit.render(<PagePanel />);
    expect(describedText(screen.getByLabelText("Address")), hint).toBe(hint);
    expect(describedText(screen.getByLabelText("Address"))).not.toMatch(/visitors find the page|Live at|leads to the new one/);
    cleanup();
  }
  const kit = editorKit({ document: page(), session: { current: { ...current, home: true }, ...demo } });
  kit.render(<PagePanel />);
  expect(document.querySelector(".ed-title")?.textContent).toBe("Winter seriesThe home page of the site");
  expect(describedText(screen.getByLabelText("Title"))).toBe("Shown in the browser tab and, in the full system, in search results.");
  expect(describedText(screen.getByLabelText("Description"))).toBe("In the full system, search engines show it under the title. Up to 160 characters.");
});

// A page neither the header nor the footer links to says so under its
// address, with the way to add it to the header's menu.
const prices = { ...current, id: 8, slug: "prices" };
const headerPart = { id: 50, kind: "header", title: "Header", slug: null, home: false, revision: 4, updatedAt: "2026-10-13T08:00:00.000Z", published: null, scheduled: null, links: { preview: "/preview/50", live: null } } as never;
const withLinks = (doc: PageDocument, hrefs: string[]): PageDocument => {
  const copy = structuredClone(doc);
  const walk = (blocks: Array<{ type: string; props: Record<string, unknown>; children: unknown[] }>) => blocks.forEach((block) => {
    if (block.type === "menu") block.props.items = hrefs.map((href, at) => ({ label: `Link ${at + 1}`, href }));
    walk(block.children as never);
  });
  walk(copy.sections as never);
  return copy;
};
const header = headerStarter as unknown as PageDocument;
const footer = footerStarter as unknown as PageDocument;

test("a page neither the header nor the footer links to says so under its address; a link to it, or to one of its sections, and the home page say nothing", () => {
  const kit = editorKit({ document: page(), session: { current: prices, parts: [headerPart] } });
  kit.render(<PagePanel />);
  const note = () => document.querySelector(".not-linked");
  // The header and footer not read yet: nothing is known of their links.
  expect(note()).toBeNull();
  act(() => kit.ui.getState().setParts({ header: withLinks(header, ["/#swims", "/winter-series"]), footer: withLinks(footer, ["/notices"]) }));
  expect(note()?.textContent).toBe("Neither the header nor the footer links to this page: visitors reach it only from a link on another page, or by its address.Add it to the header’s menu");
  act(() => kit.ui.getState().setParts({ footer: withLinks(footer, ["/notices", "/prices#rates"]) }));
  expect(note()).toBeNull();
  cleanup();

  const home = editorKit({ document: page(), session: { current: { ...current, home: true }, parts: [headerPart] } });
  home.ui.getState().setParts({ header: withLinks(header, ["/#swims"]), footer: withLinks(footer, []) });
  home.render(<PagePanel />);
  expect(note()).toBeNull();
});

test("Add it to the header's menu opens the header and adds the page at the end of its menu, the menu selected, and says the header waits to be published", async () => {
  const opened: number[] = [];
  const kit: ReturnType<typeof editorKit> = editorKit({
    document: page(),
    session: {
      current: prices,
      parts: [headerPart],
      openPage: async (id: number) => {
        opened.push(id);
        kit.store.getState().load(withLinks(header, ["/#swims", "/winter-series"]));
        return null;
      },
      isOpen: (id: number) => opened.at(-1) === id,
    },
  });
  kit.ui.getState().setParts({ header: withLinks(header, ["/#swims", "/winter-series"]), footer: withLinks(footer, ["/notices"]) });
  kit.render(<PagePanel />);
  fireEvent.click(screen.getByRole("button", { name: "Add it to the header’s menu" }));
  await waitFor(() => expect(kit.store.getState().selection).toBe("header-menu"));
  expect(opened).toEqual([50]);
  const menu = kit.block("header-menu") as { props: { items: Array<{ label: string; href: string }> } };
  expect(menu.props.items).toEqual([
    { label: "Link 1", href: "/#swims" },
    { label: "Link 2", href: "/winter-series" },
    { label: "Winter series", href: "/prices" },
  ]);
  expect(kit.ui.getState().notice).toBe("Winter series is the last link of the header’s menu now. Publish the header to put it on every page.");
});

test("Add it to the header's menu adds nothing when another page opened while the header was on its way", async () => {
  const kit = editorKit({
    document: page(),
    session: {
      current: prices,
      parts: [headerPart],
      // The header's open, overtaken by another the person chose: it
      // resolves with null, and the header is not the page open.
      openPage: async () => null,
      isOpen: () => false,
    },
  });
  kit.ui.getState().setParts({ header: withLinks(header, ["/#swims"]), footer: withLinks(footer, ["/notices"]) });
  const before = kit.store.getState().document;
  kit.render(<PagePanel />);
  fireEvent.click(screen.getByRole("button", { name: "Add it to the header’s menu" }));
  await act(async () => {});
  expect(kit.store.getState().document).toBe(before);
  expect(kit.store.getState().selection).not.toBe("header-menu");
});
