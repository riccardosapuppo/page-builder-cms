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
const demo = { cmsOrigin: null, capabilities: { publish: true, schedule: false, responses: false, imageVariants: false, livePages: false } };

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
