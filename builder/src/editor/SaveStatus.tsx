// Where the page's edits are (design/shots/save-states.png), from the
// autosave's snapshot (../storage/autosave.ts), said in three places:
//
// - the top bar's save state: "Saved" only when the server has every edit;
//   "Saving…" from the first edit it does not have (the design waits half
//   a second first, but with the autosave's one-second pause before a save
//   that half second would show "Saved" over edits that are only in this
//   tab); "Not saved, retrying in 8 s", counting down on the injected
//   clock; "Changed in another tab"; or why the server refused the save.
//   Screen readers hear "Saved" and "Not saved, retrying" once each,
//   nothing while a save is on its way, and not the countdown;
// - the conflict banner under the top bar, an alert, with Reload and Keep
//   mine: saving and publishing wait for the choice, and either choice can
//   be undone from the history (./App.tsx says how);
// - a toast while a save's outcome is unknown, saying why and offering
//   Retry now, which sends the very same save at once.
//
// The page's save is never mixed with publishing (./Publish.tsx) or with
// the site style's own save (./SiteStylePanel.tsx).
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Failure } from "../storage/adapter.ts";
import type { SaveSnapshot } from "../storage/autosave.ts";
import { placeFocus } from "./act.ts";
import { useEnv } from "./context.tsx";
import { Icon } from "./icons.tsx";
import { keptWords, useSession } from "./session.tsx";

type Words = ReturnType<typeof keptWords>;

const NEVER: SaveSnapshot | null = null;
const noSubscription = () => () => {};

export function useSaveSnapshot(): SaveSnapshot | null {
  const { autosave } = useSession();
  return useSyncExternalStore(autosave ? autosave.subscribe : noSubscription, autosave ? autosave.getSnapshot : () => NEVER);
}

// "1 change", "6 changes".
export const changes = (n: number): string => `${n} ${n === 1 ? "change" : "changes"}`;

// "Sep 28 at 7:02 AM", in the editor's one locale.
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

// The clock's time, redrawn every `everyMs` while `active`: one timer at a
// time, each set by the one before, cleared when the drawing goes. The
// timers only ask for a drawing; the time drawn is read as it is drawn.
function useTicking(active: boolean, everyMs: number): number {
  const { clock } = useEnv();
  const [, setTicks] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    let timer: ReturnType<typeof clock.setTimeout> | null = null;
    const tick = () => {
      setTicks((n) => n + 1);
      timer = clock.setTimeout(tick, everyMs);
    };
    timer = clock.setTimeout(tick, everyMs);
    return () => {
      if (timer !== null) clock.clearTimeout(timer);
    };
  }, [active, clock, everyMs]);
  return clock.now();
}

interface Said {
  className: string;
  icon: "check" | "spinner" | "warning" | "error";
  // Heard by screen readers, or shown only.
  text: string;
  heard: boolean;
  // Shown after the text and never heard (the countdown).
  more?: string;
  title?: string;
}

function describe(snapshot: SaveSnapshot, now: number, words: Words): Said {
  switch (snapshot.phase) {
    case "waiting":
    case "saving":
      // The same save sent again after an unknown outcome is still a retry.
      if (snapshot.outcomeUnknown) return { className: "save-state save-warn", icon: "warning", text: "Not saved, retrying", heard: true, title: failureLine(snapshot.failure, words) };
      return { className: "save-state", icon: "spinner", text: "Saving…", heard: false, title: `Saving your ${changes(Math.max(1, snapshot.unsavedEdits))}. Keep editing.` };
    case "saved": {
      const all = snapshot.savedEdits > 0 ? `All ${changes(snapshot.savedEdits)}` : "All changes";
      return { className: "save-state", icon: "check", text: "Saved", heard: true, ...(snapshot.savedAt ? { title: `${all} saved at ${when(snapshot.savedAt)}` } : {}) };
    }
    case "retrying": {
      const seconds = snapshot.retryAt === null ? null : Math.max(1, Math.ceil((snapshot.retryAt - now) / 1000));
      return { className: "save-state save-warn", icon: "warning", text: "Not saved, retrying", heard: true, ...(seconds === null ? {} : { more: ` in ${seconds} s` }), title: failureLine(snapshot.failure, words) };
    }
    case "conflict":
      // The banner is the alert; the top bar only shows it.
      return { className: "save-state save-warn", icon: "warning", text: "Changed in another tab", heard: false };
    case "invalid":
      return { className: "save-state save-err", icon: "error", text: "Not saved: a value was refused", heard: true, title: `${words.Server} refused a value: it is marked in the Outline and in the sidebar.` };
    case "refused":
      return { className: "save-state save-err", icon: "error", text: "Not saved", heard: true, ...(snapshot.failure ? { title: snapshot.failure.message } : {}) };
  }
}

// The top bar's save state.
export function SaveState() {
  const snapshot = useSaveSnapshot();
  const session = useSession();
  const now = useTicking(snapshot?.phase === "retrying" && snapshot.retryAt !== null, 1_000);
  if (!snapshot) return null;
  const said = describe(snapshot, now, keptWords(session.cmsOrigin));
  return (
    <span className={said.className} role="status" title={said.title}>
      <Icon name={said.icon} className={said.icon === "spinner" ? "i spin" : "i"} />
      <span>
        {said.heard ? said.text : <span aria-hidden="true">{said.text}</span>}
        {said.more && <span aria-hidden="true">{said.more}</span>}
      </span>
    </span>
  );
}

// Why a save's outcome is unknown, as its first words, and when it will be
// saved, from what the adapter says happened.
function failureWords(failure: Failure | null, words: Words): { lead: string; until: string } {
  if (failure?.kind !== "unknown") return { lead: "Not saved yet.", until: `${words.keeper} answers` };
  switch (failure.cause) {
    case "network":
      return { lead: "Connection lost.", until: "the connection is back" };
    case "timeout":
      return { lead: `${words.Keeper} did not answer in time.`, until: "it answers" };
    case "server":
      return { lead: `${words.Keeper} failed to save${failure.status === null ? "" : ` (error ${failure.status})`}.`, until: "it can" };
    case "unreadable":
      return { lead: `${words.Keeper}'s answer could not be read.`, until: "it answers" };
  }
}

function failureLine(failure: Failure | null, words: Words): string {
  const { lead, until } = failureWords(failure, words);
  return `${lead} The editor sends the same save again until ${until}.`;
}

// The refusals of the browser's storage that only a reload of this tab
// gets past, as their words say: the storage upgraded by a newer build in
// another tab, deleted in another tab, or made by a newer build. This tab
// has let go of it, or cannot open it, so the same save sent again is
// refused again. (Held up by an older tab, a save does go through once that
// tab is closed: Try again stays.)
export const RELOAD_ONLY: ReadonlySet<string> = new Set(["storage_upgraded", "storage_deleted", "storage_newer"]);

// Reloading this tab; a seam for the unit tests, where jsdom does not
// navigate. Edits this tab still holds make the browser ask first (the
// editor's beforeunload, ./App.tsx).
export const thisTab = { reload: (): void => window.location.reload() };

// While a save's outcome is unknown: why, what is kept, and Retry now. And
// when the storage refused the save (the document's fields are marked
// where they are; this is any other refusal: a newer build of the editor
// that upgraded the browser's storage in another tab, the storage deleted,
// full or failing, a refusal of the CMS): why, in words on the page, and
// Try again, or Reload this tab when only that can help. The top bar's
// tooltip says it too, but a tooltip is for the pointer alone.
export function SaveToast() {
  const session = useSession();
  const snapshot = useSaveSnapshot();
  if (!session.autosave) return null;
  const autosave = session.autosave;
  if (snapshot?.phase === "refused" && snapshot.failure) {
    const failure = snapshot.failure;
    const reloadOnly = failure.kind === "refused" && RELOAD_ONLY.has(failure.code);
    return (
      <div className="toast toast-save chrome" role="alert">
        <p><strong>Not saved.</strong> {failure.message}</p>
        {reloadOnly
          ? <button className="btn btn-small btn-secondary" type="button" onClick={() => thisTab.reload()}>Reload this tab</button>
          : <button className="btn btn-small btn-secondary" type="button" onClick={() => autosave.retryNow()}>Try again</button>}
      </div>
    );
  }
  if (!snapshot?.outcomeUnknown) return null;
  const { lead, until } = failureWords(snapshot.failure, keptWords(session.cmsOrigin));
  const kept = snapshot.unsavedEdits === 1 ? "Your change is" : snapshot.unsavedEdits > 1 ? `Your ${changes(snapshot.unsavedEdits)} are` : "Your changes are";
  return (
    <div className="toast toast-save chrome" role="group" aria-label="Not saved">
      <p><strong>{lead}</strong> {kept} kept in this tab and saved when {until}.</p>
      {snapshot.phase === "retrying"
        ? <button className="btn btn-small btn-secondary" type="button" onClick={() => autosave.retryNow()}>Retry now</button>
        : <span className="toast-busy" role="status">Trying again…</span>}
    </div>
  );
}

// Under the top bar, across the window, while the draft has moved on the
// server since this tab last saved it.
export function ConflictBanner() {
  const session = useSession();
  const snapshot = useSaveSnapshot();
  const [choosing, setChoosing] = useState(false);
  if (snapshot?.phase !== "conflict") return null;
  const choose = async (choice: () => Promise<void> | void) => {
    setChoosing(true);
    try {
      await choice();
    } finally {
      setChoosing(false);
      // The banner and its buttons go: the focus goes back to the page.
      placeFocus(null, "canvas");
    }
  };
  return (
    <div className="banner-inplace chrome" role="alert">
      <Icon name="warning" />
      <p><strong>Changed in another tab.</strong> This page was saved in another tab after you opened it. Saving is paused until you choose.</p>
      <div className="banner-actions">
        <button className="btn btn-small btn-dark" type="button" disabled={choosing} title={`Take the page as it is ${keptWords(session.cmsOrigin).there}; Undo brings this tab's page back`} onClick={() => void choose(session.reload)}>Reload</button>
        <button className="btn btn-small btn-secondary" type="button" disabled={choosing} title={`Save this tab's page over the one ${keptWords(session.cmsOrigin).there}, which is kept in Versions first`} onClick={() => void choose(session.keepMine)}>Keep mine</button>
      </div>
    </div>
  );
}
