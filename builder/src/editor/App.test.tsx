// The shell on a storage adapter of the test's own: it opens the page the
// address names (a collection's template too, drawn with its entry, even
// when the collections cannot be read, and given its collection once a
// later read finds it; else the home page), the collections read again as
// Collections closes, the latest read standing over a slower one, and a
// template chosen in the page switch opened as Edit the template opens it,
// the page's edit saved first, the switch saying it is live once it is
// published; its
// edits reach the adapter through
// the autosave on the injected clock, a save the server refuses with a 422
// puts each error on its block's field, and a new page is made and opened.
// Publishing saves what waits first and publishes at that revision; the
// preview opens on the CMS once the edits are sent; a conflict is settled
// by Reload or Keep mine; the site style shows at once and goes to the CMS,
// and comes back when the CMS refuses it. The site's header and footer
// open as pages do, the page left drawn dimmed around them, and are saved
// and published as pages are; their drafts are what the canvas draws
// around every page. The Assistant's new site replaces a part keeping
// every draft it saves over as a version, another tab's save in between
// too, tells a save whose answer is lost from its draft read back (or
// says it cannot, and at what revision it was sent), fences one that may
// land late by saving at the revision read, draws the part as stored, and
// changes a page's draft without losing a save from elsewhere. A page the
// Assistant wrote aside whose last changes were not saved, kept in this
// tab, is taken in as it is opened, as a step the page's autosave saves,
// a draft saved elsewhere since kept as a version first; kept still where
// it could not be opened, or the page refuses it.
// An editor that cannot start says why, with the one button that can help.
// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { page } from "../../test/document-page.ts";
import { newsCollection, newsEntry } from "../../test/site-entries.ts";
import { describedText, openGroups } from "../../test/editor-kit.tsx";
import { FakeClock } from "../../test/fake-clock.ts";
import { counter } from "../../test/document-page.ts";
import tokens from "../../../schema/tokens.json";
import type { PageDocument } from "../shared/document.ts";
import type { ShopSettings } from "../shared/shop.ts";
import { SITE_THEME } from "virtual:site-theme";
import { StorageError, type DraftSave, type FieldError, type Page, type PageKind, type PageSummary, type Published, type Schedule, type ScheduleRequest, type SiteStyle, type SiteStyleChange, type StorageAdapter } from "../storage/adapter.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { useAssistantStore, type AssistantStore, type PendingPage } from "../assistant/context.tsx";
import { App, BEFORE_ASSISTANTS_PAGE, NO_PAGE, PUT_BACK, type PageAddress, type TabOpener } from "./App.tsx";
import { thisTab } from "./SaveStatus.tsx";
import { useSession, type PartReplaced, type Session } from "./session.tsx";
import { createUiStore } from "./ui-store.ts";

// The session the shell gives what it draws, handed to a test to call.
function Grab({ onSession }: { onSession: (session: Session) => void }) {
  const session = useSession();
  useEffect(() => {
    onSession(session);
  }, [onSession, session]);
  return null;
}

const T = "2026-10-02T08:00:00.000Z";
// The site's header and footer, by their ids.
const HEADER = 101;
const FOOTER = 102;
// News's template, when the storage keeps collections: its entry's title
// as its heading.
const TEMPLATE = 90;
const links =(id: number) => ({ self: `/api/pages/${id}`, draft: `/api/pages/${id}/draft`, versions: `/api/pages/${id}/versions`, publish: `/api/pages/${id}/publish`, schedules: `/api/pages/${id}/schedules`, preview: `/preview/${id}`, live: null });

// The site style as the CMS answers it, from the tokens.
function tokenStyle(palette: Record<string, string> = {}): SiteStyle {
  const tones = tokens["site-tones"];
  const colors: Record<string, string> = tokens.color;
  const slots = ["text", "background", "primary", "accent", "soft", "muted"] as const;
  return {
    palette: Object.fromEntries(slots.map((slot) => [slot, palette[slot] ?? tones[slot].default])),
    typeScale: "balanced",
    letterWidth: "normal",
    customCss: "",
    updatedAt: null,
    kept: null,
    choices: {
      palette: Object.fromEntries(slots.map((slot) => [slot, tones[slot].tones.map((t) => ({ color: t.color, label: t.label, hex: colors[t.color]! }))])),
      typeScales: tokens["site-type-scale"].choices.map((c) => ({ name: c.name, label: c.label })),
      letterWidths: tokens["site-letter-width"].choices.map((c) => ({ name: c.name, label: c.label })),
    },
  };
}

// The CMS as the adapter's caller sees it: pages with drafts, and the
// site's header and footer beside them, each with its starter as its draft
// and nothing live; saves taken at the draft's revision (another tab's save
// makes the next one a conflict), publishing at a revision, the site style,
// and a 422 when the test asks for one.
class FakeSite {
  readonly drafts = new Map<number, { kind: PageKind; title: string; slug: string | null; home: boolean; revision: number; document: PageDocument; published: Published | null; scheduled?: Schedule | null; lastSaveId?: string }>();
  // The next save gets no answer: kept ("save"), and no answer to the
  // draft's next read either ("save and read"); or not kept yet, landing
  // when the test lets it ("late", "late and read").
  loseAnswer: "save" | "save and read" | "late" | "late and read" | null = null;
  private loseRead = false;
  // The saves still to land, in the order they were sent: each kept at the
  // revision it was sent at, or refused as a conflict where it moved.
  readonly lateSaves: Array<() => "kept" | "refused"> = [];
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
  // The same as a draft is read, once.
  onDraft: (() => void) | null = null;
  // What the next reads of a draft meet, one each, before they read: no
  // answer ("fail"), something done first (another tab at work, a late
  // save landing), or nothing (null).
  readonly reads: Array<"fail" | (() => void) | null> = [];
  refuseStyle = false;
  // While set, a change of the site style waits for it before it is
  // answered: one on its way.
  styleGate: Promise<void> | null = null;
  style = tokenStyle();
  // false for the browser demo's storage: a publish kept, no page served.
  livePages = true;
  // The storage's refusal of every read of the pages, while set: an editor
  // that cannot start.
  refuseStart: StorageError | null = null;
  // Whether it keeps collections: News, with one entry published.
  collections = false;
  // The storage's refusal of every read of the collections and their
  // entries, while set.
  refuseCollections: StorageError | null = null;
  // A refusal of the next read of a page, once.
  refusePageOnce: StorageError | null = null;
  // The title of News's one entry, as the next read of it finds it.
  entryTitle = "Dawn swims";
  // While set, the next read of the entries the canvas draws waits for it,
  // with what it read when it was asked: a slow read. The reads of them
  // asked for so far.
  entriesGate: Promise<void> | null = null;
  entriesReads = 0;
  // The shop's settings, when it keeps a shop (with the collections); the
  // reads of them so far.
  shop: ShopSettings | null = null;
  shopReads = 0;

  constructor() {
    this.drafts.set(1, { kind: "page", title: "Winter series", slug: "winter-series", home: false, revision: 3, document: page(), published: null });
    this.drafts.set(2, { kind: "page", title: "Home", slug: "home", home: true, revision: 1, document: { schemaVersion: 1, title: "Home", sections: [] }, published: null });
    this.drafts.set(HEADER, { kind: "header", title: "Header", slug: null, home: false, revision: 0, document: structuredClone(SITE_THEME.parts.header) as PageDocument, published: null });
    this.drafts.set(FOOTER, { kind: "footer", title: "Footer", slug: null, home: false, revision: 0, document: structuredClone(SITE_THEME.parts.footer) as PageDocument, published: null });
    const title = { id: "t", type: "field", props: { field: "title", level: 1 }, children: [], style: { base: {} } };
    const entry = { id: "s", type: "section", props: {}, style: { base: {} }, children: [{ id: "c", type: "column", props: {}, style: { base: {} }, children: [title] }] };
    this.drafts.set(TEMPLATE, { kind: "template", title: "News", slug: null, home: false, revision: 1, document: { schemaVersion: 1, title: "News", sections: [entry] } as unknown as PageDocument, published: null });
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
    return { page: { id, kind: d.kind, title: d.title, slug: d.slug, home: d.home, createdAt: T }, draft: { revision: d.revision, lastSaveId: d.lastSaveId ?? null, updatedAt: T, document: structuredClone(d.document) }, published: d.published, scheduled: d.scheduled ?? null, links: this.links(id) };
  }

  ids(kind: "page" | "part"): number[] {
    return [...this.drafts.entries()].filter(([, d]) => (kind === "page" ? d.kind === "page" : d.kind === "header" || d.kind === "footer")).map(([id]) => id);
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
      capabilities: { publish: true, schedule: this.schedule, responses: false, imageVariants: false, livePages: this.livePages, collections: this.collections, shop: this.shop !== null },
      getShop: async () => {
        this.shopReads += 1;
        return { ...this.shop!, updatedAt: null, checkout: { ready: false, reason: "Not here." } };
      },
      listOrders: async () => [],
      listCollections: async () => {
        if (this.refuseCollections) throw this.refuseCollections;
        return [newsCollection({ template: this.summary(TEMPLATE) })];
      },
      listEntries: async (_id, options) => {
        if (this.refuseCollections) throw this.refuseCollections;
        const entries = [newsEntry(1, this.entryTitle, "2026-05-02")];
        // The Collections screen asks with its search and order; the
        // canvas's read asks for them all.
        const gate = options === undefined ? this.entriesGate : null;
        if (options === undefined) this.entriesReads += 1;
        if (gate) {
          this.entriesGate = null;
          await gate;
        }
        return entries;
      },
      listPages: async () => {
        if (this.refuseStart) throw this.refuseStart;
        return this.ids("page").map((id) => this.summary(id));
      },
      listParts: async () => this.ids("part").map((id) => this.summary(id)),
      getPage: async (id) => {
        const refused = this.refusePageOnce;
        this.refusePageOnce = null;
        if (refused) throw refused;
        if (!this.drafts.has(id)) throw new StorageError({ kind: "not-found", message: "There is nothing at this address." });
        return this.page(id);
      },
      getDraft: async (id) => {
        if (this.loseRead) {
          this.loseRead = false;
          throw new StorageError({ kind: "unknown", cause: "network", status: null, message: "The network failed." });
        }
        const met = this.reads.shift();
        if (met === "fail") throw new StorageError({ kind: "unknown", cause: "network", status: null, message: "The network failed." });
        met?.();
        const draft = this.page(id).draft;
        const elsewhere = this.onDraft;
        this.onDraft = null;
        elsewhere?.();
        return draft;
      },
      listMedia: async () => [],
      getSiteStyle: async () => this.style,
      getSite: async () => ({ timeZone: "Europe/London" }),
      setSiteStyle: async (change) => {
        this.styles.push(change);
        if (this.styleGate) await this.styleGate;
        if (this.refuseStyle) return { ok: false, problem: { kind: "invalid", code: "invalid_request", message: "invalid", errors: [{ pointer: "/palette/primary", keyword: "inclusion", blockPointer: null, message: "must be one of the slot's tones" }] } };
        const { kept: _kept, ...rest } = change;
        this.style = { ...this.style, ...rest, updatedAt: T };
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
        if (this.loseAnswer === "late" || this.loseAnswer === "late and read") {
          this.loseRead = this.loseAnswer === "late and read";
          this.loseAnswer = null;
          this.lateSaves.push(() => {
            if (d.revision !== save.revision) return "refused";
            d.revision += 1;
            d.document = save.document;
            d.lastSaveId = save.saveId;
            return "kept";
          });
          throw new StorageError({ kind: "unknown", cause: "timeout", status: null, message: "The save got no answer within 15 s." });
        }
        if (save.revision !== d.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: d.revision, lastSaveId: null } };
        d.revision += 1;
        d.document = save.document;
        d.lastSaveId = save.saveId;
        if (this.loseAnswer) {
          this.loseRead = this.loseAnswer === "save and read";
          this.loseAnswer = null;
          throw new StorageError({ kind: "unknown", cause: "timeout", status: null, message: "The save got no answer within 15 s." });
        }
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

function start(wanted: number | null, options: { schedule?: boolean; demo?: boolean; refuseStart?: StorageError; collections?: boolean; refuseCollections?: StorageError; refusePageOnce?: StorageError; shop?: ShopSettings; foot?: ReactNode } = {}) {
  const clock = new FakeClock(Date.UTC(2026, 9, 2, 9));
  const env = { store: createEditorStore({ document: NO_PAGE, now: () => clock.now() }), ui: createUiStore(), clock, newId: counter("n") };
  const site = new FakeSite();
  site.schedule = options.schedule ?? false;
  site.livePages = !options.demo;
  site.refuseStart = options.refuseStart ?? null;
  site.collections = options.collections ?? false;
  site.refuseCollections = options.refuseCollections ?? null;
  site.refusePageOnce = options.refusePageOnce ?? null;
  site.shop = options.shop ?? null;
  const written: number[] = [];
  const address: PageAddress = { read: () => wanted, write: (id) => written.push(id) };
  // The tabs the editor opens: where each went, once it was told.
  const tabs: Array<Promise<string>> = [];
  const opener: TabOpener = { open: (href) => (tabs.push(href), true) };
  // The browser demo: no CMS, and the page as published drawn by the demo.
  const where = options.demo ? { cmsOrigin: null, publishedView: (id: number) => `?published=${id}` } : { cmsOrigin: "http://127.0.0.1:3900" };
  render(<App env={env} adapter={site.adapter()} address={address} {...where} tabs={opener} {...(options.foot ? { foot: options.foot } : {})} />);
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

test("a page made aside for the Assistant is made and listed, and the page open stays open, its document untouched; its id, its draft's revision and its document come back, and the storage's own draft calls save it", async () => {
  const grab: { session: Session | null } = { session: null };
  const { env, site, written } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const before = env.store.getState().document;
  let made: Awaited<ReturnType<Session["makePageAside"]>> | undefined;
  await act(async () => {
    made = await grab.session!.makePageAside({ title: "Open day", slug: "open-day" });
  });
  expect(made).toEqual({ ok: true, id: 3, revision: 0, document: { schemaVersion: 1, title: "Open day", sections: [] } });
  // Still on Winter series, its document the same; the address names it still.
  expect(screen.getByRole("button", { name: "Switch page. Open: Winter series" })).toBeTruthy();
  expect(env.store.getState().document).toBe(before);
  expect(written).toEqual([1]);
  // Listed in the page switch.
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Winter series" }));
  expect(within(screen.getByRole("dialog", { name: "Pages" })).getByRole("button", { name: /^Open day/ })).toBeTruthy();
  // A taken address: the server's findings, on /slug.
  let taken: Awaited<ReturnType<Session["makePageAside"]>> | undefined;
  await act(async () => {
    taken = await grab.session!.makePageAside({ title: "Winter", slug: "winter-series" });
  });
  expect(taken).toMatchObject({ ok: false, errors: [{ pointer: "/slug" }] });
  // Its draft, saved through the storage's own calls.
  const document: PageDocument = { schemaVersion: 1, title: "Open day", sections: [] , description: "Trial swims." };
  expect(await grab.session!.drafts.saveDraft(3, { revision: 0, saveId: "aside-1", document })).toMatchObject({ ok: true, value: { revision: 1 } });
  expect(site.drafts.get(3)!.document).toEqual(document);
});

// The session and the Assistant's state the shell gives what it draws.
function GrabAll({ onGrab }: { onGrab: (session: Session, assistant: AssistantStore) => void }) {
  const session = useSession();
  const assistant = useAssistantStore();
  useEffect(() => {
    onGrab(session, assistant);
  }, [onGrab, session, assistant]);
  return null;
}

// A page the Assistant made aside (id 3), its last changes not saved and
// kept in this tab, as ./assistant-aside.ts keeps one: what it was let do,
// heard in `events`.
async function keptAside(options: Parameters<typeof start>[1] = {}) {
  const grab: { session: Session | null; assistant: AssistantStore | null } = { session: null, assistant: null };
  const started = start(1, { ...options, foot: <GrabAll onGrab={(session, assistant) => Object.assign(grab, { session, assistant })} /> });
  await opened();
  await act(async () => {
    await grab.session!.makePageAside({ title: "Open day", slug: "open-day" });
  });
  const ours: PageDocument = { ...page(), title: "Open day" };
  const events: string[] = [];
  const kept: PendingPage = {
    id: 3, title: "Open day", document: () => ours, revision: () => 0, change: async () => false,
    settle: async () => void events.push("settled"),
    letGo: () => void events.push("let go"),
  };
  act(() => grab.assistant!.getState().keepPending(kept));
  const open = async () => {
    let why: string | null = "not asked";
    await act(async () => {
      why = await grab.session!.openPage(3);
    });
    return why;
  };
  return { ...started, grab, ours, events, open };
}

test("a page the Assistant wrote aside, its last changes not saved and kept in this tab, is taken in as it is opened: its saves settled first, its draft read, the Assistant's page put on it as one step the editor's autosave saves; let go, kept no more, and said", async () => {
  const { env, site, clock, grab, ours, events, open } = await keptAside();
  expect(await open()).toBeNull();
  expect(events).toEqual(["settled", "let go"]);
  expect(grab.assistant!.getState().pending.size).toBe(0);
  expect(screen.getByRole("button", { name: "Switch page. Open: Open day" })).toBeTruthy();
  // One step, which undo takes back to the draft as it was saved.
  expect(env.store.getState().document).toEqual(ours);
  expect(env.store.getState().past.map((entry) => entry.command.label)).toEqual([PUT_BACK]);
  expect(PUT_BACK).toBe("Put back the Assistant's changes not saved before");
  expect(env.ui.getState().notice).toBe("The Assistant's last changes to “Open day”, not saved before, are back on the page, to be saved.");
  // Saved by the editor's own autosave, after its pause, at the draft's revision.
  await act(async () => {
    await clock.advance(1_000);
  });
  expect(site.saves.at(-1)).toMatchObject({ revision: 0, document: ours });
  expect(site.drafts.get(3)).toMatchObject({ revision: 1, document: ours });
  expect(site.versions).toEqual([]);
});

test("a page kept in this tab whose draft was saved somewhere else since the Assistant's last save: that draft is kept as a version first, then the Assistant's page saved over it; one whose draft holds the Assistant's page already takes nothing, and is let go", async () => {
  const theirs: PageDocument = { schemaVersion: 1, title: "Open day", sections: [], description: "Saved in another tab." };
  const elsewhere = await keptAside();
  elsewhere.site.savedElsewhere(3, theirs);
  expect(await elsewhere.open()).toBeNull();
  expect(elsewhere.site.versions).toEqual([{ id: 3, name: BEFORE_ASSISTANTS_PAGE, document: theirs }]);
  expect(BEFORE_ASSISTANTS_PAGE).toBe("Before the Assistant's page");
  expect(elsewhere.env.ui.getState().notice).toBe("The Assistant's last changes to “Open day”, not saved before, are back on the page, to be saved. The page as it was saved somewhere else is kept in Versions, as “Before the Assistant's page”.");
  await act(async () => {
    await elsewhere.clock.advance(1_000);
  });
  expect(elsewhere.site.drafts.get(3)).toMatchObject({ revision: 2, document: elsewhere.ours });
  cleanup();

  // Its last save landed after all, its answer lost: nothing to take in.
  const landed = await keptAside();
  landed.site.savedElsewhere(3, landed.ours);
  expect(await landed.open()).toBeNull();
  expect(landed.events).toEqual(["settled", "let go"]);
  expect(landed.env.store.getState().past).toEqual([]);
  expect(landed.site.versions).toEqual([]);
  expect(landed.grab.assistant!.getState().pending.size).toBe(0);
});

test("a page kept in this tab that could not be opened stays kept, settled, to be taken in at the next open; one the page refuses to take stays kept too, said", async () => {
  const { site, grab, ours, events, open, env } = await keptAside();
  site.refusePageOnce = new StorageError({ kind: "unknown", cause: "network", status: null, message: "The network failed." });
  expect(await open()).toBe("The page could not be opened: The network failed.");
  expect(events).toEqual(["settled"]);
  expect(grab.assistant!.getState().pending.has(3)).toBe(true);
  expect(await open()).toBeNull();
  expect(events).toEqual(["settled", "settled", "let go"]);
  expect(env.store.getState().document).toEqual(ours);
  cleanup();

  // Two sections with the same ids: the page's rules refuse them.
  const refused = await keptAside();
  const twice = refused.ours.sections[0]!;
  const bad: PageDocument = { ...refused.ours, sections: [twice, twice] };
  act(() => refused.grab.assistant!.getState().keepPending({ ...refused.grab.assistant!.getState().pending.get(3)!, document: () => bad }));
  expect(await refused.open()).toBeNull();
  expect(refused.events).toEqual(["settled"]);
  expect(refused.grab.assistant!.getState().pending.has(3)).toBe(true);
  expect(refused.env.ui.getState().notice).toMatch(/^The Assistant's last changes to “Open day” could not be put back on the page: .+ They are still kept in this tab\.$/);
  expect(refused.env.store.getState().past).toEqual([]);
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

// The versions a page or part keeps, by name and document, oldest first.
const keptOf = (site: FakeSite, id: number) => site.versions.filter((v) => v.id === id).map((v) => [v.name, v.document]);

test("the Assistant's new site replaces a part keeping every draft it saves over: another tab's save between the version kept and the replacement is kept too, so nothing of it is lost", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const theirs: PageDocument = { ...structuredClone(original), title: "Header, from another tab" };
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  // The other tab saves once the draft read is kept, before the Assistant saves over it.
  site.onVersion = () => site.savedElsewhere(HEADER, theirs);
  let outcome: Awaited<ReturnType<Session["replacePart"]>> | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: true, replaced: theirs });
  expect(site.drafts.get(HEADER)!.document).toEqual(mine);
  // History holds both: the draft first read, and the other tab's, read after the conflict.
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original], ["Before the new site", theirs]]);
});

test("a part's save kept by the CMS but its answer lost is told by its draft read back: its saveId there, it counts as saved", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "save";
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: true, replaced: original });
  expect(site.drafts.get(HEADER)!.document).toEqual(mine);
  // Sent once, the draft it replaced kept once.
  expect(site.saves.filter((save) => save.document === mine)).toHaveLength(1);
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original]]);
});

test("a part's save whose answer is lost, its draft not to be read back either: the outcome is unknown, said so, with the draft it may have replaced", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "save and read";
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: false, unknown: true, why: "no answer came about the header's save (The save got no answer within 15 s.), and its draft could not be read back to tell whether it was kept.", replaced: original, revision: 0 });
  // The CMS kept it all the same: what the caller is to make sure of.
  expect(site.drafts.get(HEADER)!.document).toEqual(mine);
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original]]);
});

// A save of the part with no answer whose draft, read back, has not moved:
// it may land still, so however the call ends after, short of the save
// that fences it, the outcome is unknown, over the draft that save found.
test("a save of the part with no answer, its draft read back not moved, then the next read fails: unknown, over the original, at the revision that save was sent at, which lands after", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "late";
  // The first try's read, the read back, then the next try's read: no answer.
  site.reads.push(null, null, "fail");
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: false, unknown: true, why: "The network failed, and an earlier save of the header, which got no answer, may be kept still.", replaced: original, revision: 0 });
  // As it may: it lands.
  expect(site.lateSaves.map((late) => late())).toEqual(["kept"]);
  expect(site.drafts.get(HEADER)!.document).toEqual(mine);
});

test("a save of the part with no answer, its draft read back not moved, then the next try's save refused for its document: unknown all the same, the draft it found kept once, not again", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "late";
  site.reads.push(null, null, () => {
    site.refuseNext = [{ pointer: "/sections", keyword: "type", blockPointer: null, message: "must be an array" }];
  });
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: false, unknown: true, why: "must be an array, and an earlier save of the header, which got no answer, may be kept still.", replaced: original, revision: 0 });
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original]]);
  expect(site.lateSaves.map((late) => late())).toEqual(["kept"]);
});

test("every try's save of the part with no answer, each draft read back not moved, until the tries run out: unknown, over the original, at that revision; the first late save lands, the others are refused", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  const late = () => {
    site.loseAnswer = "late";
  };
  site.reads.push(late, null, late, null, late, null);
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: false, unknown: true, why: "no answer came about the header's last save, and its draft, read back, had not taken it yet: it may be kept still.", replaced: original, revision: 0 });
  expect(site.saves.map((save) => save.revision)).toEqual([0, 0, 0]);
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original]]);
  expect(site.lateSaves.map((save) => save())).toEqual(["kept", "refused", "refused"]);
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 1, document: mine });
});

test("a save of the part with no answer, its draft read back not moved, the save landing before the next read: done, the original said to be what it replaced, the canvas drawing the new part; put back, the original returns", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site, env } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "late";
  site.reads.push(null, null, () => {
    site.lateSaves[0]!();
  });
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: true, replaced: original });
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 1, document: mine });
  expect(env.ui.getState().parts.header).toEqual(mine);
  // Put back as the clean-up does when no page was made: the original returns.
  let back: PartReplaced | null = null;
  await act(async () => {
    back = await grab.session!.replacePart("header", original, "Before the new site", mine);
  });
  expect(back).toEqual({ ok: true, replaced: mine });
  expect(site.drafts.get(HEADER)!.document).toEqual(original);
  expect(env.ui.getState().parts.header).toEqual(original);
});

test("a save of the part with no answer, then another tab's save before the next read: the first can never land, so a refusal after is a sure one, and it is refused when it comes", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const theirs: PageDocument = { ...structuredClone(original), title: "Header, from another tab" };
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "late";
  site.reads.push(null, null, () => {
    site.savedElsewhere(HEADER, theirs);
    site.refuseNext = [{ pointer: "/sections", keyword: "type", blockPointer: null, message: "must be an array" }];
  });
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: false, why: "must be an array" });
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original], ["Before the new site", theirs]]);
  expect(site.lateSaves.map((late) => late())).toEqual(["refused"]);
  expect(site.drafts.get(HEADER)!.document).toEqual(theirs);
});

test("saves of the part with no answer until the last, whose draft read back is moved on by another tab's save: none can land any more, and the tries run out as a sure failure", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const theirs: PageDocument = { ...structuredClone(original), title: "Header, from another tab" };
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  const late = () => {
    site.loseAnswer = "late";
  };
  site.reads.push(late, null, late, null, late, () => site.savedElsewhere(HEADER, theirs));
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: false, why: "the header was saved somewhere else each time the Assistant went to replace it: it is left as it is there, each draft it met kept as a version, “Before the new site”." });
  expect(site.lateSaves.map((save) => save())).toEqual(["refused", "refused", "refused"]);
  expect(site.drafts.get(HEADER)!.document).toEqual(theirs);
});

test("a part's save that may land late, its answer lost and its draft not to be read back: put back at the revision read, though the draft is the document already, the late save is refused when it comes", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "late and read";
  let first: PartReplaced | null = null;
  await act(async () => {
    first = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(first).toMatchObject({ ok: false, unknown: true, replaced: original, revision: 0 });
  // Not kept yet: the draft is the original still, at the revision the save was sent at.
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 0, document: original });
  let back: PartReplaced | null = null;
  await act(async () => {
    back = await grab.session!.replacePart("header", original, "Before the new site", mine, 0);
  });
  expect(back).toEqual({ ok: true, replaced: original });
  // Saved again at revision 0, and nothing kept for it: nothing was lost.
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 1, document: original });
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original]]);
  // The late save lands: refused, the draft moved on.
  expect(site.lateSaves.map((late) => late())).toEqual(["refused"]);
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 1, document: original });
});

test("the save that fences a doubtful one, its own answer lost too: the draft read back, the document but not moved on, tells nothing, and it is sent again", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "late and read";
  await act(async () => {
    await grab.session!.replacePart("header", mine, "Before the new site");
  });
  site.loseAnswer = "late";
  let back: PartReplaced | null = null;
  await act(async () => {
    back = await grab.session!.replacePart("header", original, "Before the new site", mine, 0);
  });
  expect(back).toEqual({ ok: true, replaced: original });
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 1, document: original });
  // Both saves sent at revision 0 come late, and are refused.
  expect(site.lateSaves.map((late) => late())).toEqual(["refused", "refused"]);
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 1, document: original });
});

test("a part found saved already once the doubt about its save is cleared: the canvas draws the part as stored", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site, env } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.loseAnswer = "save and read";
  let first: PartReplaced | null = null;
  await act(async () => {
    first = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(first).toMatchObject({ ok: false, unknown: true, revision: 0 });
  // Kept by the CMS, unknown to the editor: the canvas draws the old header still.
  expect(site.drafts.get(HEADER)).toMatchObject({ revision: 1, document: mine });
  expect(env.ui.getState().parts.header).not.toEqual(mine);
  let again: PartReplaced | null = null;
  await act(async () => {
    again = await grab.session!.replacePart("header", mine, "Before the new site", mine, 0);
  });
  // Moved past the revision the doubtful save was sent at: nothing to save, the canvas told.
  expect(again).toEqual({ ok: true, replaced: mine });
  expect(site.drafts.get(HEADER)!.revision).toBe(1);
  expect(env.ui.getState().parts.header).toEqual(mine);
});

test("a part open in the editor at the revision a doubtful save was sent at, holding the document already: what became of that save is still unknown, said so", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site, env } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  fireEvent.click(screen.getByRole("button", { name: "Header" }));
  await screen.findByRole("button", { name: "Switch page. Open: Header" });
  const held = env.store.getState().document;
  let outcome: PartReplaced | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", held, "Before the new site", null, 0);
  });
  expect(outcome).toEqual({ ok: false, unknown: true, why: "what became of the header's earlier save cannot be told yet: the editor holds the header at the revision it was sent at, with nothing to save that would settle it.", replaced: held, revision: 0 });
  // With no save in doubt, the same is so already.
  await act(async () => {
    outcome = await grab.session!.replacePart("header", held, "Before the new site");
  });
  expect(outcome).toEqual({ ok: true, replaced: held });
  expect(site.saves).toEqual([]);
});

test("replaced again over its own draft, a part keeps no version of it; a draft saved elsewhere since is kept first", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const first: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  const second: PageDocument = { schemaVersion: 1, title: "Header", sticky: true, sections: [] };
  const replace = (document: PageDocument, ours: PageDocument | null) => act(async () => {
    await grab.session!.replacePart("header", document, "Before the new site", ours);
  });
  await replace(first, null);
  await replace(second, first);
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original]]);
  const theirs: PageDocument = { ...second, title: "Header, from another tab" };
  site.savedElsewhere(HEADER, theirs);
  await replace(first, second);
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original], ["Before the new site", theirs]]);
  expect(site.drafts.get(HEADER)!.document).toEqual(first);
});

test("a part open in the editor takes the Assistant's document as a step; another tab's save meanwhile meets the editor's conflict, and Keep mine keeps that one as a version", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site, env, clock } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  fireEvent.click(screen.getByRole("button", { name: "Header" }));
  await screen.findByRole("button", { name: "Switch page. Open: Header" });
  const original = structuredClone(site.drafts.get(HEADER)!.document);
  const theirs: PageDocument = { ...structuredClone(original), title: "Header, from another tab" };
  const mine: PageDocument = { schemaVersion: 1, title: "Header", sections: [] };
  site.onVersion = () => site.savedElsewhere(HEADER, theirs);
  let outcome: Awaited<ReturnType<Session["replacePart"]>> | null = null;
  await act(async () => {
    outcome = await grab.session!.replacePart("header", mine, "Before the new site");
  });
  expect(outcome).toEqual({ ok: false, why: "the header was saved in another tab meanwhile: Reload takes that one, Keep mine saves the Assistant's over it, keeping that one as a version." });
  expect(env.store.getState().past.at(-1)?.command.label).toBe("Assistant replaced the header");
  // Nothing of the other tab's is lost: it is the draft still.
  expect(site.drafts.get(HEADER)!.document).toEqual(theirs);
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original]]);
  await act(async () => fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Keep mine" })));
  await act(() => clock.advance(1_000));
  await waitFor(() => expect(site.drafts.get(HEADER)!.document).toEqual(mine));
  expect(keptOf(site, HEADER)).toEqual([["Before the new site", original], ["Before Keep mine", theirs]]);
});

test("the Assistant's change of a page not open: its draft read, changed and saved at the revision read; a save from elsewhere before it is read and changed again, nothing of it lost", async () => {
  const grab: { session: Session | null } = { session: null };
  const { site } = start(1, { foot: <Grab onSession={(session) => (grab.session = session)} /> });
  await opened();
  const theirs: PageDocument = { ...structuredClone(site.drafts.get(2)!.document), title: "Home, from another tab" };
  site.onDraft = () => site.savedElsewhere(2, theirs);
  let why: string | null | undefined;
  await act(async () => {
    why = await grab.session!.changeDraft(2, (doc) => ({ document: { ...doc, description: "Changed by the Assistant." }, label: "Assistant changed the page" }));
  });
  expect(why).toBeNull();
  expect(site.drafts.get(2)!.document).toEqual({ ...theirs, description: "Changed by the Assistant." });
  // Saved at the revision first read, which met the conflict; then at the other tab's.
  expect(site.saves.map((save) => [save.revision, save.document.title])).toEqual([[1, "Home"], [2, "Home, from another tab"]]);
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

test("a change of the site style that takes the place of one waiting its turn keeps the custom CSS that one held", async () => {
  const { site, env, clock } = start(1);
  await opened();
  let release = () => {};
  site.styleGate = new Promise((done) => {
    release = done;
  });
  // A tone on its way to the CMS, held there.
  fireEvent.click(screen.getByRole("button", { name: "Site style" }));
  fireEvent.click(screen.getByRole("button", { name: /^Primary/ }));
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Harbour" })));
  // Custom CSS kept after its pause, behind it.
  fireEvent.click(screen.getByRole("button", { name: "Back to Page" }));
  fireEvent.click(screen.getByRole("button", { name: "Custom CSS" }));
  fireEvent.change(screen.getByLabelText("Rules"), { target: { value: ".hero { color: red; }" } });
  await act(() => clock.advance(1_000));
  // Another tone, which takes the waiting change's place.
  fireEvent.click(screen.getByRole("button", { name: "Back to Page" }));
  fireEvent.click(screen.getByRole("button", { name: "Site style" }));
  fireEvent.click(screen.getByRole("button", { name: /^Primary/ }));
  await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Kelp" })));
  site.styleGate = null;
  await act(async () => release());
  await waitFor(() => expect(site.styles).toHaveLength(2));
  expect(site.styles[1]).toMatchObject({ palette: { primary: "site-kelp" }, customCss: ".hero { color: red; }" });
  await waitFor(() => expect(document.querySelector(".style-save")?.textContent).toBe("Saved for every page"));
  expect(env.ui.getState().siteStyle).toMatchObject({ palette: { primary: "site-kelp" }, customCss: ".hero { color: red; }" });
});

test("custom CSS waiting for its pause goes when the tab closes; CSS that does not keep to the site stays a draft the close warns of, shown again when the panel opens", async () => {
  const { site } = start(1);
  await opened();
  fireEvent.click(screen.getByRole("button", { name: "Custom CSS" }));
  fireEvent.change(screen.getByLabelText("Rules"), { target: { value: ".hero { color: red; }" } });
  // The tab closing before the pause: the CSS is handed over, on its way.
  window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
  expect(site.styles.map((style) => style.customCss)).toEqual([".hero { color: red; }"]);
  await waitFor(() => expect(document.querySelector(".style-save")?.textContent).toBe("Saved for every page"));
  // CSS that does not keep to the site, kept nowhere: the close asks.
  fireEvent.change(screen.getByLabelText("Rules"), { target: { value: ".hero { color: red; }\n}" } });
  fireEvent.blur(screen.getByLabelText("Rules"));
  const closing = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);
  expect(site.styles).toHaveLength(1);
  // The panel closed and opened again: the draft, as written.
  fireEvent.click(screen.getByRole("button", { name: "Back to Page" }));
  fireEvent.click(screen.getByRole("button", { name: "Custom CSS" }));
  expect((screen.getByLabelText("Rules") as HTMLTextAreaElement).value).toBe(".hero { color: red; }\n}");
  expect(screen.getByText(/^Line 2: This \} closes nothing\./)).toBeTruthy();
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

test("a collection's template named by the address opens again, drawn with its first published entry; with no collections kept, the home page opens", async () => {
  const { written } = start(TEMPLATE, { collections: true });
  await screen.findByRole("button", { name: "Switch page. Open: News" });
  expect(written).toEqual([TEMPLATE]);
  expect(await screen.findByRole("heading", { level: 1, name: "Dawn swims" })).toBeTruthy();
  cleanup();

  start(TEMPLATE);
  await screen.findByRole("button", { name: "Switch page. Open: Home" });
});

// No answer from the storage, as a dropped connection gives.
const NO_ANSWER = new StorageError({ kind: "unknown", cause: "network", status: null, message: "The CMS did not answer." });

test("a template named by the address opens though the collections cannot be read, and the notice says they could not be", async () => {
  const { env, written } = start(TEMPLATE, { collections: true, refuseCollections: NO_ANSWER });
  await screen.findByRole("button", { name: "Switch page. Open: News" });
  expect(written).toEqual([TEMPLATE]);
  expect(env.ui.getState().notice).toBe("The collections could not be read (The CMS did not answer.): lists and Field blocks show what was read before, if anything, until Collections closes and reads them again.");
});

test("an address naming a page no longer there opens the home page; one that cannot be read now stops the start, and Try again opens it", async () => {
  start(999, { collections: true });
  await screen.findByRole("button", { name: "Switch page. Open: Home" });
  cleanup();

  const { written } = start(TEMPLATE, { collections: true, refusePageOnce: NO_ANSWER });
  const alert = await screen.findByRole("alert");
  expect(alert.querySelector("p")?.textContent).toBe("The editor could not start: The CMS did not answer.");
  expect(written).toEqual([]);
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "Switch page. Open: News" });
  expect(written).toEqual([TEMPLATE]);
});

test("a template opened while the collections cannot be read finds its collection once Collections closes and reads them: its fields draw, its Page tab names it, and a preview entry chosen before is kept", async () => {
  const { env, site } = start(TEMPLATE, { collections: true, refuseCollections: NO_ANSWER });
  await screen.findByRole("button", { name: "Switch page. Open: News" });
  fireEvent.click(within(screen.getByRole("complementary", { name: "Settings" })).getByRole("tab", { name: "Page" }));
  expect(screen.getByText("Template of its collection")).toBeTruthy();
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  act(() => env.ui.getState().setPreviewEntry({ collectionId: 3, choice: "sample" }));

  site.refuseCollections = null;
  act(() => env.ui.getState().setCollections({ collectionId: 3, tab: "entries" }));
  act(() => env.ui.getState().setCollections(null));
  expect(await screen.findByRole("heading", { level: 1, name: "The title of an entry" })).toBeTruthy();
  expect(screen.getByText("Template of News")).toBeTruthy();
  expect(env.ui.getState().previewEntry).toEqual({ collectionId: 3, choice: "sample" });
});

test("a collection's template chosen in the page switch opens through the shell, the page's edit waiting saved first; published, the switch says so once the template is left", async () => {
  const { site, written } = start(1, { collections: true });
  await opened();
  const rows = (scope: HTMLElement) => [...scope.querySelectorAll(".page-row")].map((row) => row.textContent);
  const templates = () => within(screen.getByRole("dialog", { name: "Pages" })).getByRole("list", { name: "Templates" });
  relabel("Winter");
  expect(site.saves).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Winter series" }));
  expect(rows(templates())).toEqual(["NewsEvery entryNot published yet"]);
  fireEvent.click(within(templates()).getByRole("button", { name: /^News/ }));
  await screen.findByRole("button", { name: "Switch page. Open: News" });
  expect(site.saves).toHaveLength(1);
  expect(site.drafts.get(1)!.document.sections[0]!.props.label).toBe("Winter");
  expect(written).toEqual([1, TEMPLATE]);
  expect(await screen.findByRole("heading", { level: 1, name: "Dawn swims" })).toBeTruthy();

  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish" })));
  expect(site.publishes).toEqual([{ id: TEMPLATE, revision: 1 }]);
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: News" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Pages" })).getByRole("button", { name: /^Winter series/ }));
  await screen.findByRole("button", { name: "Switch page. Open: Winter series" });
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Winter series" }));
  await waitFor(() => expect(rows(templates())).toEqual(["NewsEvery entryPublished"]));
});

test("a template's publish set for a time, once the time comes and the template is read again, is listed live in the page switch when the template is left", async () => {
  const { site, clock } = start(TEMPLATE, { schedule: true, collections: true });
  await screen.findByRole("button", { name: "Switch page. Open: News" });
  await scheduleFor("Oct 2, 2026", "3:00 PM");
  site.fire(TEMPLATE);
  await act(() => clock.advance(5 * 3_600_000 + 1_000));
  await waitFor(() => expect(document.querySelector(".tb-status")?.textContent).toBe("Published"));
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: News" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Pages" })).getByRole("button", { name: /^Home/ }));
  await screen.findByRole("button", { name: "Switch page. Open: Home" });
  fireEvent.click(screen.getByRole("button", { name: "Switch page. Open: Home" }));
  const templates = within(screen.getByRole("dialog", { name: "Pages" })).getByRole("list", { name: "Templates" });
  await waitFor(() => expect([...templates.querySelectorAll(".page-row")].map((row) => row.textContent)).toEqual(["NewsEvery entryPublished"]));
});

test("of two reads of the collections, the later one asked for stands: a slow one that ends after it changes nothing", async () => {
  const { env, site } = start(TEMPLATE, { collections: true });
  expect(await screen.findByRole("heading", { level: 1, name: "Dawn swims" })).toBeTruthy();
  const closeCollections = () => {
    act(() => env.ui.getState().setCollections({ collectionId: 3, tab: "entries" }));
    act(() => env.ui.getState().setCollections(null));
  };
  // The first read, slow, finds the entry as it is now.
  let release = () => {};
  site.entriesGate = new Promise<void>((done) => {
    release = done;
  });
  const before = site.entriesReads;
  closeCollections();
  await waitFor(() => expect(site.entriesReads).toBe(before + 1));
  // Renamed in Collections, which closes again: the second read is quick.
  site.entryTitle = "Dawn swims, renamed";
  closeCollections();
  expect(await screen.findByRole("heading", { level: 1, name: "Dawn swims, renamed" })).toBeTruthy();
  await act(async () => {
    release();
    await new Promise((done) => setTimeout(done, 0));
  });
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Dawn swims, renamed");
  expect(env.ui.getState().siteEntries?.entries.get(3)?.[0]?.title).toBe("Dawn swims, renamed");
});

test("the shop's settings, which the canvas draws prices and Add to cart with, are read as the editor starts and again when the Shop screen closes", async () => {
  const { env, site } = start(TEMPLATE, { collections: true, shop: { enabled: false, currency: "GBP", productsCollectionId: null, priceField: null } });
  await screen.findByRole("button", { name: "Switch page. Open: News" });
  expect(env.ui.getState().siteShop).toEqual({ enabled: false, currency: "GBP", productsCollectionId: null, priceField: null });
  expect(site.shopReads).toBe(1);
  site.shop = { enabled: true, currency: "EUR", productsCollectionId: 3, priceField: "price" };
  act(() => env.ui.getState().setShopOpen(true));
  act(() => env.ui.getState().setShopOpen(false));
  await waitFor(() => expect(env.ui.getState().siteShop).toEqual({ enabled: true, currency: "EUR", productsCollectionId: 3, priceField: "price" }));
  // The start, the screen's own as it opens, and once it closes.
  expect(site.shopReads).toBe(3);
});

test("a storage that keeps no shop is never asked for one", async () => {
  const { env, site } = start(1, { collections: true });
  await opened();
  expect(env.ui.getState().siteShop).toBeNull();
  expect(site.shopReads).toBe(0);
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
