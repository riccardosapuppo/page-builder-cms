// The shell on a storage adapter of the test's own: it opens the page the
// address names (else the home page), its edits reach the adapter through
// the autosave on the injected clock, a save the server refuses with a 422
// puts each error on its block's field, and a new page is made and opened.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { page } from "../../test/document-page.ts";
import { describedText } from "../../test/editor-kit.tsx";
import { FakeClock } from "../../test/fake-clock.ts";
import { counter } from "../../test/document-page.ts";
import type { PageDocument } from "../shared/document.ts";
import type { DraftSave, FieldError, Page, PageSummary, StorageAdapter } from "../storage/adapter.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { App, NO_PAGE, type PageAddress } from "./App.tsx";
import { createUiStore } from "./ui-store.ts";

const T = "2026-10-02T08:00:00.000Z";
const links = (id: number) => ({ self: `/api/pages/${id}`, draft: `/api/pages/${id}/draft`, versions: `/api/pages/${id}/versions`, publish: `/api/pages/${id}/publish`, preview: `/preview/${id}`, live: null });

// The CMS as the adapter's caller sees it: pages with drafts, saves taken
// at the draft's revision, and a 422 when the test asks for one.
class FakeSite {
  readonly drafts = new Map<number, { title: string; slug: string; home: boolean; revision: number; document: PageDocument }>();
  readonly saves: DraftSave[] = [];
  refuseNext: FieldError[] | null = null;

  constructor() {
    this.drafts.set(1, { title: "Winter series", slug: "winter-series", home: false, revision: 3, document: page() });
    this.drafts.set(2, { title: "Home", slug: "home", home: true, revision: 1, document: { schemaVersion: 1, title: "Home", sections: [] } });
  }

  summary(id: number): PageSummary {
    const d = this.drafts.get(id)!;
    return { id, title: d.title, slug: d.slug, home: d.home, revision: d.revision, updatedAt: T, published: null, links: links(id) };
  }

  page(id: number): Page {
    const d = this.drafts.get(id)!;
    return { page: { id, title: d.title, slug: d.slug, home: d.home, createdAt: T }, draft: { revision: d.revision, lastSaveId: null, updatedAt: T, document: structuredClone(d.document) }, published: null, links: links(id) };
  }

  adapter(): StorageAdapter {
    const partial: Partial<StorageAdapter> = {
      name: "fake",
      capabilities: { publish: true, schedule: false, responses: false },
      listPages: async () => [...this.drafts.keys()].map((id) => this.summary(id)),
      getPage: async (id) => this.page(id),
      getDraft: async (id) => this.page(id).draft,
      listMedia: async () => [],
      getSiteStyle: async () => ({ palette: {}, typeScale: "balanced", updatedAt: null, choices: { palette: {}, typeScales: [] } }),
      saveDraft: async (id, save) => {
        this.saves.push(save);
        if (this.refuseNext) {
          const errors = this.refuseNext;
          this.refuseNext = null;
          return { ok: false, problem: { kind: "invalid", code: "invalid_document", message: "The document is not valid.", errors } };
        }
        const d = this.drafts.get(id)!;
        d.revision += 1;
        d.document = save.document;
        return { ok: true, value: { revision: d.revision, lastSaveId: save.saveId, updatedAt: T } };
      },
      createPage: async (request) => {
        if (request.slug === "winter-series") return { ok: false, problem: { kind: "invalid", code: "invalid_request", message: "invalid", errors: [{ pointer: "/slug", keyword: "taken", blockPointer: null, message: "is already the address of another page" }] } };
        const id = this.drafts.size + 1;
        this.drafts.set(id, { title: request.title, slug: request.slug, home: false, revision: 0, document: { schemaVersion: 1, title: request.title, sections: [] } });
        return { ok: true, value: this.page(id) };
      },
    };
    return partial as StorageAdapter;
  }
}

function start(wanted: number | null) {
  const clock = new FakeClock(Date.UTC(2026, 9, 2, 9));
  const env = { store: createEditorStore({ document: NO_PAGE, now: () => clock.now() }), ui: createUiStore(), clock, newId: counter("n") };
  const site = new FakeSite();
  const written: number[] = [];
  const address: PageAddress = { read: () => wanted, write: (id) => written.push(id) };
  render(<App env={env} adapter={site.adapter()} address={address} />);
  return { env, site, clock, written };
}

test("the shell opens the page the address names, and its edits reach the adapter through the autosave", async () => {
  const { env, site, clock, written } = start(1);
  await screen.findByRole("tree", { name: "Navigator" });
  expect(screen.getByRole("button", { name: "Switch page. Open: Winter series" })).toBeTruthy();
  expect(written).toEqual([1]);

  fireEvent.click(within(screen.getByRole("tree")).getByText("Hero"));
  fireEvent.click(screen.getByRole("tab", { name: "Advanced" }));
  const label = screen.getByLabelText("Section label");
  fireEvent.change(label, { target: { value: "Winter" } });
  fireEvent.blur(label);
  expect(env.store.getState().document.sections[0]!.props.label).toBe("Winter");
  expect(site.saves).toHaveLength(0);
  await act(() => clock.advance(1_000));
  expect(site.saves).toHaveLength(1);
  expect(site.saves[0]).toMatchObject({ revision: 3 });
  expect(site.saves[0]!.document.sections[0]!.props.label).toBe("Winter");
  await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === "Saved")).toBe(true));
});

test("without an address the home page opens", async () => {
  const { written } = start(null);
  await screen.findByRole("button", { name: "Switch page. Open: Home" });
  expect(written).toEqual([2]);
  expect(screen.getByRole("heading", { name: "Start this page with a section" })).toBeTruthy();
});

test("a save refused with a 422 puts the error on the block's field, and the next edit clears it", async () => {
  const { env, site, clock } = start(1);
  await screen.findByRole("tree", { name: "Navigator" });
  site.refuseNext = [{
    pointer: "/document/sections/0/children/0/children/2/props/href",
    keyword: "pattern",
    blockPointer: "/document/sections/0/children/0/children/2",
    message: "does not match the pattern",
  }];
  act(() => env.store.getState().select("b1"));
  const text = screen.getByRole("textbox", { name: "Text" });
  fireEvent.change(text, { target: { value: "Join us" } });
  fireEvent.blur(text);
  await act(() => clock.advance(1_000));
  expect(site.saves).toHaveLength(1);

  // The server named the button's link: the error is on the Link field and
  // on the button's navigator row, and the save state says so.
  const link = await screen.findByLabelText("Link");
  await waitFor(() => expect(link.getAttribute("aria-invalid")).toBe("true"));
  expect(describedText(link)).toContain("Use a full address (https://…)");
  expect(screen.getByRole("textbox", { name: "Text" }).getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByRole("treeitem", { name: "Button: Join us, refused by the server" })).toBeTruthy();
  expect(screen.getAllByRole("status").some((s) => s.textContent === "Not saved: a value was refused")).toBe(true);

  // A new edit is a new attempt: the errors go with the answer to it.
  fireEvent.change(link, { target: { value: "/join-us" } });
  fireEvent.blur(link);
  await act(() => clock.advance(1_000));
  expect(site.saves).toHaveLength(2);
  await waitFor(() => expect(screen.getByLabelText("Link").getAttribute("aria-invalid")).toBeNull());
  expect(env.ui.getState().serverErrors).toEqual([]);
});

test("a new page is made, its address offered from its title, and opened; a taken address is said on its field", async () => {
  const { env, written } = start(1);
  await screen.findByRole("tree", { name: "Navigator" });
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Winter series" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "New page…" }));
  const dialog = screen.getByRole("dialog", { name: "New page" });
  fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Winter Series" } });
  expect((within(dialog).getByLabelText("Address") as HTMLInputElement).value).toBe("winter-series");
  fireEvent.click(within(dialog).getByRole("button", { name: "Create page" }));
  const address = within(dialog).getByLabelText("Address");
  await waitFor(() => expect(address.getAttribute("aria-invalid")).toBe("true"));
  expect(describedText(address)).toContain("is already the address of another page");

  fireEvent.change(address, { target: { value: "spring-series" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Create page" }));
  await screen.findByRole("button", { name: "Switch page. Open: Winter Series" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(written).toEqual([1, 3]);
  expect(env.store.getState().document).toEqual({ schemaVersion: 1, title: "Winter Series", sections: [] });
  expect(screen.getByText("/spring-series")).toBeTruthy();
});
