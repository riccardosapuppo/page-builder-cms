// Where the edits are, as the person sees and hears it, from the real
// autosave on the kit's fake clock and a CMS whose answers the test holds
// back and gives: "Saved" only when it is so; a countdown to the next try
// that a screen reader is not read; a toast that
// says why, with Retry now sending the same save at once; the conflict's
// banner, an alert, with Reload and Keep mine.
// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { editorKit } from "../../test/editor-kit.tsx";
import { page } from "../../test/document-page.ts";
import type { PageDocument } from "../shared/document.ts";
import { StorageError, type Conflict, type DraftSave, type DraftSaved, type Invalid, type Outcome } from "../storage/adapter.ts";
import { createAutosave } from "../storage/autosave.ts";
import { ConflictBanner, RELOAD_ONLY, SaveState, SaveToast, thisTab } from "./SaveStatus.tsx";
import { emptySession, SessionProvider } from "./session.tsx";
import { EditorProvider } from "./context.tsx";

type Answer = Outcome<DraftSaved, Conflict | Invalid>;

// A CMS whose every answer the test gives by hand.
function heldCms() {
  const sent: DraftSave[] = [];
  const waiting: Array<{ resolve: (answer: Answer) => void; reject: (error: unknown) => void }> = [];
  return {
    sent,
    adapter: {
      getDraft: async () => ({ revision: 9, lastSaveId: "other", updatedAt: "2026-10-02T09:00:00.000Z", document: page() }),
      saveDraft: (_id: number, save: DraftSave) => {
        sent.push(save);
        return new Promise<Answer>((resolve, reject) => waiting.push({ resolve, reject }));
      },
    },
    answer(revision: number) {
      waiting.shift()!.resolve({ ok: true, value: { revision, lastSaveId: sent.at(-1)!.saveId, updatedAt: "2026-10-02T09:05:00.000Z" } });
    },
    conflict() {
      waiting.shift()!.resolve({ ok: false, problem: { kind: "conflict", message: "moved", currentRevision: 9, lastSaveId: "other" } });
    },
    refuse(code: string, message: string) {
      waiting.shift()!.reject(new StorageError({ kind: "refused", status: 0, code, message }));
    },
    fail(cause: "network" | "timeout" | "server") {
      waiting.shift()!.reject(new StorageError({ kind: "unknown", cause, status: cause === "server" ? 502 : null, message: `${cause} failed` }));
    },
  };
}

function setUp(sessionChanges: Parameters<typeof emptySession>[0] = {}) {
  const kit = editorKit({ document: page() });
  const cms = heldCms();
  const autosave = createAutosave({ adapter: cms.adapter, pageId: 1, revision: 3, document: kit.doc(), savedAt: "2026-10-02T08:00:00.000Z", clock: kit.clock, newSaveId: (() => { let n = 0; return () => `save-${++n}`; })() });
  const session = emptySession({ autosave, ...sessionChanges });
  render(
    <EditorProvider env={kit.env}>
      <SessionProvider value={session}>
        <SaveState />
        <ConflictBanner />
        <SaveToast />
      </SessionProvider>
    </EditorProvider>,
  );
  const edit = (title: string) => act(() => autosave.edit({ ...kit.doc(), title } as PageDocument));
  return { kit, cms, autosave, edit };
}

const shown = () => document.querySelector(".save-state")?.textContent;
const status = () => document.querySelector(".save-state")!;
// What a screen reader is read of the status: its text without the parts
// hidden from it.
const heard = (element: Element) => {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll("[aria-hidden=true]").forEach((hidden) => hidden.remove());
  return copy.textContent;
};

test("Saved only when the server has every edit: Saving…, unheard, from the first edit it has not", async () => {
  const { kit, cms, edit } = setUp();
  expect(shown()).toBe("Saved");
  await edit("One");
  expect(shown()).toBe("Saving…");
  expect(heard(status())).toBe("");
  expect(status().getAttribute("title")).toBe("Saving your 1 change. Keep editing.");
  // The pause before a save (1 s) runs out: the save leaves, still Saving….
  await act(() => kit.clock.advance(1_000));
  expect(cms.sent).toHaveLength(1);
  expect(shown()).toBe("Saving…");
  await act(async () => cms.answer(4));
  expect(shown()).toBe("Saved");
  expect(heard(status())).toBe("Saved");
  expect(status().getAttribute("title")).toMatch(/^All 1 change saved at Oct 2 at /);
});

test("an unknown outcome counts down to the next try, unheard, and the toast says why and sends the same save again", async () => {
  const { kit, cms, autosave, edit } = setUp();
  await edit("Two");
  await act(() => kit.clock.advance(1_000));
  await act(async () => cms.fail("network"));
  expect(shown()).toBe("Not saved, retrying in 2 s");
  expect(heard(status())).toBe("Not saved, retrying");
  await act(() => kit.clock.advance(1_000));
  expect(shown()).toBe("Not saved, retrying in 1 s");

  const toast = screen.getByRole("group", { name: "Not saved" });
  expect(toast.querySelector("p")?.textContent).toBe("Connection lost. Your change is kept in this tab and saved when the connection is back.");
  fireEvent.click(within(toast).getByRole("button", { name: "Retry now" }));
  expect(cms.sent).toHaveLength(2);
  expect(cms.sent[1]).toEqual(cms.sent[0]);
  expect(within(screen.getByRole("group", { name: "Not saved" })).getByRole("status").textContent).toBe("Trying again…");
  // Answered: saved, and the toast goes.
  await act(async () => cms.answer(4));
  expect(shown()).toBe("Saved");
  expect(screen.queryByRole("group", { name: "Not saved" })).toBeNull();
  expect(autosave.getSnapshot().warnOnClose).toBe(false);
});

test("the toast's first words say what happened", async () => {
  for (const [cause, lead] of [["timeout", "The CMS did not answer in time."], ["server", "The CMS failed to save (error 502)."]] as const) {
    const { kit, cms, edit } = setUp();
    await edit(cause);
    await act(() => kit.clock.advance(1_000));
    await act(async () => cms.fail(cause));
    expect(screen.getByRole("group", { name: "Not saved" }).querySelector("strong")?.textContent).toBe(lead);
    document.body.innerHTML = "";
  }
});

const FULL = "This browser has no room left for the editor's pages and images: delete images from the library, or let this site keep more in the browser's settings.";

test("a save the storage refuses says why in words on the page, as an alert with Try again; the top bar keeps the reason as its tooltip too", async () => {
  const { kit, cms, edit } = setUp();
  await edit("Refused");
  await act(() => kit.clock.advance(1_000));
  expect(screen.queryByRole("alert")).toBeNull();
  await act(async () => cms.refuse("quota_exceeded", FULL));
  expect(shown()).toBe("Not saved");
  // Words a person reads, not a title attribute only.
  const alert = screen.getByRole("alert");
  expect(alert.querySelector("strong")?.textContent).toBe("Not saved.");
  expect(alert.querySelector("p")?.textContent).toBe(`Not saved. ${FULL}`);
  expect(status().getAttribute("title")).toBe(FULL);
  // Try again sends the same save again; refused again, the words stay.
  await act(async () => fireEvent.click(within(alert).getByRole("button", { name: "Try again" })));
  expect(cms.sent).toHaveLength(2);
  await act(async () => cms.refuse("quota_exceeded", FULL));
  expect(screen.getByRole("alert").querySelector("p")?.textContent).toBe(`Not saved. ${FULL}`);
  // Once a save goes through (room was made), the words go.
  await act(async () => fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Try again" })));
  await act(async () => cms.answer(4));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(shown()).toBe("Saved");
});

const RELOAD = {
  storage_upgraded: "A newer version of the editor, open in another tab, has upgraded this browser's storage: reload this tab to go on.",
  storage_deleted: "This browser's storage for the editor was deleted in another tab: reload this tab.",
  storage_newer: "This browser's storage was made by a newer version of the editor: reload this tab to get it.",
};

test("a refusal only a reload gets past (the storage upgraded, deleted, or newer) offers Reload this tab, which reloads it, and no Try again, which could only be refused again", async () => {
  const reloads = vi.spyOn(thisTab, "reload").mockImplementation(() => {});
  try {
    for (const [code, words] of Object.entries(RELOAD)) {
      const { kit, cms, edit } = setUp();
      await edit(code);
      await act(() => kit.clock.advance(1_000));
      await act(async () => cms.refuse(code, words));
      const alert = screen.getByRole("alert");
      expect(alert.querySelector("p")?.textContent).toBe(`Not saved. ${words}`);
      expect(within(alert).queryByRole("button", { name: "Try again" })).toBeNull();
      const before = reloads.mock.calls.length;
      await act(async () => fireEvent.click(within(alert).getByRole("button", { name: "Reload this tab" })));
      expect(reloads.mock.calls.length, code).toBe(before + 1);
      // Nothing sent again behind the reload.
      expect(cms.sent, code).toHaveLength(1);
      document.body.innerHTML = "";
    }
  } finally {
    reloads.mockRestore();
  }
  // The set is these three: a storage held up by an older tab keeps Try again.
  expect([...RELOAD_ONLY].sort()).toEqual(Object.keys(RELOAD).sort());
});

test("in the browser demo the toast and the tooltips name this browser's storage, not a CMS or a server", async () => {
  const { kit, cms, edit } = setUp({ cmsOrigin: null });
  await edit("No answer");
  await act(() => kit.clock.advance(1_000));
  await act(async () => cms.fail("timeout"));
  expect(screen.getByRole("group", { name: "Not saved" }).querySelector("strong")?.textContent).toBe("This browser's storage did not answer in time.");
  expect(status().getAttribute("title")).toBe("This browser's storage did not answer in time. The editor sends the same save again until it answers.");
});

test("a conflict raises the banner as an alert, and its two buttons are the session's reload and keep mine", async () => {
  const chosen: string[] = [];
  const { kit, cms, edit } = setUp({ reload: async () => { chosen.push("reload"); }, keepMine: () => { chosen.push("keep"); } });
  await edit("Three");
  await act(() => kit.clock.advance(1_000));
  await act(async () => cms.conflict());
  expect(shown()).toBe("Changed in another tab");
  // The banner is what is heard.
  expect(heard(status())).toBe("");
  const banner = screen.getByRole("alert");
  expect(banner.textContent).toContain("Changed in another tab. This page was saved in another tab after you opened it. Saving is paused until you choose.");
  await act(async () => fireEvent.click(within(banner).getByRole("button", { name: "Reload" })));
  await act(async () => fireEvent.click(within(banner).getByRole("button", { name: "Keep mine" })));
  expect(chosen).toEqual(["reload", "keep"]);
});
