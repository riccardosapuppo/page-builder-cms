// The shell's versions, on a storage adapter of the test's own that keeps
// a draft and its versions by the CMS's rules (a restore keeps the draft
// it replaces, raises the revision and clears the last save id):
// - a restore sends the edit waiting first, so the version kept of the
//   draft before it holds that edit; the restored draft takes the canvas,
//   undo starts again and the notice says why; the next edit saves from
//   the restored revision, with no conflict;
// - an edit made while the restore travels is not dropped: its save meets
//   the conflict, the banner asks, and Reload takes the restored page;
// - nothing is restored while the save cannot be confirmed;
// - a restore or a version whose answer never comes says it may have been
//   made, and nothing on the page moves;
// - "Save version" sends the edit waiting first, so the version holds it;
// - a read of the versions that only a reload gets past offers Reload this
//   tab, any other failed read Try again.
// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { counter, page } from "../../test/document-page.ts";
import { openGroups } from "../../test/editor-kit.tsx";
import { FakeClock } from "../../test/fake-clock.ts";
import tokens from "../../../schema/tokens.json";
import type { PageDocument } from "../shared/document.ts";
import { StorageError, type DraftSave, type Page, type SiteStyle, type StorageAdapter, type Version } from "../storage/adapter.ts";
import { createEditorStore } from "../store/editor-store.ts";
import { App, NO_PAGE } from "./App.tsx";
import { thisTab } from "./SaveStatus.tsx";
import { createUiStore } from "./ui-store.ts";

const T = "2026-10-02T08:00:00.000Z";
const SITE = { name: "Slack Water", menu: [], action: null, footer: { lead: "Slack Water.", text: "A guide." }, timeZone: "Europe/London", revision: 0, updatedAt: null };
const LINKS = { self: "/api/pages/1", draft: "/api/pages/1/draft", versions: "/api/pages/1/versions", publish: "/api/pages/1/publish", schedules: "/api/pages/1/schedules", preview: "/preview/1", live: null };
// The site style as a new site has it, from the tokens.
const SLOTS = ["text", "background", "primary", "accent", "soft", "muted"] as const;
const STYLE: SiteStyle = {
  palette: Object.fromEntries(SLOTS.map((slot) => [slot, tokens["site-tones"][slot].default])),
  typeScale: "balanced",
  updatedAt: null,
  choices: { palette: {}, typeScales: [] },
};

const labelled = (label: string): PageDocument => {
  const document = page();
  document.sections[0]!.props.label = label;
  return document;
};
const firstLabel = (document: PageDocument) => document.sections[0]!.props.label;

type Kept = Version & { document: PageDocument };

class VersionSite {
  revision = 3;
  lastSaveId: string | null = null;
  document = labelled("Hero");
  readonly saves: DraftSave[] = [];
  readonly restores: number[] = [];
  readonly versions: Kept[] = [{ number: 1, reason: "manual", name: "First draft", restoredFrom: null, createdAt: "2026-09-27T21:15:00.000Z", published: false, document: labelled("First") }];
  // A restore waits for this, when a test holds it back.
  gate: Promise<void> | null = null;

  private keep(reason: Version["reason"], document: PageDocument, extra: Partial<Version> = {}): Kept {
    const kept: Kept = { number: this.versions.length + 1, reason, name: null, restoredFrom: null, createdAt: T, published: false, ...extra, document: structuredClone(document) };
    this.versions.push(kept);
    return kept;
  }

  adapter(): StorageAdapter {
    const strip = ({ document: _document, ...version }: Kept): Version => version;
    const draft = () => ({ revision: this.revision, lastSaveId: this.lastSaveId, updatedAt: T, document: structuredClone(this.document) });
    const partial: Partial<StorageAdapter> = {
      name: "fake",
      capabilities: { publish: true, schedule: false, responses: false, headerFooter: false, imageVariants: false, livePages: true },
      listPages: async () => [{ id: 1, title: "Winter series", slug: "winter-series", home: false, revision: this.revision, updatedAt: T, published: null, scheduled: null, links: LINKS }],
      getPage: async (): Promise<Page> => ({ page: { id: 1, title: "Winter series", slug: "winter-series", home: false, createdAt: T }, draft: draft(), published: null, scheduled: null, links: LINKS }),
      getDraft: async () => draft(),
      listMedia: async () => [],
      getSiteStyle: async () => STYLE,
      getSite: async () => SITE,
      saveDraft: async (_id, save) => {
        this.saves.push(save);
        if (save.revision !== this.revision) return { ok: false, problem: { kind: "conflict", message: "moved", currentRevision: this.revision, lastSaveId: this.lastSaveId } };
        this.revision += 1;
        this.lastSaveId = save.saveId;
        this.document = structuredClone(save.document);
        return { ok: true, value: { revision: this.revision, lastSaveId: save.saveId, updatedAt: T } };
      },
      listVersions: async () => this.versions.toReversed().map(strip),
      saveVersion: async (_id, request = {}) => ({ ok: true, value: strip(this.keep("manual", this.document, { name: request.name ?? null })) }),
      restoreVersion: async (_id, number) => {
        this.restores.push(number);
        if (this.gate) await this.gate;
        const source = this.versions.find((v) => v.number === number)!;
        const newest = this.versions.at(-1);
        const kept = JSON.stringify(newest?.document) === JSON.stringify(this.document) ? null : this.keep("before-restore", this.document);
        this.document = structuredClone(source.document);
        this.revision += 1;
        this.lastSaveId = null;
        const version = this.keep("restore", this.document, { restoredFrom: number });
        return { ok: true, value: { draft: draft(), version: strip(version), kept: kept && strip(kept) } };
      },
    };
    return partial as StorageAdapter;
  }
}

async function start(site = new VersionSite(), adapter: StorageAdapter = site.adapter()) {
  const clock = new FakeClock(Date.UTC(2026, 9, 2, 9));
  const env = { store: createEditorStore({ document: NO_PAGE, now: () => clock.now() }), ui: createUiStore(), clock, newId: counter("n") };
  render(<App env={env} adapter={adapter} address={{ read: () => 1, write: () => {} }} cmsOrigin="http://127.0.0.1:3900" tabs={{ open: () => true }} />);
  await screen.findByRole("button", { name: /^Switch page\. Open:/ });
  act(() => env.ui.getState().setHistoryOpen(true));
  const versions = await screen.findByRole("list", { name: "Versions" });
  await waitFor(() => expect(within(versions).getAllByRole("button", { name: /^Restore: / })).toHaveLength(site.versions.length));
  return { env, site, clock };
}

// The first section's label, edited in its panel and handed over: an edit
// the autosave holds for its pause.
function relabel(env: Awaited<ReturnType<typeof start>>["env"], label: string) {
  act(() => env.store.getState().select("hero"));
  openGroups("Name and link");
  const field = screen.getByLabelText("Section label");
  fireEvent.change(field, { target: { value: label } });
  fireEvent.blur(field);
}

const restoreButton = (name: RegExp) => within(screen.getByRole("list", { name: "Versions" })).getByRole("button", { name });

test("a restore sends the edit waiting first, puts the restored draft on the canvas, says why undo starts again, and the next edit saves from its revision", async () => {
  const { env, site, clock } = await start();
  relabel(env, "Edited");
  expect(env.store.getState().past).toHaveLength(1);
  expect(site.saves).toHaveLength(0);

  await act(async () => fireEvent.click(restoreButton(/^Restore: Saved, First draft/)));
  // The edit went first, so the version the restore kept of the draft
  // holds it.
  expect(site.saves.map((s) => [s.revision, firstLabel(s.document)])).toEqual([[3, "Edited"]]);
  expect(site.restores).toEqual([1]);
  expect(site.versions.map((v) => [v.reason, firstLabel(v.document)])).toEqual([["manual", "First"], ["before-restore", "Edited"], ["restore", "First"]]);

  await waitFor(() => expect(firstLabel(env.store.getState().document)).toBe("First"));
  expect(env.store.getState().past).toEqual([]);
  expect(env.ui.getState().notice).toMatch(/^Restored “First draft”, saved on Sep 27 at \d+:15 PM\. The draft it replaced is kept in Versions, as “Before restoring”\. Undo starts again from here: its steps belonged to the page that was replaced\.$/);
  // The list shows the restore and the version kept before it.
  const list = screen.getByRole("list", { name: "Versions" });
  await waitFor(() => expect(within(list).getAllByRole("button", { name: /^Restore: / }).map((b) => b.getAttribute("aria-label")?.split(",")[0])).toEqual(["Restore: Restored", "Restore: Before restoring", "Restore: Saved"]));
  expect(within(list).getAllByRole("listitem")[1]!.querySelector(".ver-name")?.textContent).toMatch(/^From “First draft”, Sep 27, /);

  // The restored draft is this tab's: the next edit is saved from its
  // revision, with no conflict.
  relabel(env, "After the restore");
  await act(() => clock.advance(1_000));
  expect(site.saves.map((s) => [s.revision, firstLabel(s.document)]).at(-1)).toEqual([5, "After the restore"]);
  await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === "Saved")).toBe(true));
  expect(site.revision).toBe(6);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("an edit made while the restore travels is not dropped: its save meets the conflict, the banner asks, and Reload takes the restored page", async () => {
  const site = new VersionSite();
  let release = () => {};
  site.gate = new Promise<void>((done) => {
    release = done;
  });
  const { env } = await start(site);
  let restoring!: Promise<void>;
  act(() => {
    fireEvent.click(restoreButton(/^Restore: Saved, First draft/));
  });
  await waitFor(() => expect(site.restores).toEqual([1]));
  expect(restoreButton(/^Restore: Saved, First draft/).textContent).toBe("Restoring…");
  relabel(env, "Typed meanwhile");
  restoring = act(async () => release());
  await restoring;

  // The edit was sent from the revision before the restore: a conflict.
  await waitFor(() => expect(site.saves.map((s) => [s.revision, firstLabel(s.document)])).toEqual([[3, "Typed meanwhile"]]));
  const banner = await screen.findByRole("alert");
  expect(banner.textContent).toContain("Changed in another tab.");
  expect(firstLabel(env.store.getState().document)).toBe("Typed meanwhile");
  expect(env.ui.getState().notice).toBe("Restored on the server, but this tab changed the page while the restore was on its way. Reload takes the restored page; Keep mine saves this tab’s page over it.");

  await act(async () => fireEvent.click(within(banner).getByRole("button", { name: "Reload" })));
  await waitFor(() => expect(firstLabel(env.store.getState().document)).toBe("First"));
  expect(env.ui.getState().notice).toBe("Reloaded: this is the page as it is on the server. Undo brings this tab’s page back.");
  // The words typed meanwhile are a step away.
  expect(env.store.getState().past.map((e) => e.command.label)).toEqual(["Renamed section to Typed meanwhile", "Reloaded the page saved in another tab"]);
});

test("nothing is restored while this tab's save cannot be confirmed: a conflict is settled first", async () => {
  const { env, site } = await start();
  // Another tab saves; this tab's edit then meets the conflict.
  site.revision += 1;
  relabel(env, "Mine");
  await act(async () => fireEvent.click(restoreButton(/^Restore: Saved, First draft/)));
  expect(site.restores).toEqual([]);
  expect(env.ui.getState().notice).toBe("Not restored: the page was changed in another tab. Choose Reload or Keep mine first.");
  expect(firstLabel(env.store.getState().document)).toBe("Mine");
});

test("a restore or a version whose answer never comes says it may have been made, and the page stays as it is", async () => {
  const site = new VersionSite();
  const adapter = site.adapter();
  const lost = () => Promise.reject(new StorageError({ kind: "unknown", cause: "network", status: null, message: "Failed to fetch" }));
  const { env } = await start(site, { ...adapter, restoreVersion: lost, saveVersion: lost });
  await act(async () => fireEvent.click(restoreButton(/^Restore: Saved, First draft/)));
  expect(env.ui.getState().notice).toBe("No answer from the CMS about the restore (Failed to fetch): it may have been made. If it was, the editor asks you to choose before it saves this page again.");
  expect(firstLabel(env.store.getState().document)).toBe("Hero");
  expect(restoreButton(/^Restore: Saved, First draft/).textContent).toBe("Restore");

  fireEvent.click(screen.getByRole("button", { name: "Save version" }));
  const name = screen.getByRole("textbox", { name: /^Name/ });
  await act(async () => fireEvent.submit(name.closest("form")!));
  await waitFor(() => expect(screen.getByText("No answer from the CMS (Failed to fetch): the version may have been kept. The list below shows what it has.")).toBeTruthy());
  // The field stays, with what was typed, to try again.
  expect(screen.getByRole("textbox", { name: /^Name/ })).toBeTruthy();
});

test("Save version sends the edit waiting first, so the version holds what the canvas shows, and the list shows it under its name", async () => {
  const { env, site } = await start();
  relabel(env, "Kept as shown");
  fireEvent.click(screen.getByRole("button", { name: "Save version" }));
  const name = screen.getByRole("textbox", { name: /^Name/ });
  fireEvent.change(name, { target: { value: "  Before the winter series " } });
  await act(async () => fireEvent.submit(name.closest("form")!));
  expect(site.saves.map((s) => firstLabel(s.document))).toEqual(["Kept as shown"]);
  expect(site.versions.at(-1)).toMatchObject({ reason: "manual", name: "Before the winter series" });
  expect(firstLabel(site.versions.at(-1)!.document)).toBe("Kept as shown");
  expect(env.ui.getState().notice).toBe("Kept as a version: “Before the winter series”.");
  await waitFor(() => expect(within(screen.getByRole("list", { name: "Versions" })).getAllByRole("listitem")[1]!.textContent).toContain("Before the winter series"));
  // The undo history is the page's own, and stays.
  expect(env.store.getState().past).toHaveLength(1);
});

// A read of the versions refused in words that only a reload of this tab
// gets past (the browser's storage deleted in another tab: every read is
// refused the same way from then on) offers Reload this tab, not a Try
// again that would be refused again; a read that may go through next time
// (no answer) keeps Try again.
test("a read of the versions only a reload gets past offers Reload this tab; one that failed for want of an answer offers Try again", async () => {
  const site = new VersionSite();
  const adapter = site.adapter();
  const listVersions = adapter.listVersions.bind(adapter);
  let failure: StorageError | null = null;
  adapter.listVersions = async (id) => {
    if (failure) throw failure;
    return listVersions(id);
  };
  const { env } = await start(site, adapter);
  const reopen = async () => {
    act(() => env.ui.getState().setHistoryOpen(false));
    act(() => env.ui.getState().setHistoryOpen(true));
    return within(await screen.findByRole("complementary", { name: "History" }));
  };
  const reloads = vi.spyOn(thisTab, "reload").mockImplementation(() => {});
  try {
    const deleted = "This browser's storage for the editor was deleted in another tab: reload this tab.";
    failure = new StorageError({ kind: "refused", status: 0, code: "storage_deleted", message: deleted });
    let history = await reopen();
    await history.findByText(`The versions could not be read: ${deleted}`);
    expect(history.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(history.getByRole("button", { name: "Reload this tab" }));
    expect(reloads).toHaveBeenCalledTimes(1);

    failure = new StorageError({ kind: "unknown", cause: "network", status: null, message: "No answer from the CMS (Failed to fetch)." });
    history = await reopen();
    await history.findByText("The versions could not be read: No answer from the CMS (Failed to fetch).");
    expect(history.queryByRole("button", { name: "Reload this tab" })).toBeNull();
    failure = null;
    fireEvent.click(history.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(history.getAllByRole("button", { name: /^Restore: / })).toHaveLength(site.versions.length));
    expect(history.queryByText(/could not be read/)).toBeNull();
  } finally {
    reloads.mockRestore();
  }
});
