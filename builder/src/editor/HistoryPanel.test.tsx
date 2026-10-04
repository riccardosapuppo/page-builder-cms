// The history panel and the top bar's undo and redo, on a page of the
// test's own: this session's steps newest first, the undone ones on top;
// choosing a step undoes or redoes up to it, to the very document the page
// had right after it; text still waiting in a field goes first, and a
// step it ends is gone, said, and nothing moves. The versions as the CMS
// lists them, with no author, the live one marked; Restore asks the
// session, once at a time; "Save version" asks for a name and shows the
// CMS's refusal of it.
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { expect, test } from "vitest";
import { editorKit, type Kit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import { makeDelete, makeSetProps, type Made } from "../document/commands.ts";
import type { PageDocument } from "../shared/document.ts";
import type { FieldError, Version } from "../storage/adapter.ts";
import { HistoryPanel } from "./HistoryPanel.tsx";
import { stepTime } from "./history-words.ts";
import { NO_VERSIONS, type OpenPage, type Session } from "./session.tsx";
import { TopBar } from "./TopBar.tsx";

const open: OpenPage = { id: 1, slug: "winter-series", home: false, published: null, revision: 3, links: { preview: "/preview/1", live: null } };

function apply(kit: Kit, make: (doc: PageDocument) => Made): PageDocument {
  const made = make(kit.doc());
  if (!made.ok) throw new Error(made.error.message);
  const outcome = kit.store.getState().dispatch(made.command);
  if (!outcome.ok) throw new Error(outcome.error.message);
  return kit.doc();
}

// Three steps, a minute apart on the kit's clock, and the page after each.
function threeSteps(kit: Kit): PageDocument[] {
  const pages = [kit.doc()];
  pages.push(apply(kit, (doc) => makeDelete(doc, "d1")));
  kit.clock.advance(60_000);
  pages.push(apply(kit, (doc) => makeSetProps(doc, "b1", { label: "Sign up" })));
  kit.clock.advance(60_000);
  pages.push(apply(kit, (doc) => makeDelete(doc, "q1")));
  return pages;
}

const steps = () => within(screen.getByRole("list", { name: "This session" })).getAllByRole("button");
const stepText = () => steps().map((b) => [b.querySelector(".hist-what")?.textContent, b.querySelector(".hist-when")?.textContent, b.getAttribute("aria-current")]);

test("this session's steps are listed newest first, the undone ones on top, the page's place among them marked", () => {
  const kit = editorKit({ document: page(), session: { current: open } });
  threeSteps(kit);
  act(() => void kit.store.getState().undo());
  kit.render(<HistoryPanel />);
  const at = kit.store.getState().past.map((e) => stepTime(e.at, kit.clock.now()));
  expect(stepText()).toEqual([
    ["Deleted Quote in Join", "Undone", null],
    ["Changed Button text in Hero", at[1], "step"],
    ["Deleted Divider in Join", at[0], null],
  ]);
  expect(at[0]).toMatch(/^Today, /);
});

test("choosing a step undoes or redoes up to it, to the page as it was right after it, and says so", () => {
  const kit = editorKit({ document: page(), session: { current: open } });
  const pages = threeSteps(kit);
  kit.render(<HistoryPanel />);
  fireEvent.click(steps()[2]!);
  expect(kit.doc()).toEqual(pages[1]);
  expect(kit.store.getState().future).toHaveLength(2);
  expect(kit.ui.getState().notice).toBe("Undid 2 steps: the page is as it was right after “Deleted Divider in Join”.");
  expect(steps()[2]!.getAttribute("aria-current")).toBe("step");

  // The undone step on top: everything is redone, to the very same page.
  fireEvent.click(steps()[0]!);
  expect(kit.doc()).toEqual(pages[3]);
  expect(kit.store.getState().future).toHaveLength(0);
  expect(kit.ui.getState().notice).toBe("Redid 2 steps: the page is as it was right after “Deleted Quote in Join”.");

  // The step the page is at already: nothing happens.
  const before = kit.doc();
  fireEvent.click(steps()[0]!);
  expect(kit.doc()).toBe(before);
});

test("text waiting in a field goes first; a step it ends is gone, which is said, and nothing moves", () => {
  const kit = editorKit({ document: page(), session: { current: open } });
  threeSteps(kit);
  act(() => void kit.store.getState().undo());
  // A field holds text: handed over, it becomes a new step.
  const release = kit.ui.getState().pending.hold(() => {
    release();
    apply(kit, (doc) => makeSetProps(doc, "h1", { text: "Spring series" }));
  });
  kit.render(<HistoryPanel />);
  const undone = steps()[0]!;
  expect(undone.textContent).toContain("Deleted Quote in Join");
  fireEvent.click(undone);
  expect(kit.store.getState().future).toHaveLength(0);
  expect(kit.store.getState().past.at(-1)?.command.label).toBe("Changed Heading in Hero");
  expect(kit.ui.getState().notice).toBe("That step is gone: a newer change replaced what could be redone.");
  expect(stepText().map((s) => s[0])).toEqual(["Changed Heading in Hero", "Changed Button text in Hero", "Deleted Divider in Join"]);
});

const version = (number: number, reason: Version["reason"], createdAt: string, extra: Partial<Version> = {}): Version => ({ number, reason, name: null, restoredFrom: null, createdAt, published: false, ...extra });

test("the versions are named by why, when and their name, never by an author, the live one marked; Restore asks the session, one restore at a time", () => {
  const restored: number[] = [];
  const session: Partial<Session> = {
    current: { ...open, published: { slug: "winter-series", versionNumber: 2, draftRevision: 1, publishedAt: "2026-09-28T07:02:00.000Z" } },
    versions: {
      phase: "ready",
      message: null,
      items: [
        version(4, "manual", "2026-10-02T08:20:00Z", { name: "Before the winter series" }),
        version(3, "auto", "2026-10-02T07:58:00Z"),
        version(2, "publish", "2026-09-28T07:02:00Z", { published: true }),
        version(1, "manual", "2026-09-27T21:15:00Z", { name: "First draft" }),
      ],
    },
    restoreVersion: async (number) => {
      restored.push(number);
    },
  };
  const kit = editorKit({ document: page(), session });
  const first = kit.render(<HistoryPanel />);
  const list = screen.getByRole("list", { name: "Versions" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows[0]!.textContent).toMatch(/^Current draft2 changes not published yet/);
  expect(rows.slice(1).map((r) => r.querySelector(".ver-kind")?.textContent)).toEqual(["Saved", "Autosaved", "Published, live now", "Saved"]);
  expect(rows[1]!.querySelector(".ver-name")?.textContent).toBe("Before the winter series");
  expect(rows[3]!.querySelector(".dot-live")).not.toBeNull();
  expect(list.textContent).not.toMatch(/\bby\b|\byou\b/);
  const restores = within(list).getAllByRole("button");
  expect(restores.map((b) => b.getAttribute("aria-label")?.replace(/, (Today|Yesterday|[A-Z][a-z]{2} \d+), .*$/, ""))).toEqual([
    "Restore: Saved, Before the winter series", "Restore: Autosaved", "Restore: Published", "Restore: Saved, First draft",
  ]);

  fireEvent.click(restores[2]!);
  expect(restored).toEqual([2]);
  first.unmount();

  // While a restore is on its way, the session says which, and no other
  // one starts; the buttons stay where they are, for the focus.
  const busy = editorKit({ document: page(), session: { ...session, restoring: 2 } });
  busy.render(<HistoryPanel />);
  const buttons = within(screen.getByRole("list", { name: "Versions" })).getAllByRole("button");
  expect(buttons[2]!.textContent).toBe("Restoring…");
  expect(buttons.every((b) => b.getAttribute("aria-disabled") === "true")).toBe(true);
  fireEvent.click(buttons[0]!);
  expect(restored).toEqual([2]);
});

test("Save version asks for a name in the panel, keeps it through the session, and shows the CMS's refusal of it at the field", async () => {
  const asked: string[] = [];
  let answer: FieldError[] | null = [{ pointer: "/name", keyword: "invalid", blockPointer: null, message: "must be one line of text with a visible character, at most 80 characters" }];
  const kit = editorKit({
    document: page(),
    session: {
      current: open,
      versions: { ...NO_VERSIONS, phase: "ready" },
      saveVersion: async (name) => {
        asked.push(name);
        return answer;
      },
    },
  });
  // In strict mode, as the editor runs: its effects run, are undone and run
  // again, and the form must still close once the version is kept.
  kit.render(<StrictMode><HistoryPanel /></StrictMode>);
  const save = screen.getByRole("button", { name: "Save version" });
  expect(save.getAttribute("aria-keyshortcuts")).toBe("Control+S");
  fireEvent.click(save);
  expect(kit.ui.getState().namingVersion).toBe(true);
  const name = screen.getByRole("textbox", { name: /^Name/ });
  await waitFor(() => expect(document.activeElement).toBe(name));
  fireEvent.change(name, { target: { value: "Before the winter series" } });
  fireEvent.submit(name.closest("form")!);
  await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"));
  expect(asked).toEqual(["Before the winter series"]);
  expect(screen.getByText("A name is one line of visible text, at most 80 characters.")).toBeTruthy();

  // Too long a name is said before anything is sent.
  fireEvent.change(name, { target: { value: "x".repeat(81) } });
  expect(screen.getByText("A name has at most 80 characters.")).toBeTruthy();
  fireEvent.submit(name.closest("form")!);
  expect(asked).toHaveLength(1);

  answer = null;
  fireEvent.change(name, { target: { value: "Kept" } });
  fireEvent.submit(name.closest("form")!);
  await waitFor(() => expect(kit.ui.getState().namingVersion).toBe(false));
  expect(asked).toEqual(["Before the winter series", "Kept"]);
  expect(screen.queryByRole("textbox", { name: /^Name/ })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save version" }));

  // Esc lets the name go.
  fireEvent.click(screen.getByRole("button", { name: "Save version" }));
  fireEvent.keyDown(screen.getByRole("textbox", { name: /^Name/ }), { key: "Escape" });
  expect(kit.ui.getState().namingVersion).toBe(false);
  expect(asked).toHaveLength(2);
});

test("a failed read of the versions says why, keeps the list, and tries again on request", () => {
  let reads = 0;
  const kit = editorKit({
    document: page(),
    session: {
      current: open,
      versions: { phase: "failed", items: [version(1, "auto", "2026-10-02T07:58:00Z")], message: "The versions could not be read: no network" },
      loadVersions: () => {
        reads += 1;
      },
    },
  });
  kit.render(<HistoryPanel />);
  // Read once as the panel opens.
  expect(reads).toBe(1);
  expect(screen.getByText("The versions could not be read: no network")).toBeTruthy();
  expect(within(screen.getByRole("list", { name: "Versions" })).getAllByRole("listitem")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(reads).toBe(2);
});

test("a publish set for a time waits under the draft, by the site's clock, and Cancel asks the session", async () => {
  let cancelled = 0;
  const scheduled = { id: 3, at: "2026-10-05T06:15:00.000Z", revision: 3, versionNumber: 2, state: "pending", createdAt: "2026-10-02T08:00:00.000Z", settledAt: null, publishedVersionNumber: null } as const;
  const kit = editorKit({
    document: page(),
    session: {
      current: { ...open, scheduled },
      capabilities: { publish: true, schedule: true, responses: false, imageVariants: false },
      versions: { phase: "ready", items: [version(2, "scheduled", "2026-10-02T08:00:00Z")], message: null },
      cancelSchedule: async () => {
        cancelled += 1;
      },
    },
  });
  kit.ui.getState().setSite({ name: "Slack Water", menu: [], action: null, footer: { lead: "", text: "" }, timeZone: "Europe/London" });
  kit.render(<HistoryPanel />);
  const rows = within(screen.getByRole("list", { name: "Versions" })).getAllByRole("listitem");
  expect(rows.map((row) => row.querySelector(".ver-kind")?.textContent)).toEqual(["Current draft", "Scheduled publish", "Kept for a scheduled publish"]);
  expect(rows[1]!.querySelector(".ver-name")!.textContent).toBe("Goes live Oct 5 at 7:15 AM (UTC+1)");
  await act(async () => fireEvent.click(within(rows[1]!).getByRole("button", { name: "Cancel the publish scheduled for Oct 5 at 7:15 AM (UTC+1)" })));
  expect(cancelled).toBe(1);
});

test("a publish whose time has passed without going live is listed as one that should have gone live", () => {
  // The kit's clock reads Oct 2, 9:00 UTC: the time was an hour ago.
  const scheduled = { id: 3, at: "2026-10-02T08:00:00.000Z", revision: 3, versionNumber: 2, state: "pending", createdAt: "2026-10-01T08:00:00.000Z", settledAt: null, publishedVersionNumber: null } as const;
  const kit = editorKit({
    document: page(),
    session: {
      current: { ...open, scheduled },
      capabilities: { publish: true, schedule: true, responses: false, imageVariants: false },
      versions: { phase: "ready", items: [version(2, "scheduled", "2026-10-01T08:00:00Z")], message: null },
    },
  });
  kit.ui.getState().setSite({ name: "Slack Water", menu: [], action: null, footer: { lead: "", text: "" }, timeZone: "Europe/London" });
  kit.render(<HistoryPanel />);

  const rows = within(screen.getByRole("list", { name: "Versions" })).getAllByRole("listitem");
  expect(rows[1]!.querySelector(".ver-name")!.textContent).toBe("Should have gone live Oct 2 at 9:00 AM (UTC+1)");
});

test("the top bar's undo and redo run the store's history, name the step they would undo or redo, and with nothing to do say so", () => {
  const kit = editorKit({ document: page(), session: { current: open } });
  kit.render(<TopBar />);
  const undo = screen.getByRole("button", { name: "Undo" });
  const redo = screen.getByRole("button", { name: "Redo" });
  expect(undo.getAttribute("aria-disabled")).toBe("true");
  expect(undo.getAttribute("title")).toBe("Nothing to undo");
  fireEvent.click(undo);
  expect(kit.ui.getState().notice).toBe("There is nothing to undo.");

  let pages: PageDocument[] = [];
  act(() => {
    pages = threeSteps(kit);
    kit.ui.getState().say(null);
  });
  expect(undo.getAttribute("aria-disabled")).toBeNull();
  expect(undo.getAttribute("title")).toBe("Undo “Deleted Quote in Join” (Ctrl+Z)");
  expect(undo.getAttribute("aria-keyshortcuts")).toBe("Control+Z");
  fireEvent.click(undo);
  expect(kit.doc()).toEqual(pages[2]);
  expect(redo.getAttribute("title")).toBe("Redo “Deleted Quote in Join” (Ctrl+Shift+Z)");
  fireEvent.click(redo);
  expect(kit.doc()).toEqual(pages[3]);
  expect(redo.getAttribute("aria-disabled")).toBe("true");

  const history = screen.getByRole("button", { name: "History" });
  expect(history.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(history);
  expect(kit.ui.getState().historyOpen).toBe(true);
  expect(history.getAttribute("aria-pressed")).toBe("true");
});
