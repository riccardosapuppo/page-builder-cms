// The top bar: whether the page is live and how many of its saved changes
// are not (the draft's revision against the one the live version came
// from); the device previewed; the page switch, a menu of the site's pages.
// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { PageSummary, Published } from "../storage/adapter.ts";
import type { OpenPage } from "./session.tsx";
import { TopBar } from "./TopBar.tsx";

const live: Published = { slug: "winter-series", versionNumber: 4, draftRevision: 3, publishedAt: "2026-09-28T07:02:00.000Z" };
const open = (changes: Partial<OpenPage>): OpenPage => ({ id: 1, slug: "winter-series", home: false, published: live, revision: 3, ...changes });
const chip = () => document.querySelector(".chip")?.textContent;

test("the chip counts the saves visitors do not see yet", () => {
  for (const [current, said] of [
    [open({ published: null }), "Not published yet"],
    [open({}), "Published"],
    [open({ revision: 4 }), "Published, 1 change not live"],
    [open({ revision: 9 }), "Published, 6 changes not live"],
    [open({ slug: "winter" }), "Published, new address not live"],
  ] as const) {
    const kit = editorKit({ document: page(), session: { current } });
    const { unmount } = kit.render(<TopBar />);
    expect(chip()).toBe(said);
    unmount();
  }
});

test("the device buttons set the width the canvas previews, one pressed at a time", () => {
  const kit = editorKit({ document: page(), session: { current: open({}) } });
  kit.render(<TopBar />);
  const pressed = () => screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent);
  expect(pressed()).toEqual(["Desktop"]);
  fireEvent.click(screen.getByRole("button", { name: "Tablet" }));
  expect(kit.ui.getState().preview).toBe("tablet");
  expect(pressed()).toEqual(["Tablet"]);
  expect(screen.getByRole("button", { name: "Phone" }).getAttribute("title")).toBe("Phone: the canvas at 390 wide");
});

test("the page switch lists the site's pages and opens the one chosen", async () => {
  const opened: number[] = [];
  const summary = (id: number, title: string, slug: string, home: boolean): PageSummary => ({
    id, title, slug, home, revision: 1, updatedAt: "2026-10-02T08:00:00.000Z", published: null,
    links: { self: "", draft: "", versions: "", publish: "", preview: "", live: null },
  });
  const kit = editorKit({
    document: page(),
    session: {
      current: open({}),
      pages: [summary(2, "Slack Water", "home", true), summary(1, "Winter series", "winter-series", false)],
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
  const items = screen.getAllByRole("menuitem");
  expect(items.map((i) => i.textContent)).toEqual(["Slack Water/, the home page, not published yet", "Winter series/winter-series, not published yet", "New page…"]);
  expect(items[1]!.getAttribute("aria-current")).toBe("page");
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
  expect(document.activeElement).toBe(items[1]);
  fireEvent.keyDown(items[1]!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(button);

  fireEvent.click(button);
  await act(async () => {
    fireEvent.click(screen.getByRole("menuitem", { name: /^Slack Water/ }));
  });
  expect(opened).toEqual([2]);
});
