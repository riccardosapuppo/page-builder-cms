// The shell on a storage adapter of the test's own: it opens the page the
// address names (else the home page), its edits reach the adapter through
// the autosave on the injected clock, a save the server refuses with a 422
// puts each error on its block's field, and a new page is made and opened.
// Publishing saves what waits first and publishes at that revision; the
// preview opens on the CMS once the edits are sent; a conflict is settled
// by Reload or Keep mine; the site style shows at once and goes to the CMS,
// and comes back when the CMS refuses it.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { page } from "../../test/document-page.ts";
import { describedText } from "../../test/editor-kit.tsx";
import { FakeClock } from "../../test/fake-clock.ts";
import { counter } from "../../test/document-page.ts";
import tokens from "../../../schema/tokens.json";
import type { PageDocument } from "../shared/document.ts";
import type { DraftSave, FieldError, Page, PageSummary, Published, SiteStyle, SiteStyleChange, StorageAdapter } from "../storage/adapter.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { App, NO_PAGE, type PageAddress, type TabOpener } from "./App.tsx";
import { createUiStore } from "./ui-store.ts";

const T = "2026-10-02T08:00:00.000Z";
const links = (id: number) => ({ self: `/api/pages/${id}`, draft: `/api/pages/${id}/draft`, versions: `/api/pages/${id}/versions`, publish: `/api/pages/${id}/publish`, preview: `/preview/${id}`, live: null });

// The site style as the CMS answers it, from the tokens.
function tokenStyle(palette: Record<string, string> = {}): SiteStyle {
  const tones = tokens["site-tones"];
  const colors: Record<string, string> = tokens.color;
  const slots = ["text", "background", "primary", "accent", "soft", "muted"] as const;
  return {
    palette: Object.fromEntries(slots.map((slot) => [slot, palette[slot] ?? tones[slot].default])),
    typeScale: "balanced",
    updatedAt: null,
    choices: {
      palette: Object.fromEntries(slots.map((slot) => [slot, tones[slot].tones.map((t) => ({ color: t.color, label: t.label, hex: colors[t.color]! }))])),
      typeScales: tokens["site-type-scale"].choices.map((c) => ({ name: c.name, label: c.label })),
    },
  };
}

// The CMS as the adapter's caller sees it: pages with drafts, saves taken
// at the draft's revision (another tab's save makes the next one a
// conflict), publishing at a revision, the site style, and a 422 when the
// test asks for one.
class FakeSite {
  readonly drafts = new Map<number, { title: string; slug: string; home: boolean; revision: number; document: PageDocument; published: Published | null }>();
  readonly saves: DraftSave[] = [];
  readonly publishes: Array<{ id: number; revision: number | undefined }> = [];
  readonly styles: SiteStyleChange[] = [];
  refuseNext: FieldError[] | null = null;
  refuseStyle = false;
  style = tokenStyle();

  constructor() {
    this.drafts.set(1, { title: "Winter series", slug: "winter-series", home: false, revision: 3, document: page(), published: null });
    this.drafts.set(2, { title: "Home", slug: "home", home: true, revision: 1, document: { schemaVersion: 1, title: "Home", sections: [] }, published: null });
  }

  links(id: number) {
    const d = this.drafts.get(id)!;
    return { ...links(id), live: d.published ? (d.home ? "/" : `/${d.published.slug}`) : null };
  }

  summary(id: number): PageSummary {
    const d = this.drafts.get(id)!;
    return { id, title: d.title, slug: d.slug, home: d.home, revision: d.revision, updatedAt: T, published: d.published, links: this.links(id) };
  }

  page(id: number): Page {
    const d = this.drafts.get(id)!;
    return { page: { id, title: d.title, slug: d.slug, home: d.home, createdAt: T }, draft: { revision: d.revision, lastSaveId: null, updatedAt: T, document: structuredClone(d.document) }, published: d.published, links: this.links(id) };
  }

  // Another tab saves the page.
  savedElsewhere(id: number, document: PageDocument): void {
    const d = this.drafts.get(id)!;
    d.revision += 1;
    d.document = document;
  }

  adapter(): StorageAdapter {
    const partial: Partial<StorageAdapter> = {
      name: "fake",
      capabilities: { publish: true, schedule: false, responses: false },
      listPages: async () => [...this.drafts.keys()].map((id) => this.summary(id)),
      getPage: async (id) => this.page(id),
      getDraft: async (id) => this.page(id).draft,
      listMedia: async () => [],
      getSiteStyle: async () => this.style,
      setSiteStyle: async (change) => {
        this.styles.push(change);
        if (this.refuseStyle) return { ok: false, problem: { kind: "invalid", code: "invalid_request", message: "invalid", errors: [{ pointer: "/palette/primary", keyword: "inclusion", blockPointer: null, message: "must be one of the slot's tones" }] } };
        this.style = { ...this.style, ...change, updatedAt: T };
        return { ok: true, value: this.style };
      },
      publish: async (id, request = {}) => {
        this.publishes.push({ id, revision: request.revision });
        const d = this.drafts.get(id)!;
        if (request.revision !== undefined && request.revision !== d.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: d.revision, lastSaveId: null } };
        d.published = { slug: d.slug, versionNumber: 1, draftRevision: d.revision, publishedAt: T };
        return { ok: true, value: { published: d.published, version: { number: 1, reason: "publish", name: null, restoredFrom: null, createdAt: T, published: true }, links: this.links(id) } };
      },
      saveDraft: async (id, save) => {
        this.saves.push(save);
        if (this.refuseNext) {
          const errors = this.refuseNext;
          this.refuseNext = null;
          return { ok: false, problem: { kind: "invalid", code: "invalid_document", message: "The document is not valid.", errors } };
        }
        const d = this.drafts.get(id)!;
        if (save.revision !== d.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: d.revision, lastSaveId: null } };
        d.revision += 1;
        d.document = save.document;
        return { ok: true, value: { revision: d.revision, lastSaveId: save.saveId, updatedAt: T } };
      },
      createPage: async (request) => {
        if (request.slug === "winter-series") return { ok: false, problem: { kind: "invalid", code: "invalid_request", message: "invalid", errors: [{ pointer: "/slug", keyword: "taken", blockPointer: null, message: "is already the address of another page" }] } };
        const id = this.drafts.size + 1;
        this.drafts.set(id, { title: request.title, slug: request.slug, home: false, revision: 0, document: { schemaVersion: 1, title: request.title, sections: [] }, published: null });
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
  // The tabs the editor opens: where each went, once it was told.
  const tabs: Array<Promise<string>> = [];
  const opener: TabOpener = { open: (href) => (tabs.push(href), true) };
  render(<App env={env} adapter={site.adapter()} address={address} cmsOrigin="http://127.0.0.1:3900" tabs={opener} />);
  return { env, site, clock, written, tabs };
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

// An edit the shell's autosave has not sent yet: the first section's label.
function relabel(label: string) {
  fireEvent.click(within(screen.getByRole("tree")).getAllByRole("treeitem")[0]!.querySelector(".t-row")!);
  fireEvent.click(screen.getByRole("tab", { name: "Advanced" }));
  const field = screen.getByLabelText("Section label");
  fireEvent.change(field, { target: { value: label } });
  fireEvent.blur(field);
}

test("Publish sends the edit still waiting, then publishes at the revision it made, and links to the live page", async () => {
  const { site, env } = start(1);
  await screen.findByRole("tree", { name: "Navigator" });
  expect(document.querySelector(".chip")?.textContent).toBe("Not published yet");
  relabel("Winter");
  expect(site.saves).toHaveLength(0);

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  // No debounce waited for: the save went first, and the publish named the
  // revision that save made.
  expect(site.saves).toHaveLength(1);
  expect(site.publishes).toEqual([{ id: 1, revision: 4 }]);
  await waitFor(() => expect(document.querySelector(".chip")?.textContent).toBe("Published"));
  expect(env.ui.getState().notice).toBe("Published: visitors see this page at 127.0.0.1:3900/winter-series.");
  const live = screen.getByRole("link", { name: "View live page" });
  expect(live.getAttribute("href")).toBe("http://127.0.0.1:3900/winter-series");

  // A save from elsewhere after this tab's last one: the CMS refuses the
  // publish, and nothing went live unseen.
  site.savedElsewhere(1, page());
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(site.publishes.at(-1)).toEqual({ id: 1, revision: 4 });
  expect(env.ui.getState().notice).toBe("Not published: the page was saved somewhere else after this tab's last save. Nothing went live.");
});

test("Preview opens a tab at once, and sends it to the CMS's preview once the edit waiting is saved", async () => {
  const { site, tabs } = start(1);
  await screen.findByRole("tree", { name: "Navigator" });
  relabel("Spring");
  fireEvent.click(screen.getByRole("link", { name: "Preview" }));
  expect(tabs).toHaveLength(1);
  expect(await tabs[0]).toBe("http://127.0.0.1:3900/preview/1");
  expect(site.saves).toHaveLength(1);
  expect(site.drafts.get(1)!.document.sections[0]!.props.label).toBe("Spring");
});

test("a conflict stops saving until the person chooses: Reload takes the server's page, Keep mine saves this one over it", async () => {
  const { site, env, clock } = start(1);
  await screen.findByRole("tree", { name: "Navigator" });
  const theirs = page();
  theirs.sections[0]!.props.label = "Theirs";
  site.savedElsewhere(1, theirs);
  relabel("Mine");
  await act(() => clock.advance(1_000));
  const banner = await screen.findByRole("alert");
  expect(banner.textContent).toContain("Changed in another tab.");
  expect(screen.getByRole("button", { name: "Publish" }).getAttribute("aria-disabled")).toBe("true");

  await act(async () => fireEvent.click(within(banner).getByRole("button", { name: "Reload" })));
  expect(env.store.getState().document.sections[0]!.props.label).toBe("Theirs");
  expect(screen.queryByRole("alert")).toBeNull();
  // Taking the server's page is not an edit: nothing is sent back.
  const sent = site.saves.length;
  await act(() => clock.advance(10_000));
  expect(site.saves).toHaveLength(sent);

  // Again, and this time this tab's page wins.
  site.savedElsewhere(1, theirs);
  relabel("Mine again");
  await act(() => clock.advance(1_000));
  await act(async () => fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Keep mine" })));
  await waitFor(() => expect(site.drafts.get(1)!.document.sections[0]!.props.label).toBe("Mine again"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(site.saves.at(-1)!.revision).toBe(site.drafts.get(1)!.revision - 1);
});

test("a site style change shows on the canvas at once and goes to the CMS; refused, the canvas goes back", async () => {
  const { site, env } = start(1);
  await screen.findByRole("tree", { name: "Navigator" });
  const root = () => document.querySelector(".canvas .site")!;
  fireEvent.click(screen.getByRole("button", { name: "Site style" }));
  fireEvent.click(screen.getByRole("button", { name: /^Primary/ }));
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Harbour" })));
  expect(root().getAttribute("data-primary")).toBe("site-harbour");
  expect(site.styles.map((s) => s.palette.primary)).toEqual(["site-harbour"]);
  await waitFor(() => expect(document.querySelector(".style-save")?.textContent).toBe("Saved for every page"));

  site.refuseStyle = true;
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Kelp" })));
  await waitFor(() => expect(root().getAttribute("data-primary")).toBe("site-harbour"));
  expect(screen.getByRole("alert").textContent).toBe("Not saved, the site keeps its style as it was: must be one of the slot's tones");
  expect(env.ui.getState().siteStyle?.palette.primary).toBe("site-harbour");
});
