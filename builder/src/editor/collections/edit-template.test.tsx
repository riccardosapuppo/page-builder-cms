// @vitest-environment jsdom
// Edit the template (./edit-template.ts), the one way to a collection's
// template: it closes Collections, opens the template as a page is opened
// and says why when it could not; a template open already stays as it is;
// asked from an entry, the canvas draws the template with that entry. And
// every way to a template goes through it, watched here as each one calls
// it: the page switch's Templates, the collection's head, its settings,
// an entry's form and a Collection list's panel.
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { NEWS, openScreen, press } from "../../../test/collections-kit.tsx";
import { page } from "../../../test/document-page.ts";
import { editorKit } from "../../../test/editor-kit.tsx";
import { FakeCollections } from "../../../test/fake-collections.ts";
import { newsCollection, siteOf } from "../../../test/site-entries.ts";
import type { PageDocument } from "../../shared/document.ts";
import { BlockPanel } from "../panels/EditPanel.tsx";
import { emptySession, type OpenPage } from "../session.tsx";
import { TopBar } from "../TopBar.tsx";
import { createUiStore } from "../ui-store.ts";
import { editTemplate } from "./edit-template.ts";

// Each call, by the collection, its template and the entry asked from.
const watched = vi.hoisted(() => ({ calls: [] as Array<{ collection: number; template: number; entry: number | null }> }));
vi.mock("./edit-template.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("./edit-template.ts")>();
  return {
    ...original,
    editTemplate: (...args: Parameters<typeof original.editTemplate>) => {
      const [, collection, entry] = args;
      watched.calls.push({ collection: collection.id, template: collection.template.id, entry: entry?.id ?? null });
      original.editTemplate(...args);
    },
  };
});

const KEEPS = { ...emptySession().capabilities, collections: true };
const AT_PAGE: OpenPage = { id: 7, kind: "page", slug: "news", home: false, published: null, revision: 1, links: { preview: "/preview/7", live: null } };

test("it closes Collections, opens the template as a page is opened, and says why when it could not", async () => {
  const ui = createUiStore();
  ui.getState().setCollections({ collectionId: 3, tab: "settings" });
  const asked: number[] = [];
  const session = { openPage: async (id: number) => (asked.push(id), "This page has changes the server has not saved yet: it stays open until they are saved."), isOpen: () => false };
  editTemplate({ ui, session }, newsCollection());
  expect(ui.getState().collections).toBeNull();
  expect(asked).toEqual([90]);
  await vi.waitFor(() => expect(ui.getState().notice).toBe("This page has changes the server has not saved yet: it stays open until they are saved."));
  expect(ui.getState().previewEntry).toBeNull();
});

test("a template open already is left as it is, Collections closing; asked from an entry, the canvas draws the template with that entry", () => {
  const ui = createUiStore();
  ui.getState().setCollections({ collectionId: 3 });
  const asked: number[] = [];
  const session = { openPage: async (id: number) => (asked.push(id), null), isOpen: (id: number) => id === 90 };
  editTemplate({ ui, session }, newsCollection(), { id: 7 });
  expect(asked).toEqual([]);
  expect(ui.getState().collections).toBeNull();
  expect(ui.getState().previewEntry).toEqual({ collectionId: 3, choice: 7 });
});

test("every way to a template goes through it: the page switch's Templates, the collection's head, its settings, an entry's form, a Collection list's panel", async () => {
  // The page switch.
  watched.calls.length = 0;
  const switching = editorKit({ document: page(), session: { current: AT_PAGE, capabilities: KEEPS } });
  switching.ui.getState().setSiteEntries(siteOf(newsCollection(), []));
  switching.render(<TopBar />);
  fireEvent.click(screen.getByRole("button", { name: /^Switch page\. Open:/ }));
  await act(async () => fireEvent.click(within(screen.getByRole("list", { name: "Templates" })).getByRole("button", { name: /^News/ })));
  expect(watched.calls).toEqual([{ collection: 3, template: 90, entry: null }]);
  cleanup();

  // The Collections screen: the collection's head, its settings, an
  // entry's form, which asks for that entry.
  const fake = new FakeCollections();
  const news = fake.add(NEWS);
  const entry = fake.addEntry(news.id, { title: "First swim", slug: "first-swim", values: {} });
  for (const way of ["head", "settings", "entry"] as const) {
    watched.calls.length = 0;
    const { dialog } = await openScreen(fake);
    if (way === "head") await press(within(dialog).getByRole("button", { name: "Edit the template of News" }));
    if (way === "settings") {
      await press(within(dialog).getByRole("tab", { name: "Settings" }));
      await press(within(dialog).getByRole("button", { name: "Edit the template" }));
    }
    if (way === "entry") {
      await press(await within(dialog).findByRole("button", { name: "Edit First swim" }));
      await press(within(await within(dialog).findByRole("region", { name: "First swim" })).getByRole("button", { name: "Edit the template" }));
    }
    expect(watched.calls, way).toEqual([{ collection: news.id, template: news.template.id, entry: way === "entry" ? entry.id : null }]);
    cleanup();
  }

  // A Collection list's panel.
  watched.calls.length = 0;
  const list = { id: "list", type: "collectionList", props: { collection: 3, count: 3, order: { by: "day", direction: "desc" }, layout: "grid", columns: 3, linkLabel: "Read more", emptyText: "Nothing yet." }, children: [], style: { base: {} } };
  const listPage = { schemaVersion: 1, title: "News", sections: [{ id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: [list] }] }] } as unknown as PageDocument;
  const listing = editorKit({ document: listPage, selection: "list", session: { current: AT_PAGE, capabilities: KEEPS } });
  listing.ui.getState().setSiteEntries(siteOf(newsCollection(), []));
  listing.render(<BlockPanel id="list" />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Edit the template of News" })));
  expect(watched.calls).toEqual([{ collection: 3, template: 90, entry: null }]);
});
