// The shell on a storage adapter of the test's own: it opens the page the
// address names (else the home page), its edits reach the adapter through
// the autosave on the injected clock, a save the server refuses with a 422
// puts each error on its block's field, and a new page is made and opened.
// Publishing saves what waits first and publishes at that revision; the
// preview opens on the CMS once the edits are sent; a conflict is settled
// by Reload or Keep mine; the site style shows at once and goes to the CMS,
// and comes back when the CMS refuses it. The site's header and footer
// open as pages do, the page left drawn dimmed around them, and are saved
// and published as pages are; their drafts are what the canvas draws
// around every page. An editor that cannot start says why, with the one
// button that can help.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { page } from "../../test/document-page.ts";
import { describedText, openGroups } from "../../test/editor-kit.tsx";
import { FakeClock } from "../../test/fake-clock.ts";
import { counter } from "../../test/document-page.ts";
import tokens from "../../../schema/tokens.json";
import type { PageDocument } from "../shared/document.ts";
import { SITE_THEME } from "virtual:site-theme";
import { StorageError, type DraftSave, type FieldError, type Page, type PageKind, type PageSummary, type Published, type Schedule, type ScheduleRequest, type SiteStyle, type SiteStyleChange, type StorageAdapter } from "../storage/adapter.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { App, NO_PAGE, type PageAddress, type TabOpener } from "./App.tsx";
import { thisTab } from "./SaveStatus.tsx";
import { createUiStore } from "./ui-store.ts";

const T = "2026-10-02T08:00:00.000Z";
// The site's header and footer, by their ids.
const HEADER = 101;
const FOOTER = 102;
const links =(id: number) => ({ self: `/api/pages/${id}`, draft: `/api/pages/${id}/draft`, versions: `/api/pages/${id}/versions`, publish: `/api/pages/${id}/publish`, schedules: `/api/pages/${id}/schedules`, preview: `/preview/${id}`, live: null });

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

// The CMS as the adapter's caller sees it: pages with drafts, and the
// site's header and footer beside them, each with its starter as its draft
// and nothing live; saves taken at the draft's revision (another tab's save
// makes the next one a conflict), publishing at a revision, the site style,
// and a 422 when the test asks for one.
class FakeSite {
  readonly drafts = new Map<number, { kind: PageKind; title: string; slug: string | null; home: boolean; revision: number; document: PageDocument; published: Published | null; scheduled?: Schedule | null }>();
  readonly saves: DraftSave[] = [];
  readonly publishes: Array<{ id: number; revision: number | undefined }> = [];
  // Scheduling, when a test turns it on: what was asked, and how many
  // schedules were made.
  schedule = false;
  readonly scheduleRequests: Array<{ id: number } & ScheduleRequest> = [];
  private schedulesMade = 0;
  readonly styles: SiteStyleChange[] = [];
  // The versions "Save version" kept: the name and the draft's document.
  readonly versions: Array<{ id: number; name: string | null; document: PageDocument }> = [];
  refuseNext: FieldError[] | null = null;
  // Called as a version is kept, before it answers: another tab at work.
  onVersion: (() => void) | null = null;
  refuseStyle = false;
  style = tokenStyle();
  // false for the browser demo's storage: a publish kept, no page served.
  livePages = true;
  // The storage's refusal of every read of the pages, while set: an editor
  // that cannot start.
  refuseStart: StorageError | null = null;

  constructor() {
    this.drafts.set(1, { kind: "page", title: "Winter series", slug: "winter-series", home: false, revision: 3, document: page(), published: null });
    this.drafts.set(2, { kind: "page", title: "Home", slug: "home", home: true, revision: 1, document: { schemaVersion: 1, title: "Home", sections: [] }, published: null });
    this.drafts.set(HEADER, { kind: "header", title: "Header", slug: null, home: false, revision: 0, document: structuredClone(SITE_THEME.parts.header) as PageDocument, published: null });
    this.drafts.set(FOOTER, { kind: "footer", title: "Footer", slug: null, home: false, revision: 0, document: structuredClone(SITE_THEME.parts.footer) as PageDocument, published: null });
  }

  // A part has no address: it is seen on every page.
  links(id: number) {
    const d = this.drafts.get(id)!;
    return { ...links(id), live: d.published && this.livePages && d.kind === "page" ? (d.home ? "/" : `/${d.published.slug}`) : null };
  }

  summary(id: number): PageSummary {
    const d = this.drafts.get(id)!;
    return { id, kind: d.kind, title: d.title, slug: d.slug, home: d.home, revision: d.revision, updatedAt: T, published: d.published, scheduled: d.scheduled ?? null, links: this.links(id) };
  }

  page(id: number): Page {
    const d = this.drafts.get(id)!;
    return { page: { id, kind: d.kind, title: d.title, slug: d.slug, home: d.home, createdAt: T }, draft: { revision: d.revision, lastSaveId: null, updatedAt: T, document: structuredClone(d.document) }, published: d.published, scheduled: d.scheduled ?? null, links: this.links(id) };
  }

  ids(kind: "page" | "part"): number[] {
    return [...this.drafts.entries()].filter(([, d]) => (d.kind === "page") === (kind === "page")).map(([id]) => id);
  }

  // The CMS's job, at the schedule's time: the scheduled revision goes live.
  fire(id: number): void {
    const d = this.drafts.get(id)!;
    const due = d.scheduled!;
    d.published = { slug: d.slug, versionNumber: 50, draftRevision: due.revision, publishedAt: due.at };
    d.scheduled = null;
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
      capabilities: { publish: true, schedule: this.schedule, responses: false, imageVariants: false, livePages: this.livePages },
      listPages: async () => {
        if (this.refuseStart) throw this.refuseStart;
        return this.ids("page").map((id) => this.summary(id));
      },
      listParts: async () => this.ids("part").map((id) => this.summary(id)),
      getPage: async (id) => this.page(id),
      getDraft: async (id) => this.page(id).draft,
      listMedia: async () => [],
      getSiteStyle: async () => this.style,
      getSite: async () => ({ timeZone: "Europe/London" }),
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
      listVersions: async (id) => this.versions.flatMap((v, index) => (v.id === id ? [{ number: index + 1, reason: "manual" as const, name: v.name, restoredFrom: null, createdAt: T, published: false }] : [])).reverse(),
      getVersion: async (id, number) => {
        const v = this.versions[number - 1]!;
        return { number, reason: "manual", name: v.name, restoredFrom: null, createdAt: T, published: false, document: structuredClone(v.document) };
      },
      saveVersion: async (id, request = {}) => {
        this.versions.push({ id, name: request.name ?? null, document: structuredClone(this.drafts.get(id)!.document) });
        const elsewhere = this.onVersion;
        this.onVersion = null;
        elsewhere?.();
        return { ok: true, value: { number: this.versions.length, reason: "manual", name: request.name ?? null, restoredFrom: null, createdAt: T, published: false } };
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
      schedulePublish: async (id, request) => {
        this.scheduleRequests.push({ id, ...request });
        const d = this.drafts.get(id)!;
        if (request.revision !== d.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: d.revision, lastSaveId: null } };
        const schedule: Schedule = { id: ++this.schedulesMade, at: request.at, revision: request.revision, versionNumber: 40 + this.schedulesMade, state: "pending", createdAt: T, settledAt: null, publishedVersionNumber: null };
        const replaced = d.scheduled ? { ...d.scheduled, state: "replaced" as const, settledAt: T } : null;
        d.scheduled = schedule;
        return { ok: true, value: { schedule, version: { number: schedule.versionNumber, reason: "scheduled", name: null, restoredFrom: null, createdAt: T, published: false }, replaced } };
      },
      cancelScheduledPublish: async (id, scheduleId) => {
        const d = this.drafts.get(id)!;
        if (d.scheduled?.id !== scheduleId) {
          return { ok: false, problem: { kind: "not-pending", message: "too late", schedule: { id: scheduleId, at: T, revision: 1, versionNumber: 41, state: "published", createdAt: T, settledAt: T, publishedVersionNumber: 50 } } };
        }
        const cancelled = { ...d.scheduled, state: "cancelled" as const, settledAt: T };
        d.scheduled = null;
        return { ok: true, value: cancelled };
      },
      createPage: async (request) => {
        if (request.slug === "winter-series") return { ok: false, problem: { kind: "invalid", code: "invalid_request", message: "invalid", errors: [{ pointer: "/slug", keyword: "taken", blockPointer: null, message: "is already the address of another page" }] } };
        const id = this.ids("page").length + 1;
        this.drafts.set(id, { kind: "page", title: request.title, slug: request.slug, home: false, revision: 0, document: { schemaVersion: 1, title: request.title, sections: [] }, published: null });
        return { ok: true, value: this.page(id) };
      },
    };
    return partial as StorageAdapter;
  }
}

// The page is open: its title is on the top bar's page switch.
const opened = () => screen.findByRole("button", { name: /^Switch page\. Open:/ });

// The page's structure, the Outline drawer opened from the top bar if it is
// not open yet.
function outline(): HTMLElement {
  if (!screen.queryByRole("tree", { name: "Page structure" })) fireEvent.click(screen.getByRole("button", { name: "Outline" }));
  return screen.getByRole("tree", { name: "Page structure" });
}

function start(wanted: number | null, options: { schedule?: boolean; demo?: boolean; refuseStart?: StorageError } = {}) {
  const clock = new FakeClock(Date.UTC(2026, 9, 2, 9));
  const env = { store: createEditorStore({ document: NO_PAGE, now: () => clock.now() }), ui: createUiStore(), clock, newId: counter("n") };
  const site = new FakeSite();
  site.schedule = options.schedule ?? false;
  site.livePages = !options.demo;
  site.refuseStart = options.refuseStart ?? null;
  const written: number[] = [];
  const address: PageAddress = { read: () => wanted, write: (id) => written.push(id) };
  // The tabs the editor opens: where each went, once it was told.
  const tabs: Array<Promise<string>> = [];
  const opener: TabOpener = { open: (href) => (tabs.push(href), true) };
  // The browser demo: no CMS, and the page as published drawn by the demo.
  const where = options.demo ? { cmsOrigin: null, publishedView: (id: number) => `?published=${id}` } : { cmsOrigin: "http://127.0.0.1:3900" };
  render(<App env={env} adapter={site.adapter()} address={address} {...where} tabs={opener} />);
  return { env, site, clock, written, tabs };
}

test("the shell opens the page the address names, and its edits reach the adapter through the autosave", async () => {
  const { env, site, clock, written } = start(1);
  await opened();
  expect(screen.getByRole("button", { name: "Switch page. Open: Winter series" })).toBeTruthy();
  expect(written).toEqual([1]);

  fireEvent.click(within(outline()).getByText("Hero"));
  openGroups("Name and link");
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

// The browser storage's refusals at start, in its words (../storage/
// browser.ts, GIVING_UP): three that only a reload of this tab gets past,
// and an upgrade held up by an older tab, which Try again gets past once
// that tab is closed.
const RELOAD_AT_START = {
  storage_newer: "This browser's storage was made by a newer version of the editor: reload this tab to get it.",
  storage_upgraded: "A newer version of the editor, open in another tab, has upgraded this browser's storage: reload this tab to go on.",
  storage_deleted: "This browser's storage for the editor was deleted in another tab: reload this tab.",
};
const HELD_UP = "Another tab has the editor open on an older version of its storage and holds on to it: close that tab, then try again.";
const refusal = (code: string, message: string) => new StorageError({ kind: "refused", status: 0, code, message });

test("an editor that could not start says why, with Reload this tab when only a reload gets past it, and no Try again that would be refused again", async () => {
  const reloads = vi.spyOn(thisTab, "reload").mockImplementation(() => {});
  try {
    for (const [code, words] of Object.entries(RELOAD_AT_START)) {
      start(1, { refuseStart: refusal(code, words) });
      const alert = await screen.findByRole("alert");
      expect(alert.querySelector("p")?.textContent, code).toBe(`The editor could not start: ${words}`);
      expect(within(alert).queryByRole("button", { name: "Try again" }), code).toBeNull();
      const before = reloads.mock.calls.length;
      fireEvent.click(within(alert).getByRole("button", { name: "Reload this tab" }));
      expect(reloads.mock.calls.length, code).toBe(before + 1);
      cleanup();
    }
  } finally {
    reloads.mockRestore();
  }
});

test("an editor held up by an older tab says to close it and try again, and Try again starts it once that tab is closed", async () => {
  const { site } = start(1, { refuseStart: refusal("storage_blocked", HELD_UP) });
  const alert = await screen.findByRole("alert");
  expect(alert.querySelector("p")?.textContent).toBe(`The editor could not start: ${HELD_UP}`);
  expect(within(alert).queryByRole("button", { name: "Reload this tab" })).toBeNull();
  // Try again while the other tab still holds on: refused again, same words,
  // as the browser's storage refuses each call until that tab lets go
  // (../storage/browser.ts; e2e/browser/gives-up.spec.ts holds it to that).
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByRole("alert").querySelector("p")?.textContent).toBe(`The editor could not start: ${HELD_UP}`));
  // That tab closed: Try again starts the editor.
  site.refuseStart = null;
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" }));
  await opened();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a save refused with a 422 puts the error on the block's field, and the next edit clears it", async () => {
  const { env, site, clock } = start(1);
  await opened();
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
  // on the button's outline row, and the save state says so.
  const link = await screen.findByLabelText("Link");
  await waitFor(() => expect(link.getAttribute("aria-invalid")).toBe("true"));
  expect(describedText(link)).toContain("Use a full address (https://…)");
  expect(screen.getByRole("textbox", { name: "Text" }).getAttribute("aria-invalid")).toBeNull();
  expect(within(outline()).getByRole("treeitem", { name: "Button: Join us, refused by the server" })).toBeTruthy();
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
  await opened();
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Winter series" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Pages" })).getByRole("button", { name: "New page" }));
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
  // Nothing selected on the new page: the sidebar's Page tab, its address.
  expect((screen.getByLabelText("Address") as HTMLInputElement).value).toBe("spring-series");
});

// An edit the shell's autosave has not sent yet: the first section's label.
function relabel(label: string) {
  fireEvent.click(within(outline()).getAllByRole("treeitem")[0]!.querySelector(".t-row")!);
  openGroups("Name and link");
  const field = screen.getByLabelText("Section label");
  fireEvent.change(field, { target: { value: label } });
  fireEvent.blur(field);
}

test("Publish sends the edit still waiting, then publishes at the revision it made, and links to the live page", async () => {
  const { site, env } = start(1);
  await opened();
  expect(document.querySelector(".tb-status")?.textContent).toBe("Not published yet");
  relabel("Winter");
  expect(site.saves).toHaveLength(0);

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  // No debounce waited for: the save went first, and the publish named the
  // revision that save made.
  expect(site.saves).toHaveLength(1);
  expect(site.publishes).toEqual([{ id: 1, revision: 4 }]);
  await waitFor(() => expect(document.querySelector(".tb-status")?.textContent).toBe("Published"));
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

test("a text the page refused, still held where it is written, keeps the page open and unpublished, and the tab asks before it closes; once the page takes it, Publish goes", async () => {
  const { site, env, written } = start(1);
  await opened();
  const why = "This heading cannot be kept yet: it is empty. It stays open here until the page can take it.";
  // Held as a heading's line holds words the page refused.
  const release = env.ui.getState().pending.hold(() => {
    env.ui.getState().say(why);
    return false;
  });

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(site.publishes).toEqual([]);
  expect(env.ui.getState().notice).toBe(`Not published. ${why}`);
  // The header, from the Page tab: the page stays, with the reason.
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Header" })));
  await waitFor(() => expect(env.ui.getState().notice).toBe(why));
  expect(written).toEqual([1]);
  expect(screen.getByRole("button", { name: "Switch page. Open: Winter series" })).toBeTruthy();
  const closing = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);

  release();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(site.publishes).toHaveLength(1);
});

test("in the browser demo, Publish opens a tab at once, sends it to the page as published once it is kept, and says what the full system does", async () => {
  const { site, env, tabs } = start(1, { demo: true });
  await opened();
  relabel("Winter");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(site.publishes).toEqual([{ id: 1, revision: 4 }]);
  expect(tabs).toHaveLength(1);
  const shown = new URL("?published=1", window.location.href).href;
  await expect(tabs[0]).resolves.toBe(shown);
  expect(env.ui.getState().notice).toBe("Published in this browser. In the full system, Rails publishes and serves this page, with the cache.");
  expect(screen.getByRole("link", { name: "View published page" }).getAttribute("href")).toBe(shown);
  expect(screen.queryByRole("link", { name: "View live page" })).toBeNull();

  // Not published, the tab opened for it is told so, and closes.
  site.savedElsewhere(1, page());
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(tabs).toHaveLength(2);
  await expect(tabs[1]).rejects.toThrow("not published");
  expect(env.ui.getState().notice).toBe("Not published: the page was saved somewhere else after this tab's last save. Nothing was published.");
});

// Schedule… from the Publish menu, the dialog filled in the site's time
// (London; the kit's clock is Fri Oct 2, 9:00 UTC, 10:00 AM there).
async function scheduleFor(date: string, time: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /^Schedule…/ }));
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: time } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Schedule for / })));
}

test("Schedule saves the edit waiting first, sets the revision it made for the time chosen, and the page is read again when the time comes", async () => {
  const { site, env, clock } = start(1, { schedule: true });
  await opened();
  relabel("Winter");

  await scheduleFor("Oct 2, 2026", "3:00 PM");
  expect(site.saves).toHaveLength(1);
  expect(site.scheduleRequests).toEqual([{ id: 1, revision: 4, at: "2026-10-02T14:00:00.000Z" }]);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.querySelector(".tb-status")?.textContent).toBe("Not published yet · scheduled for Oct 2 at 3:00 PM");
  expect(env.ui.getState().notice).toBe("Scheduled: visitors see these changes from Oct 2 at 3:00 PM (UTC+1). Until then the live page stays as it is.");

  // The CMS's job puts it live at its time; a second after, the editor
  // reads the page again, and says what is live.
  site.fire(1);
  await act(() => clock.advance(5 * 3_600_000 - 1_000));
  expect(document.querySelector(".tb-status")?.textContent).toBe("Not published yet · scheduled for Oct 2 at 3:00 PM");
  await act(() => clock.advance(2_000));
  await waitFor(() => expect(document.querySelector(".tb-status")?.textContent).toBe("Published"));
});

test("a scheduled publish whose job does not run is said to be late, and the page is still read again every half minute until it goes live", async () => {
  const { site, clock } = start(1, { schedule: true });
  await opened();
  relabel("Winter");
  await scheduleFor("Oct 2, 2026", "3:00 PM");
  const status = () => document.querySelector(".tb-status")?.textContent;
  const reads: number[] = [];
  const getPage = site.page.bind(site);
  site.page = (id) => {
    reads.push(clock.now());
    return getPage(id);
  };

  // The time comes and the job does not run (the CMS's database was busy).
  await act(() => clock.advance(5 * 3_600_000 + 10_000));
  expect(status()).toBe("Not published yet · scheduled for Oct 2 at 3:00 PM");
  await act(() => clock.advance(21_000));
  expect(status()).toBe("Not published yet · should have gone live on Oct 2 at 3:00 PM");

  // A minute on, the quick reads are over; the slow ones go on, a few minutes.
  await act(() => clock.advance(5 * 60_000));
  const slow = reads.filter((at) => at > Date.UTC(2026, 9, 2, 14, 2));
  expect(slow.length).toBeGreaterThanOrEqual(6);
  expect(slow.slice(1).map((at, index) => at - slow[index]!)).toEqual(slow.slice(1).map(() => 30_000));
  expect(status()).toBe("Not published yet · should have gone live on Oct 2 at 3:00 PM");

  // The CMS sets the job going again, and the page is live: the next read says so.
  site.fire(1);
  await act(() => clock.advance(31_000));
  await waitFor(() => expect(status()).toBe("Published"));
});

test("a scheduled publish is cancelled from the Publish menu; too late, the editor says what became of it", async () => {
  const { site, env } = start(1, { schedule: true });
  await opened();
  relabel("Winter");
  await scheduleFor("Oct 3, 2026", "8:00 AM");
  expect(site.drafts.get(1)!.scheduled?.state).toBe("pending");

  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: /^Cancel scheduled publish/ })));
  expect(site.drafts.get(1)!.scheduled).toBeNull();
  expect(document.querySelector(".tb-status")?.textContent).toBe("Not published yet");
  expect(env.ui.getState().notice).toBe("Scheduled publish cancelled: the live page stays as it is.");

  await scheduleFor("Oct 3, 2026", "8:00 AM");
  // The job ran before this tab heard of it.
  site.fire(1);
  fireEvent.click(screen.getByRole("button", { name: "More publish options" }));
  await act(async () => fireEvent.click(screen.getByRole("menuitem", { name: /^Cancel scheduled publish/ })));
  expect(env.ui.getState().notice).toBe("Not cancelled: the scheduled publish has already happened. Visitors see those changes now.");
  await waitFor(() => expect(document.querySelector(".tb-status")?.textContent).toBe("Published"));
});

test("Preview opens a tab at once, and sends it to the CMS's preview once the edit waiting is saved", async () => {
  const { site, tabs } = start(1);
  await opened();
  relabel("Spring");
  fireEvent.click(screen.getByRole("link", { name: "Preview" }));
  expect(tabs).toHaveLength(1);
  expect(await tabs[0]).toBe("http://127.0.0.1:3900/preview/1");
  expect(site.saves).toHaveLength(1);
  expect(site.drafts.get(1)!.document.sections[0]!.props.label).toBe("Spring");
});

test("a conflict stops saving until the person chooses: Reload takes the server's page, Keep mine saves this one over it, and either is undone from the history", async () => {
  const { site, env, clock } = start(1);
  await opened();
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
  // It is a step of this session, the steps before it kept: undone, this
  // tab's page comes back and is saved, from the server's revision.
  expect(env.ui.getState().notice).toBe("Reloaded: this is the page as it is on the server. Undo brings this tab’s page back.");
  expect(env.store.getState().past.map((e) => e.command.label)).toEqual(["Renamed section to Mine", "Reloaded the page saved in another tab"]);
  act(() => void env.store.getState().undo());
  expect(env.store.getState().document.sections[0]!.props.label).toBe("Mine");
  await act(() => clock.advance(1_000));
  expect(site.drafts.get(1)!.document.sections[0]!.props.label).toBe("Mine");
  expect(screen.queryByRole("alert")).toBeNull();

  // Again, and this time this tab's page wins; theirs is kept as a version
  // first, for Restore to bring back.
  site.savedElsewhere(1, theirs);
  relabel("Mine again");
  await act(() => clock.advance(1_000));
  await act(async () => fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Keep mine" })));
  await waitFor(() => expect(site.drafts.get(1)!.document.sections[0]!.props.label).toBe("Mine again"));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(site.saves.at(-1)!.revision).toBe(site.drafts.get(1)!.revision - 1);
  expect(site.versions.map((v) => [v.name, v.document.sections[0]!.props.label])).toEqual([["Before Keep mine", "Theirs"]]);
  expect(env.ui.getState().notice).toBe("Kept this tab’s page: it is saved over the one on the server, which is kept in Versions as “Before Keep mine”.");
});

test("Keep mine saves over the page on the server now, keeps each page it saves over once, and says done only once the CMS has it", async () => {
  const { site, env, clock } = start(1);
  await opened();
  const labelled = (label: string) => {
    const doc = page();
    doc.sections[0]!.props.label = label;
    return doc;
  };
  const keepMine = async () => {
    await act(async () => fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Keep mine" })));
    await act(() => clock.advance(1_000));
  };
  const kept = () => site.versions.map((v) => v.document.sections[0]!.props.label);
  const onServer = () => site.drafts.get(1)!.document.sections[0]!.props.label;

  // Another tab saves, this one meets the conflict; a third saves again
  // before Keep mine is pressed: that third page is the one kept.
  site.savedElsewhere(1, labelled("Second"));
  relabel("Mine");
  await act(() => clock.advance(1_000));
  site.savedElsewhere(1, labelled("Third"));
  await keepMine();
  await waitFor(() => expect(onServer()).toBe("Mine"));
  expect(kept()).toEqual(["Third"]);
  expect(env.ui.getState().notice).toBe("Kept this tab’s page: it is saved over the one on the server, which is kept in Versions as “Before Keep mine”.");

  // Saved elsewhere again while the version is kept: not saved over, and
  // said so, never said done; the next Keep mine keeps the newer page too.
  site.savedElsewhere(1, labelled("Fourth"));
  relabel("Mine again");
  await act(() => clock.advance(1_000));
  site.onVersion = () => site.savedElsewhere(1, labelled("Fifth"));
  await keepMine();
  expect(onServer()).toBe("Fifth");
  expect(env.ui.getState().notice).toBe("Not saved over it yet: the page was saved in another tab again while this one kept it. Choose again: Keep mine keeps that page as a version too.");
  expect(screen.getByRole("alert").textContent).toContain("Changed in another tab.");
  await keepMine();
  await waitFor(() => expect(onServer()).toBe("Mine again"));
  expect(kept()).toEqual(["Third", "Fourth", "Fifth"]);

  // The page on the server is the newest version already: not kept twice.
  site.savedElsewhere(1, labelled("Fifth"));
  relabel("Mine at last");
  await act(() => clock.advance(1_000));
  await keepMine();
  await waitFor(() => expect(onServer()).toBe("Mine at last"));
  expect(kept()).toEqual(["Third", "Fourth", "Fifth"]);
});

test("a site style change shows on the canvas at once and goes to the CMS; refused, the canvas goes back", async () => {
  const { site, env } = start(1);
  await opened();
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

// The canvas's parts: the one being edited, the page around it and the
// other part, locked.
const editing = () => document.querySelector<HTMLElement>(".canvas [data-editing-part]");
const around = () => document.querySelector<HTMLElement>(".canvas [data-around-page]");
const locked = (kind: string) => document.querySelector<HTMLElement>(`.canvas [data-theme-part="${kind}"]`);

test("the header and footer are drawn locked around a page, from their drafts; the Page tab opens one as a page is opened, the page left drawn dimmed around it, and leads back to it", async () => {
  const { written } = start(1);
  await opened();
  expect(locked("header")?.hasAttribute("inert")).toBe(true);
  expect(locked("footer")?.hasAttribute("inert")).toBe(true);
  expect(locked("header")?.querySelector(".w-logo-link span")?.textContent).toBe("Slack Water");
  fireEvent.click(screen.getByRole("button", { name: "Header" }));
  await screen.findByRole("button", { name: "Switch page. Open: Header" });
  expect(written).toEqual([1, HEADER]);
  expect(editing()?.dataset.editingPart).toBe("header");
  expect(editing()?.tagName).toBe("HEADER");
  // The page left, as it was left, dimmed and locked under the header; the
  // footer locked under it.
  expect(around()?.hasAttribute("inert")).toBe(true);
  expect(around()?.querySelectorAll(":scope > [data-block-type=section]")).toHaveLength(page().sections.length);
  expect(locked("footer")).not.toBeNull();
  expect(locked("header")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to Winter series" }));
  await screen.findByRole("button", { name: "Switch page. Open: Winter series" });
  expect(written).toEqual([1, HEADER, 1]);
  expect(editing()).toBeNull();
});

test("an edit of the footer is saved as a page's is, drawn around the page opened next, and Publish puts it on every page", async () => {
  const { site, env, clock } = start(1);
  await opened();
  fireEvent.click(screen.getByRole("button", { name: "Footer" }));
  await screen.findByRole("button", { name: "Switch page. Open: Footer" });
  relabel("Site foot");
  await act(() => clock.advance(1_000));
  expect(site.saves.at(-1)).toMatchObject({ revision: 0 });
  expect(site.drafts.get(FOOTER)!.document.sections[0]!.props.label).toBe("Site foot");
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(site.publishes).toEqual([{ id: FOOTER, revision: 1 }]);
  expect(env.ui.getState().notice).toBe("Published: every page shows this footer at its next visit.");
  expect(screen.getByRole("link", { name: "View the home page" }).getAttribute("href")).toBe("http://127.0.0.1:3900/");
  // Back on a page, from the Page tab, the footer around it is the draft as
  // edited.
  fireEvent.click(screen.getByRole("tab", { name: "Page" }));
  fireEvent.click(screen.getByRole("button", { name: "Back to Winter series" }));
  await screen.findByRole("button", { name: "Switch page. Open: Winter series" });
  expect(env.ui.getState().parts.footer?.sections[0]?.props.label).toBe("Site foot");
});

test("a part named by the address opens around the home page's draft; Insert offers no form there", async () => {
  start(HEADER);
  await screen.findByRole("button", { name: "Switch page. Open: Header" });
  await waitFor(() => expect(around()).not.toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Insert" }));
  expect(screen.queryByRole("button", { name: "Form" })).toBeNull();
  expect(screen.getByRole("button", { name: "Menu" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Back to Home" })).toBeTruthy();
});

test("in the browser demo, publishing a part opens the home page as published, the part on it", async () => {
  const { site, env, tabs } = start(FOOTER, { demo: true });
  await screen.findByRole("button", { name: "Switch page. Open: Footer" });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(site.publishes).toEqual([{ id: FOOTER, revision: 0 }]);
  const shown = new URL("?published=2", window.location.href).href;
  await expect(tabs[0]).resolves.toBe(shown);
  expect(env.ui.getState().notice).toContain("footer");
});
